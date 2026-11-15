/**
 * @offline-translator/fastify
 *
 * Fastify adapter for @offline-translator/middleware.
 */

export { translationPlugin } from './plugin.js';
export type { FastifyTranslationOptions } from './plugin.js';

// Re-exported so an application never has to install the core package just to
// name a type or build an engine.
export {
  createTranslator,
  FakeTranslationEngine,
  MemoryTranslationCache,
  NoopTranslationCache,
  TranslationConfigError,
  TranslationEngineError,
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

export { translationPlugin as default } from './plugin.js';
