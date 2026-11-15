import type {
  LocalTranslationEngineOptions,
  TransformersModule,
  TranslationPipeline,
  TranslationPipelineOutput,
} from './types.js';

/**
 * Structural copy of the middleware's engine contract.
 *
 * Duplicated on purpose: this package stays usable — and installable — without
 * the middleware.
 */
export interface TranslationEngineLike {
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;
  translateBatch?(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]>;
  readonly name?: string;
}

const DEFAULT_MAX_NEW_TOKENS = 512;

/**
 * Runs OPUS-MT models locally through Transformers.js and ONNX Runtime.
 *
 * The first call for a language pair downloads the model (about 40 MB in `q8`);
 * everything after that runs offline, in-process, with no API key and no
 * outbound request.
 */
export class LocalTranslationEngine implements TranslationEngineLike {
  readonly name = 'local';

  /** Keyed by model id, so `fr-CA` and `fr` share one loaded model. */
  private readonly pipelines = new Map<string, Promise<TranslationPipeline>>();
  /** Inference is single-threaded per session, so calls are queued per model. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private module?: TransformersModule;

  constructor(private readonly options: LocalTranslationEngineOptions = {}) {}

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
    const [translated] = await this.translateBatch([text], sourceLanguage, targetLanguage);
    return translated ?? text;
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];
    if (baseLanguage(sourceLanguage) === baseLanguage(targetLanguage)) return [...texts];

    const modelId = this.resolveModelId(sourceLanguage, targetLanguage);
    const pipeline = await this.getPipeline(modelId);

    return this.enqueue(modelId, async () => {
      const output = await pipeline(texts, {
        max_new_tokens: this.options.maxNewTokens ?? DEFAULT_MAX_NEW_TOKENS,
      });
      const results = Array.isArray(output) ? output : [output];
      return results.map((result, index) => {
        const source = texts[index] as string;
        const translated = readText(result);
        if (translated === undefined) return source;
        return this.options.keepAddedPeriod ? translated : dropAddedPeriod(source, translated);
      });
    });
  }

  /** Loads a model ahead of the first request, so no user pays for the warm-up. */
  async warmup(sourceLanguage: string, targetLanguage: string): Promise<void> {
    await this.getPipeline(this.resolveModelId(sourceLanguage, targetLanguage));
  }

  /**
   * Resolves the model id used for a language pair, without loading it.
   *
   * Regional tags fall back to their base language: OPUS-MT has no `fr-CA`
   * model, so `en > fr-CA` uses `Xenova/opus-mt-en-fr`. An explicit `models`
   * entry for the exact regional pair still wins.
   */
  resolveModelId(sourceLanguage: string, targetLanguage: string): string {
    const source = baseLanguage(sourceLanguage);
    const target = baseLanguage(targetLanguage);

    const explicit =
      this.options.models?.[`${sourceLanguage}>${targetLanguage}`] ??
      this.options.models?.[`${source}>${target}`];
    if (explicit) return explicit;

    const resolved = this.options.modelResolver?.(sourceLanguage, targetLanguage);
    if (typeof resolved === 'string') return resolved;
    if (resolved) return resolved.modelId;

    return `Xenova/opus-mt-${source}-${target}`;
  }

  private async getPipeline(modelId: string): Promise<TranslationPipeline> {
    const existing = this.pipelines.get(modelId);
    if (existing) return existing;

    const loading = this.loadPipeline(modelId);
    this.pipelines.set(modelId, loading);

    try {
      return await loading;
    } catch (error) {
      // A failed load must not poison the cache; the next request retries.
      this.pipelines.delete(modelId);
      throw error;
    }
  }

  private async loadPipeline(modelId: string): Promise<TranslationPipeline> {
    const module = await this.loadModule();
    this.options.onModelLoad?.(modelId);

    if (this.options.cacheDir) module.env.cacheDir = this.options.cacheDir;
    if (this.options.localModelPath) module.env.localModelPath = this.options.localModelPath;
    if (this.options.allowRemoteModels !== undefined) {
      module.env.allowRemoteModels = this.options.allowRemoteModels;
    }

    return module.pipeline('translation', modelId, { dtype: this.options.dtype ?? 'q8' });
  }

  private async loadModule(): Promise<TransformersModule> {
    if (this.module) return this.module;
    if (this.options.transformers) {
      this.module = this.options.transformers;
      return this.module;
    }

    const load = this.options.importTransformers ?? (() => import('@huggingface/transformers'));

    try {
      this.module = (await load()) as TransformersModule;
      return this.module;
    } catch (error) {
      throw new Error(
        '@offline-translator/local needs its peer dependency: npm install @huggingface/transformers. ' +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Serialises calls per model; one ONNX session cannot run in parallel. */
  private enqueue<T>(modelId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(modelId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    this.queues.set(
      modelId,
      next.catch(() => undefined),
    );
    return next;
  }
}

function readText(result: TranslationPipelineOutput | undefined): string | undefined {
  const text = result?.translation_text;
  return typeof text === 'string' && text.length > 0 ? text.trim() : undefined;
}

/** `fr-CA`, `fr_ca` and `FR` all become `fr`. */
function baseLanguage(language: string): string {
  return language.trim().toLowerCase().split(/[-_]/)[0] as string;
}

const SENTENCE_END = /[.!?…:;]$/;

/**
 * Marian models end most outputs with a period, so a label like `Bonjour`
 * comes back as `Hello.`. Drop it when the input did not have one.
 */
function dropAddedPeriod(source: string, translated: string): string {
  if (SENTENCE_END.test(source.trim())) return translated;
  if (!translated.endsWith('.') || translated.endsWith('..')) return translated;
  return translated.slice(0, -1).trimEnd();
}
