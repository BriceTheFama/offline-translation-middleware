import Fastify, { type FastifyInstance } from 'fastify';
import { FakeTranslationEngine, translationPlugin } from '@offline-translator/fastify';
import type { TranslationEngine } from '@offline-translator/fastify';

export const products = [
  {
    id: 1,
    name: 'Phone',
    description: 'A smartphone',
    price: 5000,
    currency: 'XOF',
    status: 'ACTIVE',
    imageUrl: 'https://example.com/phone.png',
    seller: { id: 42, email: 'seller@example.com', label: 'Welcome' },
  },
  {
    id: 2,
    name: 'Computer',
    description: 'Welcome to our application',
    price: 250000,
    currency: 'XOF',
    status: 'ACTIVE',
    imageUrl: 'https://example.com/computer.png',
    seller: { id: 43, email: 'other@example.com', label: 'Welcome' },
  },
  // Written by a French-speaking seller: translated for English readers, left
  // alone for French ones.
  {
    id: 3,
    name: 'Ordinateur portable',
    description: 'Livré avec son chargeur',
    price: 320000,
    currency: 'XOF',
    status: 'ACTIVE',
    imageUrl: 'https://example.com/laptop.png',
    seller: { id: 44, email: 'vendeur@example.com', label: 'Bienvenue' },
  },
];

/** `TRANSLATION_ENGINE=local` swaps the dictionary for real OPUS-MT models, en-fr and fr-en. */
export async function createEngine(): Promise<TranslationEngine> {
  if (process.env.TRANSLATION_ENGINE !== 'local') return new FakeTranslationEngine();

  // Imported lazily so the example runs without the optional package installed.
  const { LocalTranslationEngine } = await import('@offline-translator/local');
  const engine = new LocalTranslationEngine({
    onModelLoad: (modelId) => console.log(`[engine] loading ${modelId}`),
  });
  // Both directions: English content for French readers, and the other way round.
  await Promise.all([engine.warmup('en', 'fr'), engine.warmup('fr', 'en')]);
  return engine;
}

export async function createApp(
  engine: TranslationEngine,
  options: { debug?: boolean } = {},
): Promise<FastifyInstance> {
  const app = Fastify();

  await app.register(translationPlugin, {
    engine,
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr'],
    fields: ['name', 'title', 'description', 'message', 'label'],
    excludeFields: ['email', 'status', 'currency'],
    excludeRoutes: ['/health', '/metrics'],
    cache: { ttl: 3600, maxEntries: 5000 },
    debug: options.debug ?? false,
    onTranslationComplete: (stats) => {
      if (!options.debug) return;
      console.log(
        `[stats] ${stats.targetLanguage}: ${stats.translatedFields}/${stats.totalFields} fields, ` +
          `${stats.cacheHits} cache hits, ${stats.durationMs}ms`,
      );
    },
  });

  app.get('/products', async () => ({ success: true, data: products }));

  app.get<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
    const product = products.find((item) => item.id === Number(request.params.id));
    if (!product) {
      return reply.status(404).send({ success: false, message: 'Product not found' });
    }
    return { success: true, data: { product } };
  });

  // Never translated: it is in excludeRoutes.
  app.get('/health', async () => ({ status: 'ok', message: 'Welcome' }));

  return app;
}
