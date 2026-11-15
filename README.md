# offline-translation-middleware

Automatic translation of JSON API responses, for Express, Fastify and NestJS.

Your handlers keep returning English; the client asks for French with
`Accept-Language: fr` and receives French. Content in both languages works too:
each text is translated from its own language, English to French or French to
English, and a text already in the requested language is left alone. Only the fields you configure are
translated, results are cached and deduplicated, and a translation failure
never stops the API from answering.

```text
Frontend ──GET /api/products──> Backend ──> handler builds the JSON
                                                 |
                                       translation middleware
                                       (fields, dedup, cache, engine)
                                                 |
Frontend <────────── translated JSON ────────────+
```

## Packages

| Package                                                 | Description                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@offline-translator/middleware`](packages/middleware) | The pipeline, and the Express middleware. Zero runtime dependencies. |
| [`@offline-translator/fastify`](packages/fastify)       | Fastify 4/5 plugin.                                                  |
| [`@offline-translator/nestjs`](packages/nestjs)         | NestJS 10/11 module, both platforms.                                 |
| [`@offline-translator/local`](packages/local)           | Optional offline engine: OPUS-MT on ONNX Runtime.                    |

The three adapters take the same options and behave identically; they differ
only in where they hook into the framework. Start with the
[middleware README](packages/middleware/README.md), then the adapter's — it
covers what is specific to that framework.

## Try it

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
