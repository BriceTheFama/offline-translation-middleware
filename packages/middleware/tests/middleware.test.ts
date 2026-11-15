import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { translationMiddleware } from '../src/middleware/translation.middleware.js';
import { FakeTranslationEngine } from '../src/engines/fake-engine.js';
import type { TranslationMiddlewareOptions } from '../src/types/index.js';

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

function createApp(
  overrides: Partial<TranslationMiddlewareOptions> = {},
  engine = new FakeTranslationEngine(),
): { app: Express; engine: FakeTranslationEngine } {
  const app = express();

  app.use(
    translationMiddleware({
      engine,
      sourceLanguage: 'en',
      defaultLanguage: 'fr',
      supportedLanguages: ['en', 'fr', 'es'],
      fields: ['name', 'title', 'description', 'message', 'label'],
      ...overrides,
    }),
  );

  app.get('/products', (_req, res) => {
    res.json(PRODUCTS);
  });
  app.get('/mixed', (_req, res) => {
    res.json(MIXED);
  });
  app.get('/health', (_req, res) => {
    res.json({ message: 'Welcome' });
  });
  app.get('/auth/login', (_req, res) => {
    res.json({ message: 'Welcome' });
  });
  app.get('/empty', (_req, res) => {
    res.json({});
  });
  app.get('/file', (_req, res) => {
    res.type('text/html').send('<p>Welcome</p>');
  });
  app.get('/buffer', (_req, res) => {
    res.type('application/octet-stream').send(Buffer.from('Welcome'));
  });
  app.get('/text', (_req, res) => {
    res.send('Welcome');
  });

  return { app, engine };
}

