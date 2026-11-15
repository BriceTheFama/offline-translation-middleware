import { Controller, Get } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeTranslationEngine } from '@offline-translator/middleware';
import { TranslationModule } from '../src/index.js';

@Controller()
class ProductsController {
  @Get('/products')
  products(): unknown {
    return { data: [{ id: 1, name: 'Hello', price: 5000 }] };
  }
}

let app: NestFastifyApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/**
 * The Fastify platform hands the interceptor a `FastifyReply`, which sets
 * headers through `header()` rather than Express's `setHeader()`.
 */
describe('TranslationModule on the Fastify platform', () => {
  it('translates the body and sets both headers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TranslationModule.forRoot({
          engine: new FakeTranslationEngine(),
          sourceLanguage: 'en',
          defaultLanguage: 'fr',
          supportedLanguages: ['en', 'fr'],
          fields: ['name'],
        }),
      ],
      controllers: [ProductsController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const response = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { 'accept-language': 'fr' },
    });

    expect(response.json().data[0].name).toBe('Bonjour');
    expect(response.headers['content-language']).toBe('fr');
    expect(response.headers.vary).toContain('Accept-Language');
  });
});
