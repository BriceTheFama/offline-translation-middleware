# @offline-translator/nestjs

NestJS module that translates the text fields of your JSON API responses before
they reach the frontend.

Your controllers keep returning English. The client asks for French with
`Accept-Language: fr`, and that is what it gets — no `t()` calls in your
services, no translation table to maintain, no second endpoint.

```json
// what your controller returns       // what the client receives (Accept-Language: fr)
{ "name": "Hello",                    { "name": "Bonjour",
  "price": 5000,                        "price": 5000,
  "status": "ACTIVE" }                  "status": "ACTIVE" }
```

This is the Nest adapter for [`@offline-translator/middleware`](../middleware).
Fields, language detection, cache, engine contract and error handling are the
same; only the way the body is intercepted differs.

## Installation

```bash
npm install @offline-translator/nestjs
```

Node.js >= 20, Nest 10 or 11. `@nestjs/common`, `@nestjs/core` and `rxjs` are
peer dependencies — you already have all three.

Works on both platforms: `@nestjs/platform-express` and
`@nestjs/platform-fastify`.

## Quick start

```typescript
import { Module } from '@nestjs/common';
import { TranslationModule, FakeTranslationEngine } from '@offline-translator/nestjs';

@Module({
  imports: [
    TranslationModule.forRoot({
      engine: new FakeTranslationEngine(), // swap for a real one
      sourceLanguage: 'en',
      defaultLanguage: 'fr',
      supportedLanguages: ['en', 'fr'],
      fields: ['name', 'title', 'description', 'message', 'label'],
    }),
  ],
  controllers: [ProductsController],
})
export class AppModule {}
```

```typescript
@Controller('products')
export class ProductsController {
  @Get()
  findAll() {
    return { data: [{ id: 1, name: 'Hello', price: 5000 }] };
  }
}
```

```bash
curl -H 'Accept-Language: fr' localhost:3000/products
# {"data":[{"id":1,"name":"Bonjour","price":5000}]}
```

A translated response carries `Content-Language: fr`, and every response on a
handled route carries `Vary: Accept-Language` so HTTP caches key on it.

