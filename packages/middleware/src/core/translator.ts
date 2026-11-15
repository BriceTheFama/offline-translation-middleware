import { buildCacheKey } from '../cache/cache.interface.js';
import { supportsBatch } from '../engines/translation-engine.js';
import type {
  PathSegment,
  TranslationResult,
  TranslationStats,
  Translator,
  TranslatorOptions,
} from '../types/index.js';
import { chunk, mapWithConcurrency } from '../utils/concurrency.js';
import { toError } from './errors.js';
import {
  applyTranslations,
  collectTranslatableSlots,
  isContainer,
  isEmptyPayload,
  type TranslatableSlot,
} from './json-traverser.js';
import { matchSupportedLanguage } from './language-detector.js';
import { resolveTranslatorOptions, type ResolvedTranslatorOptions } from './options.js';

/**
 * The whole pipeline, framework-free: collect, deduplicate, look the texts up
 * in the cache, translate what is left, write the results back into a copy.
 */
export class ResponseTranslator implements Translator {
  private readonly config: ResolvedTranslatorOptions;

  constructor(readonly options: Readonly<TranslatorOptions>) {
    this.config = resolveTranslatorOptions(options);
  }

  get resolvedOptions(): ResolvedTranslatorOptions {
    return this.config;
  }

  async translateResponse<T>(response: T, targetLanguage?: string): Promise<T> {
    const result = await this.translateResponseWithStats(response, targetLanguage);
    return result.value;
  }

  async translateResponseWithStats<T>(
    response: T,
    targetLanguage?: string,
  ): Promise<TranslationResult<T>> {
    const startedAt = performance.now();
    const target = targetLanguage ?? this.config.defaultLanguage;
    const source = this.config.sourceLanguage;
    const stats = emptyStats(source, target);

    const finish = (value: T, translated: boolean): TranslationResult<T> => {
      stats.durationMs = round(performance.now() - startedAt);
      this.config.onTranslationComplete?.(stats);
      return { value, translated, stats };
    };

    if (source === target && !this.config.perValueSourceLanguage) return finish(response, false);
    if (isEmptyPayload(response) || !isContainer(response)) return finish(response, false);

    const collected = collectTranslatableSlots(response, {
      include: this.config.include,
      exclude: this.config.exclude,
      maxTextLength: this.config.maxTextLength,
      maxDepth: this.config.maxDepth,
      maxResponseSize: this.config.maxResponseSize,
      isTranslatableText: this.config.isTranslatableText,
      shouldTranslateValue: this.config.shouldTranslateValue,
      resolveSource: this.config.perValueSourceLanguage
        ? (text, path, parent) => this.resolveSourceLanguage(text, path, parent)
        : undefined,
    });

    if (collected.exceededSize) {
      this.config.logger.warn(
        `response above maxResponseSize (${this.config.maxResponseSize} chars), left untranslated`,
      );
      return finish(response, false);
    }

    stats.totalFields = collected.slots.length;

    // Texts grouped by the language they are written in; a text already in the
    // target language has nothing to gain from a model and is left out.
    const slots: TranslatableSlot[] = [];
    const bySource = new Map<string, Set<string>>();
    for (const slot of collected.slots) {
      const slotSource = this.config.perValueSourceLanguage ? slot.source : source;
      if (slotSource === undefined) {
        stats.unknownLanguage++;
        continue;
      }
      if (slotSource === target) {
        stats.alreadyInTargetLanguage++;
        continue;
      }
      slots.push(slot);
      let texts = bySource.get(slotSource);
      if (!texts) bySource.set(slotSource, (texts = new Set()));
      texts.add(slot.text);
    }

    for (const texts of bySource.values()) stats.uniqueTexts += texts.size;
    if (slots.length === 0) return finish(response, false);

    const translations = new Map<string, Map<string, string>>();
    for (const [slotSource, texts] of bySource) {
      translations.set(
        slotSource,
        await this.resolveTranslations([...texts], slotSource, target, stats),
      );
    }

    const applied = applyTranslations(response, slots, (text, slotSource) =>
      translations.get(slotSource ?? source)?.get(text),
    );
    stats.translatedFields = applied.replaced;

    const result = finish(applied.value, applied.replaced > 0);
    this.logSummary(stats);
    return result;
  }

  async translateText(text: string, targetLanguage?: string): Promise<string> {
    const target = targetLanguage ?? this.config.defaultLanguage;
    if (!this.config.isTranslatableText(text)) return text;

    const source = this.config.perValueSourceLanguage
      ? this.resolveSourceLanguage(text, [], [text])
      : this.config.sourceLanguage;
    if (source === undefined || source === target) return text;

    const stats = emptyStats(source, target);
    const translations = await this.resolveTranslations([text], source, target, stats);
    return translations.get(text) ?? text;
  }

