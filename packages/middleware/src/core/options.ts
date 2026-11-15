import { MemoryTranslationCache, NoopTranslationCache } from '../cache/memory-cache.js';
import type {
  FailureMode,
  ShouldTranslateValue,
  SourceLanguageDetector,
  SourceLanguageResolver,
  TranslationCache,
  TranslationEngine,
  TranslationErrorHandler,
  TranslationStats,
  TranslatorOptions,
  UndetectedLanguageStrategy,
} from '../types/index.js';
import { detectEnglishOrFrench } from '../utils/en-fr-detector.js';
import { isTranslatableText } from '../utils/translatable-value.js';
import { createLogger, type Logger } from '../utils/logger.js';
import { createFieldMatcher, type FieldMatcher } from './field-matcher.js';
import { TranslationConfigError } from './errors.js';

export const DEFAULTS = {
  sourceLanguage: 'en',
  failureMode: 'fallback' as FailureMode,
  concurrency: 5,
  batchSize: 25,
  maxTextLength: 5000,
  maxDepth: 100,
  maxResponseSize: 2 * 1024 * 1024,
  cacheTtl: 3600,
  cacheMaxEntries: 10_000,
} as const;

export interface ResolvedTranslatorOptions {
  readonly engine: TranslationEngine;
  readonly sourceLanguage: string;
  readonly defaultLanguage: string;
  readonly supportedLanguages: string[];
  readonly sourceLanguageResolver?: SourceLanguageResolver;
  readonly detectSourceLanguage?: SourceLanguageDetector;
  /**
   * `true` when a text can be in another language than `sourceLanguage`, so
   * `target === sourceLanguage` no longer means there is nothing to do.
   */
  readonly perValueSourceLanguage: boolean;
  readonly undetectedLanguage: UndetectedLanguageStrategy;
  /** Languages a resolved or detected source may take: supported + source. */
  readonly sourceLanguages: string[];
  readonly include: FieldMatcher;
  readonly exclude: FieldMatcher;
  readonly cache: TranslationCache;
  readonly cacheEnabled: boolean;
  readonly failureMode: FailureMode;
  readonly concurrency: number;
  readonly batchSize: number;
  readonly maxTextLength: number;
  readonly maxDepth: number;
  readonly maxResponseSize: number;
  readonly isTranslatableText: (text: string) => boolean;
  readonly shouldTranslateValue?: ShouldTranslateValue;
  readonly onTranslationError?: TranslationErrorHandler;
  readonly onTranslationComplete?: (stats: TranslationStats) => void;
  readonly logger: Logger;
}

export function resolveTranslatorOptions(options: TranslatorOptions): ResolvedTranslatorOptions {
  validate(options);

  const sourceLanguage = options.sourceLanguage ?? DEFAULTS.sourceLanguage;
  const supportedLanguages = normalizeSupportedLanguages(options, sourceLanguage);
  const { cache, cacheEnabled } = resolveCache(options);
  const detectSourceLanguage = resolveDetector(options.detectSourceLanguage);

  return {
    engine: options.engine,
    sourceLanguage,
    defaultLanguage: options.defaultLanguage,
    supportedLanguages,
    sourceLanguageResolver: options.sourceLanguageResolver,
    detectSourceLanguage,
    perValueSourceLanguage: Boolean(options.sourceLanguageResolver ?? detectSourceLanguage),
    sourceLanguages: [...new Set([...supportedLanguages, sourceLanguage])],
    undetectedLanguage: options.undetectedLanguage === 'skip' ? 'skip' : 'source',
    include: createFieldMatcher(options.fields),
    exclude: createFieldMatcher(options.excludeFields ?? []),
    cache,
    cacheEnabled,
    failureMode: options.failureMode ?? DEFAULTS.failureMode,
    concurrency: positive(options.concurrency, DEFAULTS.concurrency),
    batchSize: positive(options.batchSize, DEFAULTS.batchSize),
    maxTextLength: positive(options.maxTextLength, DEFAULTS.maxTextLength),
    maxDepth: positive(options.maxDepth, DEFAULTS.maxDepth),
    maxResponseSize: positive(options.maxResponseSize, DEFAULTS.maxResponseSize),
    isTranslatableText,
    shouldTranslateValue: options.shouldTranslateValue,
    onTranslationError: options.onTranslationError,
    onTranslationComplete: options.onTranslationComplete,
    logger: createLogger(options.debug ?? false),
  };
}

function validate(options: TranslatorOptions): void {
  if (!options || typeof options !== 'object') {
    throw new TranslationConfigError('Options are required.');
  }
  if (!options.engine || typeof options.engine.translate !== 'function') {
    throw new TranslationConfigError(
      'An `engine` implementing `translate(text, source, target)` is required.',
    );
  }
  if (!options.defaultLanguage) {
    throw new TranslationConfigError('`defaultLanguage` is required.');
  }
  if (!Array.isArray(options.fields) || options.fields.length === 0) {
    throw new TranslationConfigError(
      '`fields` must list at least one field to translate; the middleware never translates blindly.',
    );
  }
}

function normalizeSupportedLanguages(options: TranslatorOptions, sourceLanguage: string): string[] {
  const configured = options.supportedLanguages?.filter((language) => language.length > 0) ?? [];
  const languages =
    configured.length > 0 ? [...configured] : [sourceLanguage, options.defaultLanguage];

  // A default the client can never be served would be a configuration trap.
  if (!languages.includes(options.defaultLanguage)) languages.push(options.defaultLanguage);
  return [...new Set(languages)];
}

function resolveDetector(
  option: TranslatorOptions['detectSourceLanguage'],
): SourceLanguageDetector | undefined {
  if (typeof option === 'function') return option;
  return option === false ? undefined : detectEnglishOrFrench;
}

function resolveCache(options: TranslatorOptions): {
  cache: TranslationCache;
  cacheEnabled: boolean;
} {
  if (options.cache === false || options.cache?.enabled === false) {
    return { cache: new NoopTranslationCache(), cacheEnabled: false };
  }

  if (options.cache?.store) return { cache: options.cache.store, cacheEnabled: true };

  return {
    cache: new MemoryTranslationCache({
      ttl: options.cache?.ttl ?? DEFAULTS.cacheTtl,
      maxEntries: options.cache?.maxEntries ?? DEFAULTS.cacheMaxEntries,
    }),
    cacheEnabled: true,
  };
}

function positive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
  return value;
}
