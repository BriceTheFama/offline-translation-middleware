import { Global, Module } from '@nestjs/common';
import type { DynamicModule, Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TranslationPipeline } from '@offline-translator/middleware';
import { TranslationInterceptor } from './translation.interceptor.js';
import {
  TRANSLATION_OPTIONS,
  TRANSLATION_PIPELINE,
  type TranslationModuleAsyncOptions,
  type TranslationModuleOptions,
} from './tokens.js';

const pipelineProvider: Provider = {
  provide: TRANSLATION_PIPELINE,
  useFactory: (options: TranslationModuleOptions): TranslationPipeline =>
    new TranslationPipeline(options),
  inject: [TRANSLATION_OPTIONS],
};

/**
 * Wires the translation pipeline into a Nest application.
 *
 * ```typescript
 * @Module({
 *   imports: [
 *     TranslationModule.forRoot({
 *       engine: new LocalTranslationEngine(),
 *       defaultLanguage: 'fr',
 *       supportedLanguages: ['en', 'fr'],
 *       fields: ['name', 'description'],
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * The module is global, so `TranslationInterceptor` and the shared pipeline can
 * be injected anywhere without re-importing it.
 */
@Global()
@Module({})
export class TranslationModule {
  static forRoot(options: TranslationModuleOptions): DynamicModule {
    // Constructing the pipeline here rather than in the provider surfaces a
    // configuration error at import time, not on the first request.
    new TranslationPipeline(options);

    return {
      module: TranslationModule,
      providers: [
        { provide: TRANSLATION_OPTIONS, useValue: options },
        pipelineProvider,
        TranslationInterceptor,
        ...globalInterceptor(options.global !== false),
      ],
      exports: [TRANSLATION_OPTIONS, TRANSLATION_PIPELINE, TranslationInterceptor],
    };
  }

  /** Same thing, with the options coming from `ConfigService` or any other provider. */
  static forRootAsync(options: TranslationModuleAsyncOptions): DynamicModule {
    return {
      module: TranslationModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: TRANSLATION_OPTIONS,
          useFactory: options.useFactory,
          inject: (options.inject ?? []) as never[],
        },
        pipelineProvider,
        TranslationInterceptor,
        ...globalInterceptor(options.global !== false),
      ],
      exports: [TRANSLATION_OPTIONS, TRANSLATION_PIPELINE, TranslationInterceptor],
    };
  }
}

function globalInterceptor(enabled: boolean): Provider[] {
  if (!enabled) return [];
  return [{ provide: APP_INTERCEPTOR, useExisting: TranslationInterceptor }];
}