  /**
   * The language one value is written in: the resolver's answer, then the
   * detector's, then `sourceLanguage` — or `undefined` under
   * `undetectedLanguage: 'skip'`. Only a supported language is accepted from
   * detection: a guess must never route a text to a model nobody set up.
   */
  private resolveSourceLanguage(
    text: string,
    path: PathSegment[],
    parent: Record<string, unknown> | unknown[],
  ): string | undefined {
    const { sourceLanguageResolver, detectSourceLanguage, sourceLanguages } = this.config;

    const declared = sourceLanguageResolver?.(text, { path, parent });
    if (declared) return matchSupportedLanguage(declared, sourceLanguages) ?? declared;

    const detected = detectSourceLanguage?.(text);
    if (detected) {
      const matched = matchSupportedLanguage(detected, sourceLanguages);
      if (matched) return matched;
    }

    return this.config.undetectedLanguage === 'skip' ? undefined : this.config.sourceLanguage;
  }

  /** Cache first, engine for the rest. */
  private async resolveTranslations(
    texts: readonly string[],
    source: string,
    target: string,
    stats: TranslationStats,
  ): Promise<Map<string, string>> {
    const translations = new Map<string, string>();
    const missing: string[] = [];

    for (const text of texts) {
      const cached = this.config.cacheEnabled
        ? this.config.cache.get(buildCacheKey(source, target, text))
        : undefined;
      if (cached === undefined) missing.push(text);
      else {
        translations.set(text, cached);
        stats.cacheHits++;
      }
    }

    if (missing.length === 0) return translations;

    stats.engineCalls += missing.length;
    const translated = await this.callEngine(missing, source, target, stats);

    for (let index = 0; index < missing.length; index++) {
      const text = missing[index] as string;
      const value = translated[index];
      if (typeof value !== 'string' || value.length === 0) continue;
      translations.set(text, value);
      if (this.config.cacheEnabled) {
        this.config.cache.set(buildCacheKey(source, target, text), value);
      }
    }

    return translations;
  }

  /**
   * Uses `translateBatch` when the engine has one, and degrades to per-text
   * calls when a batch fails, so a single bad string cannot sink its neighbours.
   */
  private async callEngine(
    texts: readonly string[],
    source: string,
    target: string,
    stats: TranslationStats,
  ): Promise<(string | undefined)[]> {
    const { engine, concurrency, batchSize } = this.config;

    if (!supportsBatch(engine)) {
      return mapWithConcurrency(texts, concurrency, (text) =>
        this.translateOne(text, source, target, stats),
      );
    }

    const batches = chunk(texts, batchSize);
    const results = await mapWithConcurrency(batches, concurrency, async (batch) => {
      try {
        const output = await engine.translateBatch(batch.slice(), source, target);
        if (!Array.isArray(output) || output.length !== batch.length) {
          throw new Error(
            `translateBatch returned ${Array.isArray(output) ? output.length : 'a non-array'} results for ${batch.length} inputs`,
          );
        }
        return output as (string | undefined)[];
      } catch (error) {
        if (this.config.failureMode === 'throw') throw error;
        // Retrying one by one turns a batch-wide failure into per-text errors,
        // so a single bad string cannot sink its neighbours. The batch error is
        // not reported: the retry produces the accurate ones.
        this.config.logger.debug(`batch failed, retrying individually: ${toError(error).message}`);
        return mapWithConcurrency(batch, 1, (text) =>
          this.translateOne(text, source, target, stats),
        );
      }
    });

    return results.flat();
  }

  private async translateOne(
    text: string,
    source: string,
    target: string,
    stats: TranslationStats,
  ): Promise<string | undefined> {
    try {
      return await this.config.engine.translate(text, source, target);
    } catch (error) {
      if (this.config.failureMode === 'throw') throw error;
      stats.errors++;
      this.report(toError(error), text, source, target);
      return undefined;
    }
  }

  private report(error: Error, text: string, source: string, target: string): void {
    this.config.onTranslationError?.(error, {
      text,
      sourceLanguage: source,
      targetLanguage: target,
    });
    this.config.logger.debug(`engine error: ${error.message}`);
  }

  private logSummary(stats: TranslationStats): void {
    if (!this.config.logger.enabled) return;
    this.config.logger.debug(
      `target=${stats.targetLanguage} fields=${stats.totalFields} unique=${stats.uniqueTexts} ` +
        `cacheHits=${stats.cacheHits} translated=${stats.translatedFields} errors=${stats.errors} ` +
        `alreadyInTarget=${stats.alreadyInTargetLanguage} unknown=${stats.unknownLanguage} ` +
        `duration=${stats.durationMs}ms`,
    );
  }
}

/** Framework-free entry point: same pipeline, no Express involved. */
export function createTranslator(options: TranslatorOptions): Translator {
  return new ResponseTranslator(options);
}

function emptyStats(sourceLanguage: string, targetLanguage: string): TranslationStats {
  return {
    sourceLanguage,
    targetLanguage,
    totalFields: 0,
    uniqueTexts: 0,
    translatedFields: 0,
    cacheHits: 0,
    engineCalls: 0,
    errors: 0,
    alreadyInTargetLanguage: 0,
    unknownLanguage: 0,
    durationMs: 0,
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
