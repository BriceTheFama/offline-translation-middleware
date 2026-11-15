import { Controller, Get, Injectable, Module, UseInterceptors } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  INestApplication,
  NestInterceptor,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeTranslationEngine } from '@offline-translator/middleware';
import {
  TranslationInterceptor,
  TranslationModule,
  type TranslationModuleOptions,
} from '../src/index.js';

const PRODUCTS = {
  success: true,
  data: [
    {
      id: 1,
      name: 'Hello',
      description: 'Welcome to our application',
      price: 5000,
      status: 'ACTIVE',
      email: 'john@example.com',
      url: 'https://example.com',
    },
  ],
};

/** An English item and a French one, as user-generated content often is. */
const MIXED = {
  data: [
    { id: 1, name: 'Hello', description: 'Welcome to our application' },
    { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
  ],
};

@Controller()
class ProductsController {
  @Get('/products')
  products(): unknown {
    return PRODUCTS;
  }

  @Get('/mixed')
  mixed(): unknown {
    return MIXED;
  }

  @Get('/health')
  health(): unknown {
    return { message: 'Welcome' };
  }

  @Get('/auth/login')
  login(): unknown {
    return { message: 'Welcome' };
  }

  @Get('/empty')
  empty(): unknown {
    return {};
  }

  @Get('/text')
  text(): string {
    return 'Welcome';
  }
}

@Controller('/manual')
@UseInterceptors(TranslationInterceptor)
class ManualController {
  @Get('/products')
  products(): unknown {
    return PRODUCTS;
  }
}

@Controller('/unmanaged')
class UnmanagedController {
  @Get('/products')
  products(): unknown {
    return PRODUCTS;
  }
}

const BASE_OPTIONS = {
  sourceLanguage: 'en',
  defaultLanguage: 'fr',
  supportedLanguages: ['en', 'fr', 'es'],
  fields: ['name', 'title', 'description', 'message', 'label'],
};

let app: INestApplication | undefined;

async function createApp(
  overrides: Partial<TranslationModuleOptions> = {},
  engine = new FakeTranslationEngine(),
): Promise<{ app: INestApplication; engine: FakeTranslationEngine }> {
  const moduleRef = await Test.createTestingModule({
    imports: [TranslationModule.forRoot({ engine, ...BASE_OPTIONS, ...overrides })],
    controllers: [ProductsController, ManualController, UnmanagedController],
  }).compile();

  app = moduleRef.createNestApplication();
  await app.init();
  return { app, engine };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('TranslationModule.forRoot', () => {
  it('translates a JSON response for Accept-Language: fr', async () => {
    const { app } = await createApp();
    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr');

    expect(response.body.data[0]).toMatchObject({
      name: 'Bonjour',
      description: 'Bienvenue dans notre application',
      price: 5000,
      status: 'ACTIVE',
      email: 'john@example.com',
      url: 'https://example.com',
    });
  });

  it('honours the ?lang= query parameter over Accept-Language', async () => {
    const { app } = await createApp();
    const response = await request(app.getHttpServer())
      .get('/products?lang=es')
      .set('Accept-Language', 'fr');

    expect(response.body.data[0].name).toBe('Hola');
  });

  it('leaves the response alone when the target is the source language', async () => {
    const { app, engine } = await createApp();
    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'en');

    expect(response.body.data[0].name).toBe('Hello');
    expect(engine.invocationCount).toBe(0);
  });

  it('sets Content-Language only on a translated response', async () => {
    const { app } = await createApp();

    const french = await request(app.getHttpServer()).get('/products').set('Accept-Language', 'fr');
    expect(french.headers['content-language']).toBe('fr');

    const english = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'en');
    expect(english.headers['content-language']).toBeUndefined();
  });

  it('sets Vary: Accept-Language on handled routes, translated or not', async () => {
    const { app } = await createApp({ excludeRoutes: ['/health'] });

    const translated = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr');
    expect(translated.headers.vary).toContain('Accept-Language');

    const untranslated = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'en');
    expect(untranslated.headers.vary).toContain('Accept-Language');

    const excluded = await request(app.getHttpServer()).get('/health').set('Accept-Language', 'fr');
    expect(excluded.headers.vary).toBeUndefined();
  });

  it('skips excluded routes', async () => {
    const { app } = await createApp({ excludeRoutes: ['/health', '/auth/*'] });

    for (const url of ['/health', '/auth/login']) {
      const response = await request(app.getHttpServer()).get(url).set('Accept-Language', 'fr');
      expect(response.body.message).toBe('Welcome');
    }
  });

  it('obeys the X-No-Translation bypass header', async () => {
    const { app } = await createApp();
    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr')
      .set('X-No-Translation', '1');

    expect(response.body.data[0].name).toBe('Hello');
  });

  it('never touches strings or empty payloads', async () => {
    const { app, engine } = await createApp();

    const text = await request(app.getHttpServer()).get('/text').set('Accept-Language', 'fr');
    expect(text.text).toBe('Welcome');

    const empty = await request(app.getHttpServer()).get('/empty').set('Accept-Language', 'fr');
    expect(empty.body).toEqual({});

    expect(engine.invocationCount).toBe(0);
  });

  it('lets shouldTranslate veto a response', async () => {
    const shouldTranslate = vi.fn().mockReturnValue(false);
    const { app } = await createApp({ shouldTranslate });

    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr');

    expect(shouldTranslate).toHaveBeenCalledOnce();
    expect(response.body.data[0].name).toBe('Hello');
  });

  it('keeps the original text when the engine fails', async () => {
    const onTranslationError = vi.fn();
    const engine = new FakeTranslationEngine({ failOn: (text) => text === 'Hello' });
    const { app } = await createApp({ onTranslationError }, engine);

    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr');

    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      name: 'Hello',
      description: 'Bienvenue dans notre application',
    });
    expect(onTranslationError).toHaveBeenCalled();
  });

  it("routes the failure to Nest's exception layer with failureMode: 'throw'", async () => {
    const engine = new FakeTranslationEngine({ failOn: () => true });
    const { app } = await createApp({ failureMode: 'throw' }, engine);

    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'fr');

    expect(response.status).toBe(500);
  });

  it('shares one cache across requests', async () => {
    const { app, engine } = await createApp();

    await request(app.getHttpServer()).get('/products').set('Accept-Language', 'fr');
    const callsAfterFirst = engine.callCount;
    await request(app.getHttpServer()).get('/products').set('Accept-Language', 'fr');

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(engine.callCount).toBe(callsAfterFirst);
  });

  it('rejects an invalid configuration at import time, not on the first request', () => {
    expect(() =>
      TranslationModule.forRoot({
        engine: new FakeTranslationEngine(),
        ...BASE_OPTIONS,
        fields: [],
      } as unknown as TranslationModuleOptions),
    ).toThrow(/fields/);
  });
});

