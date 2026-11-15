import type { TranslationMiddlewareOptions } from '@offline-translator/middleware';
import type { ModuleMetadata } from '@nestjs/common';

/** Injection token holding the resolved options the module was configured with. */
export const TRANSLATION_OPTIONS = Symbol.for('@offline-translator/nestjs:options');

/**
 * Injection token holding the shared {@link TranslationPipeline}. One instance
 * per application, so the translation cache is shared across every request.
 */
export const TRANSLATION_PIPELINE = Symbol.for('@offline-translator/nestjs:pipeline');

export interface TranslationModuleOptions extends TranslationMiddlewareOptions {
  /**
   * Register the interceptor as an `APP_INTERCEPTOR`, covering every route.
   * Default: `true`. Set it to `false` to apply `TranslationInterceptor`
   * yourself with `@UseInterceptors()`.
   */
  global?: boolean;
}

export interface TranslationModuleAsyncOptions {
  imports?: ModuleMetadata['imports'];
  inject?: unknown[];
  useFactory: (...args: never[]) => TranslationModuleOptions | Promise<TranslationModuleOptions>;
  /**
   * Same as {@link TranslationModuleOptions.global}, but here rather than in the
   * factory: whether the interceptor is registered globally has to be decided
   * before the factory runs.
   */
  global?: boolean;
}
