# @offline-translator/middleware

Express middleware that translates the text fields of your JSON API responses
before they reach the frontend.

Your handlers keep returning English. The client asks for French with
`Accept-Language: fr`, and that is what it gets — no `t()` calls sprinkled
through your controllers, no translation table to maintain, no second endpoint.

```json
// what your handler returns          // what the client receives (Accept-Language: fr)
{ "name": "Hello",                    { "name": "Bonjour",
  "description": "Welcome to our        "description": "Bienvenue dans notre
                  application",                          application",
  "price": 5000,                        "price": 5000,
  "status": "ACTIVE" }                  "status": "ACTIVE" }
```

Only the fields you configure are touched. `price`, `status`, ids, emails and
URLs are left exactly as they were.

- **Zero runtime dependencies.** The package ships nothing but its own code.
- **Engine agnostic.** One tiny interface. Plug in a local model, a cloud API,
  or your own glossary.
- **Not only Express.** [`@offline-translator/fastify`](../fastify) and
  [`@offline-translator/nestjs`](../nestjs) are the same pipeline, wired into
  those frameworks.
- **Offline capable.** [`@offline-translator/local`](../local) runs OPUS-MT
  models on ONNX Runtime, in-process, no API key.
- **Never breaks your API.** An engine failure returns the original text.

## Installation

```bash
npm install @offline-translator/middleware
```

Node.js >= 20. Works with Express 4 and Express 5.

On another framework, install its adapter instead — the options below are
identical in all three:

| Framework | Package                                     |
| --------- | ------------------------------------------- |
| Express   | `@offline-translator/middleware` (this one) |
| Fastify   | [`@offline-translator/fastify`](../fastify) |
| NestJS    | [`@offline-translator/nestjs`](../nestjs)   |

## Quick start

```typescript
import express from 'express';
import { translationMiddleware, FakeTranslationEngine } from '@offline-translator/middleware';

const app = express();

app.use(
  translationMiddleware({
    engine: new FakeTranslationEngine(), // swap for a real one, see below
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr'],
    fields: ['name', 'title', 'description', 'message', 'label'],
  }),
);

app.get('/products', (req, res) => {
  res.json({
    success: true,
    data: [{ id: 1, name: 'Hello', description: 'Welcome to our application', price: 5000 }],
  });
});

app.listen(3000);
```

```bash
curl -H 'Accept-Language: fr' localhost:3000/products
# {"success":true,"data":[{"id":1,"name":"Bonjour","description":"Bienvenue dans notre application","price":5000}]}

curl -H 'Accept-Language: en' localhost:3000/products
# {"success":true,"data":[{"id":1,"name":"Hello","description":"Welcome to our application","price":5000}]}
```

A translated response carries `Content-Language: fr`, and every response on a
handled route carries `Vary: Accept-Language` so HTTP caches key on it.

## A real engine

`FakeTranslationEngine` is a dictionary for tests and demos. For actual
translation, install the local engine:

```bash
npm install @offline-translator/local @huggingface/transformers
```

```typescript
import { LocalTranslationEngine } from '@offline-translator/local';

const engine = new LocalTranslationEngine();
// Downloads each model once (~40 MB), then runs offline.
await Promise.all([engine.warmup('en', 'fr'), engine.warmup('fr', 'en')]);

app.use(translationMiddleware({ engine, defaultLanguage: 'fr', fields: ['name'] }));
```

It is a separate package on purpose: the models and the ONNX runtime weigh far
more than this middleware, and plenty of users bring their own engine.

## How it works

```text
res.json(body)
     |
     +-- route excluded, or X-No-Translation set?      -> untouched
     +-- body not JSON, empty, or over the size limit? -> untouched
     |
     v
find configured fields -> source language of each text
     -> already in the target language?                -> left alone
     -> deduplicate texts -> cache lookup
     -> translate what is missing (batched, bounded concurrency)
     -> cache the results -> rebuild the payload -> send
```

The payload is walked once. The original object is never mutated: only the
containers on a path that actually changed are cloned.

## Language detection

Highest priority first:

1. `languageResolver(req)`, when you provide one
2. the `?lang=fr` query parameter (rename it with `queryParameter`, disable it with `false`)
3. the `Accept-Language` header, quality values honoured
4. `defaultLanguage`

`fr-CA` matches a supported `fr`. A language outside `supportedLanguages` falls
back to `defaultLanguage` — or to `sourceLanguage`, with
`unsupportedLanguageStrategy: 'source'`. The API never fails over a language.

```typescript
translationMiddleware({
  // ...
  languageResolver: (req) => req.headers['x-language'] as string | undefined,
});
```

Return a falsy value from the resolver to fall through to the normal chain.

## English and French in one API