describe('translationMiddleware', () => {
  it('translates a JSON response for Accept-Language: fr', async () => {
    const { app } = createApp();
    const response = await request(app).get('/products').set('Accept-Language', 'fr');

    expect(response.body.data[0]).toMatchObject({
      id: 1,
      name: 'Bonjour',
      description: 'Bienvenue dans notre application',
      price: 5000,
      status: 'ACTIVE',
      email: 'john@example.com',
      url: 'https://example.com',
    });
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Accept-Language');
  });

  it('leaves the response alone for Accept-Language: en', async () => {
    const { app, engine } = createApp();
    const response = await request(app).get('/products').set('Accept-Language', 'en');

    expect(response.body).toEqual(PRODUCTS);
    expect(response.headers['content-language']).toBeUndefined();
    expect(engine.callCount).toBe(0);
  });

  it('reads the language from the query string', async () => {
    const { app } = createApp();
    const response = await request(app).get('/products?lang=es');
    expect(response.body.data[0].name).toBe('Hola');
    expect(response.headers['content-language']).toBe('es');
  });

  it('lets the query string win over the header', async () => {
    const { app } = createApp();
    const response = await request(app).get('/products?lang=es').set('Accept-Language', 'fr');
    expect(response.body.data[0].name).toBe('Hola');
  });

  it('uses a custom language resolver', async () => {
    const { app } = createApp({
      languageResolver: (req) => req.headers['x-language'] as string | undefined,
    });
    const response = await request(app).get('/products').set('x-language', 'es');
    expect(response.body.data[0].name).toBe('Hola');
  });

  it('falls back to defaultLanguage for an unsupported language', async () => {
    const { app } = createApp();
    const response = await request(app).get('/products').set('Accept-Language', 'pt');
    expect(response.body.data[0].name).toBe('Bonjour');
    expect(response.headers['content-language']).toBe('fr');
  });

  it('can fall back to the source language instead', async () => {
    const { app, engine } = createApp({ unsupportedLanguageStrategy: 'source' });
    const response = await request(app).get('/products').set('Accept-Language', 'pt');
    expect(response.body).toEqual(PRODUCTS);
    expect(engine.callCount).toBe(0);
  });

  it('uses defaultLanguage when the client asks for nothing', async () => {
    const { app } = createApp();
    const response = await request(app).get('/products');
    expect(response.body.data[0].name).toBe('Bonjour');
  });

  it('skips excluded routes', async () => {
    const { app, engine } = createApp({ excludeRoutes: ['/health', '/auth/*'] });

    const health = await request(app).get('/health').set('Accept-Language', 'fr');
    const login = await request(app).get('/auth/login').set('Accept-Language', 'fr');

    expect(health.body).toEqual({ message: 'Welcome' });
    expect(login.body).toEqual({ message: 'Welcome' });
    expect(engine.callCount).toBe(0);
  });

  it('only handles included routes when includeRoutes is set', async () => {
    const { app } = createApp({ includeRoutes: ['/products'] });

    const products = await request(app).get('/products').set('Accept-Language', 'fr');
    const health = await request(app).get('/health').set('Accept-Language', 'fr');

    expect(products.body.data[0].name).toBe('Bonjour');
    expect(health.body).toEqual({ message: 'Welcome' });
  });

  it('lets excludeRoutes win over includeRoutes', async () => {
    const { app } = createApp({ includeRoutes: ['/**'], excludeRoutes: ['/health'] });
    const health = await request(app).get('/health').set('Accept-Language', 'fr');
    expect(health.body).toEqual({ message: 'Welcome' });
  });

  it('does not translate excluded fields', async () => {
    const { app } = createApp({ excludeFields: ['description'] });
    const response = await request(app).get('/products').set('Accept-Language', 'fr');

    expect(response.body.data[0].name).toBe('Bonjour');
    expect(response.body.data[0].description).toBe('Welcome to our application');
  });

  it('honours the bypass header', async () => {
    const { app, engine } = createApp();
    const response = await request(app)
      .get('/products')
      .set('Accept-Language', 'fr')
      .set('X-No-Translation', 'true');

    expect(response.body).toEqual(PRODUCTS);
    expect(engine.callCount).toBe(0);
  });

  it('ignores a falsy bypass header', async () => {
    const { app } = createApp();
    const response = await request(app)
      .get('/products')
      .set('Accept-Language', 'fr')
      .set('X-No-Translation', 'false');
    expect(response.body.data[0].name).toBe('Bonjour');
  });

  it('honours shouldTranslate', async () => {
    const { app, engine } = createApp({ shouldTranslate: (req) => req.path === '/health' });
    const response = await request(app).get('/products').set('Accept-Language', 'fr');

    expect(response.body).toEqual(PRODUCTS);
    expect(engine.callCount).toBe(0);
  });

  it('leaves non-JSON responses untouched', async () => {
    const { app, engine } = createApp();

    const html = await request(app).get('/file').set('Accept-Language', 'fr');
    const buffer = await request(app).get('/buffer').set('Accept-Language', 'fr');
    const text = await request(app).get('/text').set('Accept-Language', 'fr');

    expect(html.text).toBe('<p>Welcome</p>');
    expect(buffer.body.toString()).toBe('Welcome');
    expect(text.text).toBe('Welcome');
    expect(engine.callCount).toBe(0);
  });

  it('leaves empty payloads untouched', async () => {
    const { app, engine } = createApp();
    const response = await request(app).get('/empty').set('Accept-Language', 'fr');

    expect(response.body).toEqual({});
    expect(response.headers['content-language']).toBeUndefined();
    expect(engine.callCount).toBe(0);
  });

  it('still answers when the engine fails', async () => {
    const onTranslationError = vi.fn();
    const engine = new FakeTranslationEngine({ failOn: () => true });
    const { app } = createApp({ onTranslationError }, engine);

    const response = await request(app).get('/products').set('Accept-Language', 'fr');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(PRODUCTS);
    expect(onTranslationError).toHaveBeenCalled();
  });

  it('routes the failure to the error handler in strict mode', async () => {
    const engine = new FakeTranslationEngine({ failOn: () => true });
    const { app } = createApp({ failureMode: 'throw' }, engine);
    app.use(
      (error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(503).json({ error: error.message });
      },
    );

    const response = await request(app).get('/products').set('Accept-Language', 'fr');
    expect(response.status).toBe(503);
  });

  it('preserves the status code', async () => {
    const engine = new FakeTranslationEngine();
    const app = express();
    app.use(
      translationMiddleware({
        engine,
        sourceLanguage: 'en',
        defaultLanguage: 'fr',
        supportedLanguages: ['en', 'fr'],
        fields: ['message'],
      }),
    );
    app.get('/missing', (_req, res) => {
      res.status(404).json({ message: 'Welcome' });
    });

    const response = await request(app).get('/missing').set('Accept-Language', 'fr');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'Bienvenue' });
  });

  it('reuses the cache across requests', async () => {
    const { app, engine } = createApp();
    await request(app).get('/products').set('Accept-Language', 'fr');
    const calls = engine.callCount;
    await request(app).get('/products').set('Accept-Language', 'fr');

    expect(engine.callCount).toBe(calls);
  });

  it('reports stats through onTranslationComplete', async () => {
    const onTranslationComplete = vi.fn();
    const { app } = createApp({ onTranslationComplete });
    await request(app).get('/products').set('Accept-Language', 'fr');

    expect(onTranslationComplete).toHaveBeenCalled();
    expect(onTranslationComplete.mock.calls[0]?.[0]).toMatchObject({
      targetLanguage: 'fr',
      totalFields: 2,
      translatedFields: 2,
    });
  });

  it('appends to an existing Vary header instead of replacing it', async () => {
    const engine = new FakeTranslationEngine();
    const app = express();
    app.use((_req, res, next) => {
      res.setHeader('Vary', 'Accept-Encoding');
      next();
    });
    app.use(
      translationMiddleware({
        engine,
        sourceLanguage: 'en',
        defaultLanguage: 'fr',
        supportedLanguages: ['en', 'fr'],
        fields: ['message'],
      }),
    );
    app.get('/x', (_req, res) => {
      res.json({ message: 'Welcome' });
    });

    const response = await request(app).get('/x').set('Accept-Language', 'fr');
    expect(response.headers.vary).toBe('Accept-Encoding, Accept-Language');
  });

  it('translates a response sent through res.send(object)', async () => {
    const engine = new FakeTranslationEngine();
    const app = express();
    app.use(
      translationMiddleware({
        engine,
        sourceLanguage: 'en',
        defaultLanguage: 'fr',
        supportedLanguages: ['en', 'fr'],
        fields: ['message'],
      }),
    );
    app.get('/x', (_req, res) => {
      res.send({ message: 'Welcome' });
    });

    const response = await request(app).get('/x').set('Accept-Language', 'fr');
    expect(response.body).toEqual({ message: 'Bienvenue' });
  });
});

