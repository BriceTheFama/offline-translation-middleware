/**
 * @offline-translator/middleware
 *
 * Translates the text fields of your JSON API responses on their way out.
 */

export { translationMiddleware } from './middleware/translation.middleware.js';
export { createTranslator, ResponseTranslator } from './core/translator.js';

// The framework-free half of an HTTP adapter: route filtering, language
// detection and header rules, with the body interception left to the caller.
// This is what `@offline-translator/fastify` and `@offline-translator/nestjs`
// are built on, and what a new adapter should be built on.
export { TranslationPipeline, mergeVary, VARY_HEADER_VALUE } from './core/request-pipeline.js';
export type { TranslationPlan } from './core/request-pipeline.js';

export { MemoryTranslationCache, NoopTranslationCache } from './cache/memory-cache.js';
export type { MemoryTranslationCacheOptions } from './cache/memory-cache.js';
export { buildCacheKey } from './cache/cache.interface.js';

export { FakeTranslationEngine } from './engines/fake-engine.js';
export type { FakeTranslationEngineOptions } from './engines/fake-engine.js';

export { TranslationConfigError, TranslationEngineError } from './core/errors.js';

export { detectEnglishOrFrench } from './utils/en-fr-detector.js';
export type { EnglishOrFrench } from './utils/en-fr-detector.js';

export type {
  CacheOptions,
  FailureMode,
  LanguageResolver,
  NextFunction,
  PathSegment,
  RequestHandler,
  ShouldTranslate,
  ShouldTranslateValue,
  SourceLanguageContext,
  SourceLanguageDetector,
  SourceLanguageResolver,
  TranslationCache,
  TranslationEngine,
  TranslationErrorContext,
  TranslationErrorHandler,
  TranslationMiddlewareOptions,
  TranslationRequest,
  TranslationResponse,
  TranslationResult,
  TranslationStats,
  Translator,
  TranslatorOptions,
  UndetectedLanguageStrategy,
  UnsupportedLanguageStrategy,
} from './types/index.js';