`sourceLanguage` is the language your API produces. Real APIs often return
both: an English catalogue with French reviews, sellers writing in either
language. So each text is translated from **its own** language:

- an English text requested in French goes through `en > fr`;
- a French text requested in English goes through `fr > en`;
- a text already in the requested language is left alone. This is not just a
  saving: an English-to-French model given French text invents an unrelated
  sentence.

The language of each text comes from, in order:

1. `sourceLanguageResolver(text, { path, parent })`, when you provide one;
2. the built-in English/French detector (`detectSourceLanguage`, on by default);
3. `sourceLanguage`, for a text the detector cannot tell — `Phone`, `iPhone 15`.

The detector is a zero-dependency heuristic built to abstain rather than guess.
When your data already says which language a record is in, use that instead:

```typescript
translationMiddleware({
  engine,
  sourceLanguage: 'en',
  defaultLanguage: 'fr',
  supportedLanguages: ['en', 'fr'],
  fields: ['title', 'body'],
  // { lang: 'fr', title: '...', body: '...' }
  sourceLanguageResolver: (_text, { parent }) =>
    Array.isArray(parent) ? undefined : (parent.lang as string | undefined),
});
```

Only a language in `supportedLanguages` (or `sourceLanguage`) is accepted from
the detector, so a guess never sends a text to a model you did not set up.
Cache entries are keyed by the text's own language pair.

### When the language cannot be told

A text the detector cannot place is assumed to be in `sourceLanguage`. For an
English catalogue that is right — `Phone` still becomes `Téléphone` — but a short
French title with no telling word would then be fed to the English model, which
answers with an invented sentence. When French content can come in without a
`lang` field, prefer leaving such texts alone:

```typescript
translationMiddleware({
  // ...
  undetectedLanguage: 'skip', // unsure? serve it as written
});
```

The cost is that short, ambiguous English labels (`Phone`, `Laptop`) stay in
English for French readers. `stats.unknownLanguage` counts them, and
`sourceLanguageResolver` still places anything your data can vouch for.

If your API is in one language only, `detectSourceLanguage: false` restores the
shortcut that skips a request for `sourceLanguage` without looking at the body.
An API written in French is just `sourceLanguage: 'fr', defaultLanguage: 'en'`.

## Choosing fields

Nothing is translated unless you ask for it. `fields` accepts:

| Pattern          | Matches                                                          |
| ---------------- | ---------------------------------------------------------------- |
| `'name'`         | the key `name`, at any depth                                     |
| `'data.name'`    | `name` directly under a root-level `data`                        |
| `'data[].name'`  | the same — array indices are transparent, so `data[3].name` hits |
| `'data.*.name'`  | exactly one segment in between                                   |
| `'data.**.name'` | any number of segments in between                                |

`excludeFields` uses the same syntax and always wins:

```typescript
fields: ['name', 'title', 'description', 'message', 'label'],
excludeFields: ['email', 'username', 'token', 'id', 'slug'],
```

On top of your configuration, values that no engine could improve are skipped
before a call is ever made: empty strings, strings without a single letter
(`'5000'`, `'+228 90 00 00 00'`), URLs, data URIs, emails, UUIDs, ISO dates,
hex colours, JWTs and long opaque tokens. Enum-looking values such as `ACTIVE`
are **not** skipped — if you put `status` in `fields`, you meant it.

The last word is yours:

```typescript
shouldTranslateValue: (text, path) => text.length > 3,
```

## Cache

On by default: an in-process LRU with a TTL, keyed by
`sourceLanguage + targetLanguage + text`. A sentence repeated a thousand times
across a response is translated once; the next request does not translate it at
all.

```typescript
cache: {
  enabled: true,
  ttl: 3600,        // seconds; 0 never expires
  maxEntries: 10000 // least recently used is evicted first
}
```

`cache: false` turns it off. To share a cache between processes, bring your own
store — anything with a synchronous `get`/`set`:

```typescript
import { MemoryTranslationCache } from '@offline-translator/middleware';

const shared = new MemoryTranslationCache({ ttl: 86_400, maxEntries: 50_000 });
app.use(translationMiddleware({ /* ... */ cache: { store: shared } }));
```

The interface is deliberately synchronous, so a Redis adapter needs a local
write-through layer. A first-class async cache is on the roadmap.

## Custom engine

```typescript
import type { TranslationEngine } from '@offline-translator/middleware';

class MyTranslator implements TranslationEngine {
  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
    const response = await fetch('https://my-translation-api.example/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, from: sourceLanguage, to: targetLanguage }),
    });
    const { translation } = await response.json();
    return translation;
  }

  // Optional. When present it is preferred, one call per `batchSize` texts.
  async translateBatch(texts: string[], from: string, to: string): Promise<string[]> {
    // must return one output per input, in order
    return Promise.all(texts.map((text) => this.translate(text, from, to)));
  }
}

app.use(translationMiddleware({ engine: new MyTranslator() /* ... */ }));
```