describe('English and French content in the same response', () => {
  it('translates only the French item for Accept-Language: en', async () => {
    const { app } = createApp();
    const response = await request(app).get('/mixed').set('Accept-Language', 'en');

    expect(response.body).toEqual({
      data: [
        { id: 1, name: 'Hello', description: 'Welcome to our application' },
        { id: 2, name: 'Laptop', description: 'Comes with its charger' },
      ],
    });
    expect(response.headers['content-language']).toBe('en');
  });

  it('translates only the English item for Accept-Language: fr', async () => {
    const { app, engine } = createApp();
    const response = await request(app).get('/mixed').set('Accept-Language', 'fr');

    expect(response.body.data).toEqual([
      { id: 1, name: 'Bonjour', description: 'Bienvenue dans notre application' },
      { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
    ]);
    expect(engine.callCount).toBe(2);
  });

  it('serves the body untouched with detection off and a source-language request', async () => {
    const { app, engine } = createApp({ detectSourceLanguage: false });
    const response = await request(app).get('/mixed').set('Accept-Language', 'en');

    expect(response.body).toEqual(MIXED);
    expect(response.headers['content-language']).toBeUndefined();
    expect(engine.callCount).toBe(0);
  });

  it('serves the body untouched for an unsupported language under the source strategy', async () => {
    const { app, engine } = createApp({ unsupportedLanguageStrategy: 'source' });
    const response = await request(app).get('/mixed').set('Accept-Language', 'pt');

    expect(response.body).toEqual(MIXED);
    expect(engine.callCount).toBe(0);
  });
});
