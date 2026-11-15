/**
 * @offline-translator/nestjs
 *
 * NestJS adapter for @offline-translator/middleware.
 */

export { TranslationModule } from './translation.module.js';
export { TranslationInterceptor } from './translation.interceptor.js';
export { TRANSLATION_OPTIONS, TRANSLATION_PIPELINE } from './tokens.js';
export type { TranslationModuleAsyncOptions, TranslationModuleOptions } from './tokens.js';

// Re-exported so an application never has to install the core package just to
// name a type or build an engine.
export {
  createTranslator,
  FakeTranslationEngine,
  MemoryTranslationCache,
  NoopTranslationCache,
  TranslationConfigError,
  TranslationEngineError,
  TranslationPipeline,
} from '@offline-translator/middleware';
export type {
  CacheOptions,
  FailureMode,
  TranslationCache,
  TranslationEngine,
  TranslationErrorContext,
  TranslationMiddlewareOptions,
  TranslationStats,
  Translator,
  TranslatorOptions,
} from '@offline-translator/middleware';
