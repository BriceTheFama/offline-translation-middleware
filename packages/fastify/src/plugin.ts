import {
  mergeVary,
  TranslationPipeline,
  VARY_HEADER_VALUE,
  type TranslationMiddlewareOptions,
  type TranslationPlan,
  type TranslationRequest,
} from '@offline-translator/middleware';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Same options as the Express middleware. Route filtering, language detection,
 * fields, cache and engine all behave identically.
 */
export type FastifyTranslationOptions = TranslationMiddlewareOptions;

/**
 * Fastify plugin that translates the JSON body of a response on its way out.
 *
 * It runs in `preSerialization`, which Fastify skips for strings, buffers,
 * streams and `null` — so files and manual payloads are never touched, exactly
 * like the Express adapter leaves everything but `res.json` alone.
 *
 * ```typescript
 * await app.register(translationPlugin, {
 *   engine,
 *   defaultLanguage: 'fr',
 *   fields: ['name', 'description'],
 * });
 * ```
 */
export async function translationPlugin(
  fastify: FastifyInstance,
  options: FastifyTranslationOptions,
): Promise<void> {
  const pipeline = new TranslationPipeline(options);

  // Keyed on the request object rather than decorating it, so the plugin adds
  // no property another plugin could collide with.
  const plans = new WeakMap<FastifyRequest, TranslationPlan>();

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const plan = pipeline.plan(toTranslationRequest(request));
    if (!plan.handled) return;

    if (pipeline.setVaryHeader) {
      const merged = mergeVary(reply.getHeader('Vary'), VARY_HEADER_VALUE);
      if (merged !== undefined) reply.header('Vary', merged);
    }

    if (plan.translate) plans.set(request, plan);
  });

  fastify.addHook(
    'preSerialization',
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      const plan = plans.get(request);
      if (plan === undefined) return payload;
      plans.delete(request);

      if (!pipeline.shouldTranslateBody(toTranslationRequest(request), payload)) return payload;

      try {
        const result = await pipeline.translate(payload, plan.targetLanguage);

        if (result.translated && pipeline.setContentLanguage) {
          reply.header('Content-Language', plan.targetLanguage);
        }

        return result.value;
      } catch (error) {
        // Only reachable with `failureMode: 'throw'`; Fastify's error handler
        // takes it from here and the API still answers.
        if (pipeline.failureMode === 'throw') throw error;
        return payload;
      }
    },
  );
}

/**
 * Hooks registered inside a plugin are scoped to it, which would leave every
 * route outside untranslated. `skip-override` is Fastify's own way of asking
 * for the parent scope; `fastify-plugin` does exactly this, and pinning a major
 * version of it is not worth a runtime dependency for two lines.
 *
 * Scope translation with `includeRoutes` / `excludeRoutes` rather than with
 * Fastify encapsulation.
 */
Object.defineProperty(translationPlugin, Symbol.for('skip-override'), { value: true });
Object.defineProperty(translationPlugin, Symbol.for('fastify.display-name'), {
  value: '@offline-translator/fastify',
});

/**
 * Fastify's request already has the shape the pipeline reads; the cast narrows
 * `query`, which Fastify types as `unknown` until a route declares a schema.
 */
function toTranslationRequest(request: FastifyRequest): TranslationRequest {
  return {
    headers: request.headers as Record<string, string | string[] | undefined>,
    query: request.query as Record<string, unknown> | undefined,
    url: request.url,
    method: request.method,
  };
}