For a real engine, install [`@offline-translator/local`](../local) — OPUS-MT on
ONNX Runtime, in-process, no API key — or implement the one-method
`TranslationEngine` interface yourself. Both are covered in the
[middleware README](../middleware/README.md#a-real-engine).

## How it is wired

`forRoot()` is a global module. It provides:

| Provider                 | What it is                                                   |
| ------------------------ | ------------------------------------------------------------ |
| `TranslationInterceptor` | The interceptor doing the work.                              |
| `TRANSLATION_PIPELINE`   | The shared pipeline — one per app, so one cache for the app. |
| `TRANSLATION_OPTIONS`    | The options the module was configured with.                  |

By default the interceptor is also registered as an `APP_INTERCEPTOR`, so it
covers every controller. An invalid configuration throws when the module is
imported, not on the first request.

## Async configuration

Options from `ConfigService`, or from anything else in the container:

```typescript
TranslationModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    engine: new LocalTranslationEngine(),
    sourceLanguage: 'en',
    defaultLanguage: config.get('DEFAULT_LANGUAGE', 'fr'),
    supportedLanguages: config.get<string[]>('SUPPORTED_LANGUAGES'),
    fields: ['name', 'title', 'description'],
  }),
});
```

`global` lives on the options object rather than in the factory: whether the
interceptor is registered globally has to be decided before the factory runs.

## Translating only some controllers

Set `global: false` and apply the interceptor where you want it. It is exported
by the module, and the module is global, so no extra import is needed:

```typescript
TranslationModule.forRoot({ /* ... */ global: false });
```

```typescript
import { UseInterceptors } from '@nestjs/common';
import { TranslationInterceptor } from '@offline-translator/nestjs';

@Controller('products')
@UseInterceptors(TranslationInterceptor)
export class ProductsController {}
```

Route patterns work too, and are usually simpler for cross-cutting exclusions:

```typescript
TranslationModule.forRoot({
  // ...
  excludeRoutes: ['/health', '/metrics', '/auth/*'],
});
```

## Interceptor order

Nest runs global interceptors first on the way in and unwinds them last on the
way out. `TranslationInterceptor` therefore sees whatever the interceptors
closer to your handler produced — which is what you want when another
interceptor reshapes the response.

- A **controller- or route-scoped** interceptor always runs closer to the
  handler, so its output is what gets translated.
- Among **global** interceptors the order is the order their providers are
  registered, which follows module import order. A global envelope interceptor
  whose module is imported _before_ `TranslationModule` unwinds _after_ it, so
  translation sees the payload before wrapping.

In practice this rarely needs thought: a bare field name matches at any depth,
so `fields: ['name']` finds `name` whether or not the payload ends up inside a
`{ data: ... }` envelope. Anchored paths are the case to check — write
`'data.name'` against the shape the interceptor actually receives.

## Options

Every option of the Express middleware, plus `global` — see the
[configuration table](../middleware/README.md#configuration) for the full list.
The ones you will reach for first:

| Option               | Type                    | Default                             | Description                                 |
| -------------------- | ----------------------- | ----------------------------------- | ------------------------------------------- |
| `engine`             | `TranslationEngine`     | —                                   | **Required.** Does the actual translating.  |
| `fields`             | `string[]`              | —                                   | **Required.** Fields to translate.          |
| `defaultLanguage`    | `string`                | —                                   | **Required.** Fallback target language.     |
| `sourceLanguage`     | `string`                | `'en'`                              | Language your API produces.                 |
| `supportedLanguages` | `string[]`              | `[sourceLanguage, defaultLanguage]` | Allow-list of targets.                      |
| `global`             | `boolean`               | `true`                              | Register the interceptor as global.         |
| `excludeFields`      | `string[]`              | `[]`                                | Always wins over `fields`.                  |
| `cache`              | `CacheOptions \| false` | `{ ttl: 3600, maxEntries: 10000 }`  | Translation cache, shared by every request. |
| `failureMode`        | `'fallback' \| 'throw'` | `'fallback'`                        | What an engine error does.                  |
| `excludeRoutes`      | `string[]`              | `[]`                                | `'/health'`, `'/auth/*'`, `'/admin/**'`.    |
| `includeRoutes`      | `string[]`              | `[]`                                | When set, only these routes are handled.    |
| `bypassHeader`       | `string \| false`       | `'x-no-translation'`                | Request header that disables translation.   |
| `languageResolver`   | `(req) => string`       | —                                   | Highest-priority language source.           |

## Error handling

Translation never stops the API from answering. When the engine throws, the
original text is kept:

```typescript
TranslationModule.forRoot({
  // ...
  failureMode: 'fallback', // default
  onTranslationError: (error, context) => {
    logger.warn({ err: error, target: context.targetLanguage }, 'translation failed');
  },
});
```

`failureMode: 'throw'` lets the error reach your exception filters instead. Use
it in staging when you want failures to be loud.

## Reaching the pipeline directly

The pipeline and the translator are in the container, which is enough to
translate something outside the request cycle — a queued email, a push
notification:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { TRANSLATION_PIPELINE, TranslationPipeline } from '@offline-translator/nestjs';

@Injectable()
export class NotificationService {
  constructor(@Inject(TRANSLATION_PIPELINE) private readonly pipeline: TranslationPipeline) {}

  async localise(payload: unknown, language: string) {
    const { value } = await this.pipeline.translate(payload, language);
    return value;
  }
}
```

It shares the application's cache, so nothing is translated twice.

## Limitations

- Only the value a handler returns is translated. Writing to the underlying
  response object (`@Res()` without `passthrough: true`, `res.send(...)`)
  bypasses the interceptor.
- Non-HTTP contexts — GraphQL, microservices, WebSockets — are passed through
  untouched: there is no `Accept-Language` to read and no headers to set.
- The cache interface is synchronous, so an out-of-process cache needs a
  write-through layer. An async cache and a Redis adapter are on the roadmap.
- Everything else is inherited from the core package — see its
  [limitations](../middleware/README.md#limitations).

## License

MIT.
