import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { FakeTranslationEngine, TranslationModule } from '@offline-translator/nestjs';
import type { TranslationEngine } from '@offline-translator/nestjs';

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

@Controller()
export class ProductsController {
  @Get('/products')
  findAll(): unknown {
    return { success: true, data: products };
  }

  @Get('/products/:id')
  findOne(@Param('id') id: string): unknown {
    const product = products.find((item) => item.id === Number(id));
    if (!product) throw new NotFoundException({ success: false, message: 'Product not found' });
    return { success: true, data: { product } };
  }

  // Never translated: it is in excludeRoutes.
  @Get('/health')
  health(): unknown {
    return { status: 'ok', message: 'Welcome' };
  }
}

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

/**
 * Built as a factory rather than a decorated class so the example can pick its
 * engine at startup. A real application would use
 * `TranslationModule.forRootAsync({ inject: [ConfigService], ... })`.
 */
export function createAppModule(engine: TranslationEngine, debug = false): unknown {
  @Module({
    imports: [
      TranslationModule.forRoot({
        engine,
        sourceLanguage: 'en',
        defaultLanguage: 'fr',
        supportedLanguages: ['en', 'fr'],
        fields: ['name', 'title', 'description', 'message', 'label'],
        excludeFields: ['email', 'status', 'currency'],
        excludeRoutes: ['/health', '/metrics'],
        cache: { ttl: 3600, maxEntries: 5000 },
        debug,
        onTranslationComplete: (stats) => {
          if (!debug) return;
          console.log(
            `[stats] ${stats.targetLanguage}: ${stats.translatedFields}/${stats.totalFields} fields, ` +
              `${stats.cacheHits} cache hits, ${stats.durationMs}ms`,
          );
        },
      }),
    ],
    controllers: [ProductsController],
  })
  class AppModule {}

  return AppModule;
}