If a batch call fails, the middleware retries that batch one text at a time, so
a single bad string cannot take its neighbours down with it.

## Error handling

Translation never stops the API from answering. When the engine throws, the
original text is kept and the response goes out as usual:

```typescript
translationMiddleware({
  // ...
  failureMode: 'fallback', // default
  onTranslationError: (error, context) => {
    logger.warn({ err: error, target: context.targetLanguage }, 'translation failed');
  },
});
```

`failureMode: 'throw'` forwards the error to your Express error handler
instead. Use it in staging when you want failures to be loud.

## Without a framework

The same pipeline, minus the HTTP layer:

```typescript
import { createTranslator } from '@offline-translator/middleware';

const translator = createTranslator({
  engine,
  sourceLanguage: 'en',
  defaultLanguage: 'fr',
  fields: ['name', 'description'],
});

const french = await translator.translateResponse(payload, 'fr');
const { value, stats } = await translator.translateResponseWithStats(payload, 'fr');
const one = await translator.translateText('Welcome', 'fr');
```

## Building an adapter

Route filtering, the bypass header, language detection and the two response
headers are identical whatever the framework; only the way a body is
intercepted differs. `TranslationPipeline` is that shared half, and it is what
the Fastify and Nest adapters are built on.

```typescript
import { TranslationPipeline, mergeVary, VARY_HEADER_VALUE } from '@offline-translator/middleware';

const pipeline = new TranslationPipeline(options);

// Once per request, before the handler runs:
const plan = pipeline.plan(request); // { handled, translate, targetLanguage }
if (plan.handled && pipeline.setVaryHeader) {
  const merged = mergeVary(currentVaryHeader, VARY_HEADER_VALUE);
  if (merged !== undefined) setHeader('Vary', merged);
}

// Once the handler has produced a body:
if (plan.translate && pipeline.shouldTranslateBody(request, body)) {
  const result = await pipeline.translate(body, plan.targetLanguage);
  if (result.translated && pipeline.setContentLanguage) {
    setHeader('Content-Language', plan.targetLanguage);
  }
  body = result.value;
}
```

`request` only has to be structurally a `TranslationRequest`: `headers`, and
any of `query`, `path`, `originalUrl`, `url`, `method`. `mergeVary` returns
`undefined` when the header already covers the value, so it never duplicates
one another plugin set.

An engine failure rejects only under `failureMode: 'throw'`; read
`pipeline.failureMode` to decide whether to rethrow or send the original body.

## Observability

```typescript
translationMiddleware({
  // ...
  debug: true, // one line per response, on stderr
  onTranslationComplete: (stats) => metrics.record(stats),
});
```

```typescript
interface TranslationStats {
  sourceLanguage: string;
  targetLanguage: string;
  totalFields: number; // strings that matched the configuration
  uniqueTexts: number; // after deduplication
  translatedFields: number; // values actually replaced
  cacheHits: number;
  engineCalls: number; // texts handed to the engine
  errors: number;
  alreadyInTargetLanguage: number; // left alone, already in the requested language
  unknownLanguage: number; // left alone under undetectedLanguage: 'skip'
  durationMs: number;
}
```

## Configuration

