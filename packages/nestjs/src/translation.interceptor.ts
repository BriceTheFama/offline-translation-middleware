import { Inject, Injectable } from '@nestjs/common';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import {
  mergeVary,
  VARY_HEADER_VALUE,
  type TranslationPipeline,
} from '@offline-translator/middleware';
import { from, of, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {
  getResponseHeader,
  headersAlreadySent,
  setResponseHeader,
  toTranslationRequest,
} from './http.js';
import { TRANSLATION_PIPELINE } from './tokens.js';

/**
 * Translates the value a controller returns, before Nest serialises it.
 *
 * `TranslationModule.forRoot()` registers it globally by default; apply it by
 * hand with `@UseInterceptors(TranslationInterceptor)` after
 * `TranslationModule.forRoot({ global: false })`.
 *
 * Works on both Nest platforms. Non-HTTP contexts — GraphQL, microservices,
 * WebSockets — are passed through untouched, because there is no
 * `Accept-Language` to read and no response headers to set.
 */
@Injectable()
export class TranslationInterceptor implements NestInterceptor {
  constructor(@Inject(TRANSLATION_PIPELINE) private readonly pipeline: TranslationPipeline) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = toTranslationRequest(http.getRequest());
    const response = http.getResponse();

    const plan = this.pipeline.plan(request);
    if (!plan.handled) return next.handle();

    if (this.pipeline.setVaryHeader && !headersAlreadySent(response)) {
      const merged = mergeVary(getResponseHeader(response, 'Vary'), VARY_HEADER_VALUE);
      if (merged !== undefined) setResponseHeader(response, 'Vary', merged);
    }

    if (!plan.translate) return next.handle();

    return next.handle().pipe(
      switchMap((body: unknown) => {
        if (!this.pipeline.shouldTranslateBody(request, body)) return of(body);

        const translated = this.pipeline
          .translate(body, plan.targetLanguage)
          .then((result) => {
            if (
              result.translated &&
              this.pipeline.setContentLanguage &&
              !headersAlreadySent(response)
            ) {
              setResponseHeader(response, 'Content-Language', plan.targetLanguage);
            }
            return result.value;
          })
          .catch((error: unknown) => {
            // Only reachable with `failureMode: 'throw'`; from there Nest's
            // exception filters take over and the API still answers.
            if (this.pipeline.failureMode === 'throw') throw error;
            return body;
          });

        return from(translated);
      }),
    );
  }
}
