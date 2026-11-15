import type { TranslationRequest } from './http.js';

export type {
  NextFunction,
  RequestHandler,
  TranslationRequest,
  TranslationResponse,
} from './http.js';

/** A single segment of a JSON path: an object key or an array index. */
export type PathSegment = string | number;

/**
 * The only thing the middleware knows about how text gets translated.
 *
 * Implement it to plug in a local model, a cloud API, a glossary, anything.
 */
export interface TranslationEngine {
  translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string>;

  /**
   * Optional. When present it is preferred over {@link TranslationEngine.translate},
   * because most engines amortise model or network overhead across a batch.
   * Must return one output per input, in the same order.
   */
  translateBatch?(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]>;

  /** Optional human-readable name, used in debug logs only. */
  readonly name?: string;
}

/** Synchronous key/value store for already-translated strings. */
export interface TranslationCache {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete?(key: string): void;
  clear?(): void;
  readonly size?: number;
}

export interface CacheOptions {
  /** Default: `true`. */
  enabled?: boolean;
  /** Time to live in **seconds**. Default: `3600` (one hour). `0` disables expiry. */
  ttl?: number;
  /** Hard cap on stored entries; the least recently used one is evicted. Default: `10_000`. */
  maxEntries?: number;
  /** Bring your own store (Redis adapter, shared LRU, ...). */
  store?: TranslationCache;
}

export interface TranslationStats {
  sourceLanguage: string;
  targetLanguage: string;
  /** String values that matched the field configuration. */
  totalFields: number;
  /** Distinct strings among them. */
  uniqueTexts: number;
  /** Values actually replaced in the response. */
  translatedFields: number;
  /** Texts served from the cache. */
  cacheHits: number;
  /** Texts handed to the engine. */
  engineCalls: number;
  /** Texts the engine failed on (kept in their original language). */
  errors: number;
  /**
   * Matched values left alone because they were already in the target
   * language — a French text in a response requested in French.
   */
  alreadyInTargetLanguage: number;
  /**
   * Matched values left alone because their language could not be told,
   * under `undetectedLanguage: 'skip'`.
   */
  unknownLanguage: number;
  durationMs: number;
}

export interface TranslationErrorContext {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Present when the failure can be traced back to a single field. */
  path?: PathSegment[];
}

export type TranslationErrorHandler = (error: Error, context: TranslationErrorContext) => void;

export type LanguageResolver = (req: TranslationRequest) => string | undefined | null;

export type ShouldTranslate = (req: TranslationRequest, body: unknown) => boolean;

export type ShouldTranslateValue = (text: string, path: PathSegment[]) => boolean;

export interface SourceLanguageContext {
  /** Full path of the value, array indices included. */
  readonly path: PathSegment[];
  /** The object or array holding the value, e.g. to read a sibling `lang` key. */
  readonly parent: Record<string, unknown> | unknown[];
}

/**
 * Says which language one value is written in. Return a falsy value to let
 * detection, then {@link TranslatorOptions.sourceLanguage}, decide.
 */
export type SourceLanguageResolver = (
  text: string,
  context: SourceLanguageContext,
) => string | undefined | null;

/** Guesses the language of a text, or returns `undefined` when unsure. */
export type SourceLanguageDetector = (text: string) => string | undefined;

/** What to do when the engine throws. `fallback` keeps the original text. */
export type FailureMode = 'fallback' | 'throw';

/** What to do with a text whose language could not be told. */
export type UndetectedLanguageStrategy = 'source' | 'skip';

/** What to do when the client asks for a language that is not supported. */
export type UnsupportedLanguageStrategy = 'default' | 'source';

/** Options shared by the middleware and the standalone translator. */
export interface TranslatorOptions {
  /** The engine doing the actual work. Required. */
  engine: TranslationEngine;

  /**
   * Language the API produces. Default: `'en'`. With per-value detection on,
   * this is the fallback for a text whose language cannot be told.
   */
  sourceLanguage?: string;

  /**
   * Per-value source language, for APIs that return content in more than one
   * language. Checked first, before detection.
   */
  sourceLanguageResolver?: SourceLanguageResolver;

  /**
   * Tells English from French text by text, so each one is translated from its
   * own language and a text already in the target language is left alone.
   * `true` uses the built-in English/French detector, a function replaces it,
   * `false` treats every text as {@link TranslatorOptions.sourceLanguage}.
   * A detected language outside `supportedLanguages` is ignored. Default: `true`.
   */
  detectSourceLanguage?: boolean | SourceLanguageDetector;