| Option                        | Type                                              | Default                             | Description                                                      |
| ----------------------------- | ------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| `engine`                      | `TranslationEngine`                               | —                                   | **Required.** Does the actual translating.                       |
| `fields`                      | `string[]`                                        | —                                   | **Required.** Fields to translate.                               |
| `defaultLanguage`             | `string`                                          | —                                   | **Required.** Used when the request asks for nothing usable.     |
| `sourceLanguage`              | `string`                                          | `'en'`                              | Language your API produces; fallback when unsure.                |
| `sourceLanguageResolver`      | `(text, { path, parent }) => string \| undefined` | —                                   | Declares a text's language, ahead of detection.                  |
| `detectSourceLanguage`        | `boolean \| (text) => string \| undefined`        | `true`                              | Per-text English/French detection, or your own detector.         |
| `undetectedLanguage`          | `'source' \| 'skip'`                              | `'source'`                          | A text of unknown language: assume `sourceLanguage`, or skip it. |
| `supportedLanguages`          | `string[]`                                        | `[sourceLanguage, defaultLanguage]` | Allow-list of targets.                                           |
| `excludeFields`               | `string[]`                                        | `[]`                                | Always wins over `fields`.                                       |
| `cache`                       | `CacheOptions \| false`                           | `{ ttl: 3600, maxEntries: 10000 }`  | Translation cache.                                               |
| `failureMode`                 | `'fallback' \| 'throw'`                           | `'fallback'`                        | What an engine error does.                                       |
| `concurrency`                 | `number`                                          | `5`                                 | Maximum simultaneous engine calls.                               |
| `batchSize`                   | `number`                                          | `25`                                | Texts per call when the engine batches.                          |
| `maxTextLength`               | `number`                                          | `5000`                              | Longer strings are left alone.                                   |
| `maxDepth`                    | `number`                                          | `100`                               | Deeper nesting is not visited.                                   |
| `maxResponseSize`             | `number`                                          | `2097152`                           | Payload budget in characters; bigger responses pass through.     |
| `shouldTranslateValue`        | `(text, path) => boolean`                         | —                                   | Final say on a matched value.                                    |
| `queryParameter`              | `string \| false`                                 | `'lang'`                            | Query parameter holding the language.                            |
| `useAcceptLanguageHeader`     | `boolean`                                         | `true`                              | Read `Accept-Language`.                                          |
| `languageResolver`            | `(req) => string \| undefined`                    | —                                   | Highest-priority language source.                                |
| `unsupportedLanguageStrategy` | `'default' \| 'source'`                           | `'default'`                         | Fallback for an unsupported language.                            |
| `excludeRoutes`               | `string[]`                                        | `[]`                                | `'/health'`, `'/auth/*'`, `'/admin/**'`.                         |
| `includeRoutes`               | `string[]`                                        | `[]`                                | When set, only these routes are handled.                         |
| `shouldTranslate`             | `(req, body) => boolean`                          | —                                   | Per-request escape hatch.                                        |
| `bypassHeader`                | `string \| false`                                 | `'x-no-translation'`                | Request header that disables translation.                        |
| `setContentLanguage`          | `boolean`                                         | `true`                              | Send `Content-Language` on a translated response.                |
| `setVaryHeader`               | `boolean`                                         | `true`                              | Send `Vary: Accept-Language`.                                    |
| `debug`                       | `boolean`                                         | `false`                             | One summary line per response, on stderr.                        |
| `onTranslationError`          | `(error, context) => void`                        | —                                   | Engine failure hook.                                             |
| `onTranslationComplete`       | `(stats) => void`                                 | —                                   | Statistics hook.                                                 |

## Performance

Measured with `npm run benchmark` (Node 24, Apple Silicon, engine latency 2 ms):

| Scenario                  | Strings | Engine calls | Duration |
| ------------------------- | ------- | ------------ | -------- |
| 1000 strings, cold cache  | 1000    | 1000         | 21 ms    |
| 1000 strings, warm cache  | 1000    | 0            | 1.5 ms   |
| 1000 strings, 20 distinct | 1000    | 20           | 3 ms     |

The package's own cost — walk, dedup, cache lookup, rebuild — is about **1 µs
per string**. Everything else is the engine, which is why deduplication and the
cache matter more than any micro-optimisation.

Things that keep it fast:

- one traversal per response, and no extra `JSON.stringify`
- deduplication before the cache, cache before the engine
- bounded concurrency, so a big payload cannot open 500 model sessions
- untouched subtrees are shared, not copied

## Security

- Only the fields you configure are read. Headers, cookies and tokens are never
  sent to the engine.
- JWTs, long opaque tokens, emails and UUIDs are skipped even inside a
  configured field.
- `maxResponseSize` (2 MB of text by default) bounds the work a single response
  can trigger.
- Debug logs are truncated and stripped of control characters, and never print
  payload values.
- Note that whatever you do translate is sent to your engine. With a cloud
  engine, that is data leaving your infrastructure — one more reason to keep
  `fields` narrow, or to run
  [`@offline-translator/local`](../local).

## Limitations

- `res.json()` and `res.send(object)` are intercepted. Streams, buffers, files
  and manual `res.end()` are not — by design.
- The cache interface is synchronous, so an out-of-process cache needs a
  write-through layer.
- Source-language detection knows English and French only. Other languages
  need `sourceLanguageResolver` or your own `detectSourceLanguage`.
- Translation quality is entirely the engine's business.
- Placeholders such as `{count}` or `%s` inside a translated string may be
  reordered or mangled by a neural engine. Keep interpolation out of translated
  fields, or handle it in your engine.

## Roadmap

- **v0.2** — Fastify and NestJS adapters, `TranslationPipeline` as the
  documented extension point
- **v0.3** _(this release)_ — English and French in one API: per-text source
  language, detection, `fr > en` alongside `en > fr`
- **v0.4** — async cache interface and a Redis adapter, batching across
  requests rather than only within one response
- **v0.5** — detection beyond English and French, more engines, glossary and
  do-not-translate markers
- **v1.0** — the API frozen under semver

## License

MIT. The optional local engine pulls in models and runtimes under their own
licenses — see [`@offline-translator/local`](../local).