describe('global: false', () => {
  it('translates only the controllers that opt in with @UseInterceptors', async () => {
    const { app } = await createApp({ global: false });

    const manual = await request(app.getHttpServer())
      .get('/manual/products')
      .set('Accept-Language', 'fr');
    expect(manual.body.data[0].name).toBe('Bonjour');

    const unmanaged = await request(app.getHttpServer())
      .get('/unmanaged/products')
      .set('Accept-Language', 'fr');
    expect(unmanaged.body.data[0].name).toBe('Hello');
  });
});

describe('TranslationModule.forRootAsync', () => {
  it('builds its options from an injected provider', async () => {
    const engine = new FakeTranslationEngine();

    @Module({
      providers: [{ provide: 'TRANSLATION_CONFIG', useValue: { defaultLanguage: 'es' } }],
      exports: ['TRANSLATION_CONFIG'],
    })
    class ConfigModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        TranslationModule.forRootAsync({
          imports: [ConfigModule],
          inject: ['TRANSLATION_CONFIG'],
          useFactory: (config: { defaultLanguage: string }) => ({
            engine,
            ...BASE_OPTIONS,
            defaultLanguage: config.defaultLanguage,
          }),
        }),
      ],
      controllers: [ProductsController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/products')
      .set('Accept-Language', 'de');

    expect(response.headers['content-language']).toBe('es');
    expect(response.body.data[0].name).toBe('Hola');
  });
});

describe('interaction with other interceptors', () => {
  it('translates what a controller-scoped interceptor produced', async () => {
    @Injectable()
    class EnvelopeInterceptor implements NestInterceptor {
      intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
        return next.handle().pipe(map((body) => ({ envelope: body })));
      }
    }

    @Controller('/enveloped')
    @UseInterceptors(EnvelopeInterceptor)
    class EnvelopedController {
      @Get('/products')
      products(): unknown {
        return PRODUCTS;
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        TranslationModule.forRoot({
          engine: new FakeTranslationEngine(),
          ...BASE_OPTIONS,
          // Anchored past the envelope the other interceptor adds, which the
          // global translation interceptor only sees because it unwinds last.
          fields: ['envelope.data.name'],
        }),
      ],
      controllers: [EnvelopedController],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer())
      .get('/enveloped/products')
      .set('Accept-Language', 'fr');

    expect(response.body.envelope.data[0].name).toBe('Bonjour');
  });
});

describe('English and French content in the same response', () => {
  it('translates only the French item for Accept-Language: en', async () => {
    const { app } = await createApp();
    const response = await request(app.getHttpServer()).get('/mixed').set('Accept-Language', 'en');

    expect(response.body).toEqual({
      data: [
        { id: 1, name: 'Hello', description: 'Welcome to our application' },
        { id: 2, name: 'Laptop', description: 'Comes with its charger' },
      ],
    });
    expect(response.headers['content-language']).toBe('en');
  });

  it('translates only the English item for Accept-Language: fr', async () => {
    const { app, engine } = await createApp();
    const response = await request(app.getHttpServer()).get('/mixed').set('Accept-Language', 'fr');

    expect(response.body.data).toEqual([
      { id: 1, name: 'Bonjour', description: 'Bienvenue dans notre application' },
      { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
    ]);
    expect(engine.callCount).toBe(2);
  });

  it('serves the body untouched with detection off and a source-language request', async () => {
    const { app, engine } = await createApp({ detectSourceLanguage: false });
    const response = await request(app.getHttpServer()).get('/mixed').set('Accept-Language', 'en');

    expect(response.body).toEqual(MIXED);
    expect(response.headers['content-language']).toBeUndefined();
    expect(engine.callCount).toBe(0);
  });

  it('serves the body untouched for an unsupported language under the source strategy', async () => {
    const { app, engine } = await createApp({ unsupportedLanguageStrategy: 'source' });
    const response = await request(app.getHttpServer()).get('/mixed').set('Accept-Language', 'pt');

    expect(response.body).toEqual(MIXED);
    expect(engine.callCount).toBe(0);
  });
});
