# @offline-translator/fastify

Fastify plugin that translates the text fields of your JSON API responses
before they reach the frontend.

Your handlers keep returning English. The client asks for French with
`Accept-Language: fr`, and that is what it gets — no `t()` calls in your route
handlers, no translation table to maintain, no second endpoint.

```json
// what your handler returns          // what the client receives (Accept-Language: fr)
{ "name": "Hello",                    { "name": "Bonjour",
  "price": 5000,                        "price": 5000,
  "status": "ACTIVE" }                  "status": "ACTIVE" }
```

This is the Fastify adapter for
[`@offline-translator/middleware`](../middleware). Fields, language detection,
cache, engine contract and error handling are the same; only the way the body
is intercepted differs.

## Installation

```bash
npm install @offline-translator/fastify
```

Node.js >= 20, Fastify 4 or 5. `fastify` is a peer dependency; the plugin adds
no runtime dependency of its own beyond the core package.

## Quick start

```typescript
import Fastify from 'fastify';
import { translationPlugin, FakeTranslationEngine } from '@offline-translator/fastify';

const app = Fastify();

await app.register(translationPlugin, {
  engine: new FakeTranslationEngine(), // swap for a real one
  sourceLanguage: 'en',
  defaultLanguage: 'fr',
  supportedLanguages: ['en', 'fr'],
  fields: ['name', 'title', 'description', 'message', 'label'],
});

app.get('/products', async () => ({
  success: true,
  data: [{ id: 1, name: 'Hello', description: 'Welcome to our application', price: 5000 }],
}));

await app.listen({ port: 3000 });
```

```bash
curl -H 'Accept-Language: fr' localhost:3000/products
# {"success":true,"data":[{"id":1,"name":"Bonjour","description":"Bienvenue dans notre application","price":5000}]}
```

A translated response carries `Content-Language: fr`, and every response on a
handled route carries `Vary: Accept-Language` so HTTP caches key on it.

For a real engine, install [`@offline-translator/local`](../local) — OPUS-MT on
ONNX Runtime, in-process, no API key — or implement the one-method
`TranslationEngine` interface yourself. Both are covered in the
[middleware README](../middleware/README.md#a-real-engine).

## Where it runs

```text
onRequest          route filtering, bypass header, target language, Vary
   |
your handler       untouched
   |
preSerialization   translate the payload, set Content-Language
   |
serialization      Fastify's own, with your schema if you declared one
```

`preSerialization` is the Fastify counterpart of wrapping `res.json`: it sees
the value your handler returned, before it becomes a string. Fastify skips the
hook for strings, buffers, streams and `null`, so files and hand-built payloads
are never touched — no configuration needed.

Because the plugin translates _before_ serialization, a route with a response
schema still validates and serialises normally. Note that `fast-json-stringify`
drops properties your schema does not declare, translated or not.

## Scope

The plugin registers its hooks on the scope it is registered into — the root
application, in the usual case — so routes declared before and after the
`register()` call are both covered.

Scope translation with route patterns rather than with Fastify encapsulation:

```typescript
await app.register(translationPlugin, {
  // ...
  excludeRoutes: ['/health', '/metrics', '/auth/*'],
  // or, to opt in instead of out:
  includeRoutes: ['/api/**'],
});
```

## Options

Every option of the Express middleware, unchanged — see the
[configuration table](../middleware/README.md#configuration) for the full list.
The ones you will reach for first:

| Option               | Type                    | Default                             | Description                                 |
| -------------------- | ----------------------- | ----------------------------------- | ------------------------------------------- |
| `engine`             | `TranslationEngine`     | —                                   | **Required.** Does the actual translating.  |
| `fields`             | `string[]`              | —                                   | **Required.** Fields to translate.          |
| `defaultLanguage`    | `string`                | —                                   | **Required.** Fallback target language.     |
| `sourceLanguage`     | `string`                | `'en'`                              | Language your API produces.                 |
| `supportedLanguages` | `string[]`              | `[sourceLanguage, defaultLanguage]` | Allow-list of targets.                      |
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
await app.register(translationPlugin, {
  // ...
  failureMode: 'fallback', // default
  onTranslationError: (error, context) => {
    app.log.warn({ err: error, target: context.targetLanguage }, 'translation failed');
  },
});
```

`failureMode: 'throw'` sends the error to Fastify's error handler instead —
`setErrorHandler`, or the default 500. Use it in staging when you want failures
to be loud.

## TypeScript

The plugin is typed against `FastifyInstance`, so `register()` type-checks its
options for you. It also re-exports the core types and helpers, so nothing
needs `@offline-translator/middleware` in your `package.json`:

```typescript
import type { TranslationEngine, TranslationStats } from '@offline-translator/fastify';
```

## Limitations

- Only the payload passed to the reply is translated. `reply.raw` writes and
  manual `end()` calls bypass Fastify's serialisation, and therefore this
  plugin.
- A response schema that omits a field drops it during serialisation, whether
  or not it was translated.
- The cache interface is synchronous, so an out-of-process cache needs a
  write-through layer. An async cache and a Redis adapter are on the roadmap.
- Everything else is inherited from the core package — see its
  [limitations](../middleware/README.md#limitations).

## License

MIT.
