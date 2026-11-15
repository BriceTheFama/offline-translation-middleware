import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { FakeTranslationEngine } from '@offline-translator/middleware';
import { translationPlugin, type FastifyTranslationOptions } from '../src/index.js';

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

async function createApp(
  overrides: Partial<FastifyTranslationOptions> = {},
  engine = new FakeTranslationEngine(),
): Promise<{ app: FastifyInstance; engine: FakeTranslationEngine }> {
  const app = Fastify();

  await app.register(translationPlugin, {
    engine,
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr', 'es'],
    fields: ['name', 'title', 'description', 'message', 'label'],
    ...overrides,
  } as FastifyTranslationOptions);

  app.get('/products', async () => PRODUCTS);
  app.get('/mixed', async () => MIXED);
  app.get('/health', async () => ({ message: 'Welcome' }));
  app.get('/auth/login', async () => ({ message: 'Welcome' }));
  app.get('/empty', async () => ({}));
  app.get('/text', async (_request, reply) => reply.type('text/html').send('<p>Welcome</p>'));
  app.get('/buffer', async (_request, reply) =>
    reply.type('application/octet-stream').send(Buffer.from('Welcome')),
  );

  await app.ready();
  return { app, engine };
}

describe('translationPlugin', () => {
  it('translates a JSON response for Accept-Language: fr', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });

    expect(response.json().data[0]).toMatchObject({
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
    const response = await app.inject({
      method: 'GET',
      url: '/products?lang=es',
      headers: { 'accept-language': 'fr' },
    });

    expect(response.json().data[0].name).toBe('Hola');
  });

  it('leaves the response alone when the target is the source language', async () => {
    const { app, engine } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'en' },
    });

    expect(response.json().data[0].name).toBe('Hello');
    expect(engine.invocationCount).toBe(0);
  });

  it('sets Content-Language only on a translated response', async () => {
    const { app } = await createApp();

    const french = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });
    expect(french.headers['content-language']).toBe('fr');

    const english = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'en' },
    });
    expect(english.headers['content-language']).toBeUndefined();
  });

  it('sets Vary: Accept-Language on handled routes, translated or not', async () => {
    const { app } = await createApp({ excludeRoutes: ['/health'] });

    const translated = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });
    expect(translated.headers.vary).toContain('Accept-Language');

    const untranslated = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'en' },
    });
    expect(untranslated.headers.vary).toContain('Accept-Language');

    const excluded = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'accept-language': 'fr' },
    });
    expect(excluded.headers.vary).toBeUndefined();
  });

  it('skips excluded routes', async () => {
    const { app } = await createApp({ excludeRoutes: ['/health', '/auth/*'] });

    for (const url of ['/health', '/auth/login']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { 'accept-language': 'fr' },
      });
      expect(response.json().message).toBe('Welcome');
    }
  });

  it('translates only included routes when includeRoutes is set', async () => {
    const { app } = await createApp({ includeRoutes: ['/products'] });

    const included = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });
    expect(included.json().data[0].name).toBe('Bonjour');

    const other = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'accept-language': 'fr' },
    });
    expect(other.json().message).toBe('Welcome');
  });

  it('obeys the X-No-Translation bypass header', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr', 'x-no-translation': '1' },
    });

    expect(response.json().data[0].name).toBe('Hello');
  });

  it('never touches strings, buffers or empty payloads', async () => {
    const { app, engine } = await createApp();

    const html = await app.inject({
      method: 'GET',
      url: '/text',
      headers: { 'accept-language': 'fr' },
    });
    expect(html.body).toBe('<p>Welcome</p>');

    const buffer = await app.inject({
      method: 'GET',
      url: '/buffer',
      headers: { 'accept-language': 'fr' },
    });
    expect(buffer.body).toBe('Welcome');

    const empty = await app.inject({
      method: 'GET',
      url: '/empty',
      headers: { 'accept-language': 'fr' },
    });
    expect(empty.json()).toEqual({});

    expect(engine.invocationCount).toBe(0);
  });

  it('lets shouldTranslate veto a response', async () => {
    const shouldTranslate = vi.fn().mockReturnValue(false);
    const { app } = await createApp({ shouldTranslate });

    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });

    expect(shouldTranslate).toHaveBeenCalledOnce();
    expect(response.json().data[0].name).toBe('Hello');
  });

  it('keeps the original text when the engine fails', async () => {
    const onTranslationError = vi.fn();
    const engine = new FakeTranslationEngine({ failOn: (text) => text === 'Hello' });
    const { app } = await createApp({ onTranslationError }, engine);

    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({
      name: 'Hello',
      description: 'Bienvenue dans notre application',
    });
    expect(onTranslationError).toHaveBeenCalled();
  });

  it("routes the failure to Fastify's error handler with failureMode: 'throw'", async () => {
    const engine = new FakeTranslationEngine({ failOn: () => true });
    const { app } = await createApp({ failureMode: 'throw' }, engine);

    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });

    expect(response.statusCode).toBe(500);
  });

  it('shares one cache across requests', async () => {
    const { app, engine } = await createApp();

    await app.inject({ method: 'GET', url: '/products', headers: { 'accept-language': 'fr' } });
    const callsAfterFirst = engine.callCount;
    await app.inject({ method: 'GET', url: '/products', headers: { 'accept-language': 'fr' } });

    expect(callsAfterFirst).toBeGreaterThan(0);
    expect(engine.callCount).toBe(callsAfterFirst);
  });

  it('falls back to defaultLanguage for an unsupported language', async () => {
    const { app } = await createApp();
    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'de' },
    });

    expect(response.headers['content-language']).toBe('fr');
    expect(response.json().data[0].name).toBe('Bonjour');
  });

  it('applies to routes registered before and after the plugin', async () => {
    const app = Fastify();
    app.get('/before', async () => ({ message: 'Welcome' }));
    await app.register(translationPlugin, {
      engine: new FakeTranslationEngine(),
      defaultLanguage: 'fr',
      supportedLanguages: ['en', 'fr'],
      fields: ['message'],
    } as FastifyTranslationOptions);
    app.get('/after', async () => ({ message: 'Welcome' }));
    await app.ready();

    for (const url of ['/before', '/after']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { 'accept-language': 'fr' },
      });
      expect(response.json().message).toBe('Bienvenue');
    }
  });
});

function inject(app: FastifyInstance, language: string) {
  return app
    .inject({ method: 'GET', url: '/mixed', headers: { 'accept-language': language } })
    .then((response) => ({ body: response.json(), headers: response.headers }));
}

describe('English and French content in the same response', () => {
  it('translates only the French item for Accept-Language: en', async () => {
    const { app } = await createApp();
    const response = await inject(app, 'en');

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
    const response = await inject(app, 'fr');

    expect(response.body.data).toEqual([
      { id: 1, name: 'Bonjour', description: 'Bienvenue dans notre application' },
      { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
    ]);
    expect(engine.callCount).toBe(2);
  });

  it('serves the body untouched with detection off and a source-language request', async () => {
    const { app, engine } = await createApp({ detectSourceLanguage: false });
    const response = await inject(app, 'en');

    expect(response.body).toEqual(MIXED);
    expect(response.headers['content-language']).toBeUndefined();
    expect(engine.callCount).toBe(0);
  });

  it('serves the body untouched for an unsupported language under the source strategy', async () => {
    const { app, engine } = await createApp({ unsupportedLanguageStrategy: 'source' });
    const response = await inject(app, 'pt');

    expect(response.body).toEqual(MIXED);
    expect(engine.callCount).toBe(0);
  });
});
