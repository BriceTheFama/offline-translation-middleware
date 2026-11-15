import { mergeVary, TranslationPipeline, VARY_HEADER_VALUE } from '../core/request-pipeline.js';
import type {
  NextFunction,
  RequestHandler,
  TranslationMiddlewareOptions,
  TranslationRequest,
  TranslationResponse,
} from '../types/index.js';

/**
 * Express middleware that translates the JSON body of a response on its way out.
 *
 * It wraps `res.json`. Buffers, streams, files and `res.send('...')` with a
 * non-JSON body are never touched.
 */
export function translationMiddleware(options: TranslationMiddlewareOptions): RequestHandler {
  const pipeline = new TranslationPipeline(options);

  return function translationRequestHandler(
    req: TranslationRequest,
    res: TranslationResponse,
    next: NextFunction,
  ): void {
    const plan = pipeline.plan(req);
    if (!plan.handled) return next();

    if (pipeline.setVaryHeader) appendVary(res, VARY_HEADER_VALUE);
    if (!plan.translate) return next();

    const originalJson = res.json.bind(res);
    let intercepted = false;

    res.json = function interceptedJson(body?: unknown): unknown {
      if (intercepted) return originalJson(body);
      intercepted = true;
      res.json = originalJson;

      if (!pipeline.shouldTranslateBody(req, body)) return originalJson(body);

      void (async (): Promise<void> => {
        try {
          const result = await pipeline.translate(body, plan.targetLanguage);

          if (result.translated && pipeline.setContentLanguage && !res.headersSent) {
            res.setHeader('Content-Language', plan.targetLanguage);
          }

          originalJson(result.value);
        } catch (error) {
          // Only reachable with `failureMode: 'throw'`; the API still answers,
          // through the error handler this time.
          if (pipeline.failureMode === 'throw') next(error);
          else originalJson(body);
        }
      })();

      return res;
    };

    next();
  };
}

function appendVary(res: TranslationResponse, value: string): void {
  if (res.headersSent) return;
  const merged = mergeVary(res.getHeader?.('Vary'), value);
  if (merged !== undefined) res.setHeader('Vary', merged);
}
