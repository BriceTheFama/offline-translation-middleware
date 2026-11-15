# offline-translation-middleware

[![npm: middleware](https://img.shields.io/npm/v/@offline-translator/middleware?label=%40offline-translator%2Fmiddleware)](https://www.npmjs.com/package/@offline-translator/middleware)
[![npm: local](https://img.shields.io/npm/v/@offline-translator/local?label=%40offline-translator%2Flocal)](https://www.npmjs.com/package/@offline-translator/local)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Automatic English ↔ French translation of JSON API responses, offline, for
Express — with Fastify and NestJS adapters on the way.

Your handlers keep returning what they return; the client asks for a language
with `Accept-Language: fr` or `?lang=en` and gets it. Content in both languages
works too: each text is translated from its own language, English to French or
French to English, and a text already in the requested language is left alone.
Only the fields you configure are translated, results are cached and
deduplicated, and a translation failure never stops the API from answering.

```text
Frontend ──GET /api/products──> Backend ──> handler builds the JSON
                                                 |
                                       translation middleware
                                       (fields, language of each text,
                                        dedup, cache, engine)
                                                 |
Frontend <────────── translated JSON ────────────+
```

## Installation

```bash
npm install @offline-translator/middleware @offline-translator/local @huggingface/transformers
```

The middleware has zero runtime dependencies. The local engine runs the
[OPUS-MT](https://github.com/Helsinki-NLP/Opus-MT) models in your Node.js
process; each language pair downloads once (~40 MB), then everything runs
offline. Node.js 20 or later.

## Usage

```typescript
import express from 'express';
import { translationMiddleware } from '@offline-translator/middleware';
import { LocalTranslationEngine } from '@offline-translator/local';

const engine = new LocalTranslationEngine();
// Load both directions at boot, not on the first request.
await Promise.all([engine.warmup('en', 'fr'), engine.warmup('fr', 'en')]);

const app = express();
app.use(
  translationMiddleware({
    engine,
    sourceLanguage: 'en', // what your data is mostly written in
    defaultLanguage: 'fr', // when the client asks for nothing
    supportedLanguages: ['en', 'fr'],
    fields: ['title', 'description'], // only these keys are translated
    excludeRoutes: ['/health', '/auth/*'],
  }),
);

app.get('/products', (req, res) => {
  res.json([
    { title: 'Free shipping on all orders' },
    { title: 'Livraison offerte' }, // a French seller
  ]);
});
```

```bash
curl -H 'Accept-Language: fr' localhost:3000/products
# [{"title":"Livraison gratuite sur toutes les commandes"},{"title":"Livraison offerte"}]

curl -H 'Accept-Language: en' localhost:3000/products
# [{"title":"Free shipping on all orders"},{"title":"Delivery offered"}]
```

The language of each text comes from your `sourceLanguageResolver` when you
have one — a `lang` field on the record, say — then from a built-in
English/French detector, then from `sourceLanguage`. For user-generated content,
`undetectedLanguage: 'skip'` leaves a text whose language cannot be told as it
is, rather than risk it on the wrong model. Details in the
[middleware README](packages/middleware/README.md#english-and-french-in-one-api).

## Packages

| Package                                                 | npm                                                                    | Description                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@offline-translator/middleware`](packages/middleware) | [on npm](https://www.npmjs.com/package/@offline-translator/middleware) | The pipeline, and the Express middleware. Zero runtime dependencies. |
| [`@offline-translator/local`](packages/local)           | [on npm](https://www.npmjs.com/package/@offline-translator/local)      | Offline engine: OPUS-MT on ONNX Runtime, `en > fr` and `fr > en`.    |
| [`@offline-translator/fastify`](packages/fastify)       | not published yet                                                      | Fastify 4/5 plugin.                                                  |
| [`@offline-translator/nestjs`](packages/nestjs)         | not published yet                                                      | NestJS 10/11 module, both platforms.                                 |

The Fastify and NestJS adapters are complete and tested in this repository;
they take the same options as the Express middleware and behave identically,
and will be published to npm when needed. Start with the
[middleware README](packages/middleware/README.md), then the adapter's — it
covers what is specific to that framework.

## Develop and try it from the repository

```bash
npm install
npm test
npm run build
npm run demo          # Express: dictionary engine, prints the French and English responses
npm run demo:fastify
npm run demo:nestjs
```

For real neural models, `en > fr` and `fr > en` (downloads ~40 MB each the
first time):

```bash
npm install @huggingface/transformers -w @offline-translator/local
TRANSLATION_ENGINE=local npm run demo
```

To run the example API and poke at it yourself:

```bash
npm run example           # Express, port 3000
npm run example:fastify   # Fastify, port 3001
npm run example:nestjs    # NestJS,  port 3002

curl -H 'Accept-Language: fr' localhost:3000/products
curl 'localhost:3000/products?lang=en'
```

## Repository layout

```text
packages/middleware   the pipeline, the Express middleware, tests and benchmark
packages/fastify      the Fastify plugin
packages/nestjs       the NestJS module
packages/local        the optional local engine
examples/express      a runnable Express API
examples/fastify      the same API on Fastify
examples/nestjs       the same API on NestJS
docs                  design notes and the release process
```

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm test`          | Runs every test in every package               |
| `npm run build`     | Builds ESM + CJS + type declarations           |
| `npm run typecheck` | `tsc --noEmit` across the workspace            |
| `npm run lint`      | ESLint                                         |
| `npm run format`    | Prettier                                       |
| `npm run benchmark` | Pipeline benchmark, 10 to 1000 strings         |
| `npm run demo`      | Boots the example API and prints two responses |
| `npm run example`   | Starts the example API on port 3000            |

The `demo` and `example` scripts have `:fastify` and `:nestjs` variants.

## Relation to the Flutter package

This is the server-side counterpart of
[`offline_translate`](https://github.com/BriceTheFama/offline_translate), the
Flutter package that runs the same family of models on a device. Same idea,
other end of the wire: translate close to the user, without a cloud round-trip.

## License

MIT. Models downloaded by the optional local engine have their own licenses —
see [`packages/local`](packages/local/README.md#licensing).