  /**
   * A text neither `sourceLanguageResolver` nor detection could place.
   * `'source'` assumes {@link TranslatorOptions.sourceLanguage}; `'skip'` leaves
   * it untranslated, so a short French title is never fed to an English model —
   * at the price of short English labels ("Phone") staying in English too.
   * Default: `'source'`.
   */
  undetectedLanguage?: UndetectedLanguageStrategy;

  /**
   * Keeps interpolation placeholders — `{name}`, `{{name}}`, `\${name}`, ICU
   * expressions, `%s` — out of the engine's reach, so `{count}` never comes back
   * as `{compte}`. A translation that loses one keeps the original text and
   * counts as an error. Default: `true`.
   */
  protectPlaceholders?: boolean;

  /** Language used when the request asks for nothing usable. */
  defaultLanguage: string;

  /** Allow-list of target languages. Default: `[sourceLanguage, defaultLanguage]`. */
  supportedLanguages?: string[];

  /**
   * Fields to translate. A bare name (`'name'`) matches that key at any depth;
   * a dotted path (`'data.name'`) is anchored at the root. `*` matches one
   * segment, `**` matches any number. Array indices are transparent, so
   * `'data.name'` also matches `data[3].name`.
   */
  fields: string[];

  /** Same syntax as {@link TranslatorOptions.fields}. Exclusion always wins. */
  excludeFields?: string[];

  cache?: CacheOptions | false;

  /** Default: `'fallback'`. */
  failureMode?: FailureMode;

  /** Maximum simultaneous engine calls. Default: `5`. */
  concurrency?: number;

  /** Texts per call when the engine implements `translateBatch`. Default: `25`. */
  batchSize?: number;

  /** Strings longer than this are left untouched. Default: `5000`. */
  maxTextLength?: number;

  /** Objects nested deeper than this are not visited. Default: `100`. */
  maxDepth?: number;

  /**
   * Approximate size budget, in characters of payload text, above which the
   * response is returned untranslated. Default: `2 * 1024 * 1024`.
   */
  maxResponseSize?: number;

  /** Last say on whether a matched string is worth translating. */
  shouldTranslateValue?: ShouldTranslateValue;

  onTranslationError?: TranslationErrorHandler;

  onTranslationComplete?: (stats: TranslationStats) => void;

  /** Prints a one-line summary per translated response. Default: `false`. */
  debug?: boolean;
}

export interface TranslationMiddlewareOptions extends TranslatorOptions {
  /** Query parameter carrying the target language. Default: `'lang'`. Set to `false` to ignore it. */
  queryParameter?: string | false;

  /** Read the `Accept-Language` header. Default: `true`. */
  useAcceptLanguageHeader?: boolean;

  /** Runs first; return a falsy value to fall through to the normal detection chain. */
  languageResolver?: LanguageResolver;

  /** Default: `'default'`. */
  unsupportedLanguageStrategy?: UnsupportedLanguageStrategy;

  /** Glob-ish route patterns (`'/auth/*'`) that must never be translated. */
  excludeRoutes?: string[];

  /** When set, only these routes are translated. `excludeRoutes` still wins. */
  includeRoutes?: string[];

  /** Per-request escape hatch. */
  shouldTranslate?: ShouldTranslate;

  /** Request header that disables translation. Default: `'x-no-translation'`. `false` disables the feature. */
  bypassHeader?: string | false;

  /** Send `Content-Language` when a translation happened. Default: `true`. */
  setContentLanguage?: boolean;

  /** Send `Vary: Accept-Language` so caches key on the language. Default: `true`. */
  setVaryHeader?: boolean;
}

export interface TranslationResult<T = unknown> {
  value: T;
  translated: boolean;
  stats: TranslationStats;
}

export interface Translator {
  /** Translates a JSON-like value into `targetLanguage`, returning a new value. */
  translateResponse<T>(response: T, targetLanguage?: string): Promise<T>;
  /** Same thing, with the statistics attached. */
  translateResponseWithStats<T>(
    response: T,
    targetLanguage?: string,
  ): Promise<TranslationResult<T>>;
  /** Translates a single string, cache and dedup included. */
  translateText(text: string, targetLanguage?: string): Promise<string>;
  readonly options: Readonly<TranslatorOptions>;
}
