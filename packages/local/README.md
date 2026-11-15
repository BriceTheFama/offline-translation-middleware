# @offline-translator/local

Offline translation engine for
[`@offline-translator/middleware`](../middleware). It runs OPUS-MT models
locally, in your Node.js process, through
[Transformers.js](https://github.com/huggingface/transformers.js) and ONNX
Runtime.

No API key, no per-character billing, and — once the model is on disk — no
network access at all.

## Installation

```bash
npm install @offline-translator/local @huggingface/transformers
```

`@huggingface/transformers` is a peer dependency, so it stays out of your
install unless you actually want a local model. It brings ONNX Runtime along
(and, on most platforms, a prebuilt native binary).

## Usage

```typescript
import express from 'express';
import { translationMiddleware } from '@offline-translator/middleware';
import { LocalTranslationEngine } from '@offline-translator/local';

const engine = new LocalTranslationEngine();

// Optional but recommended: pay the model loads at boot, not on a user request.
// Both directions, so French content reaches English readers too.
await Promise.all([engine.warmup('en', 'fr'), engine.warmup('fr', 'en')]);

const app = express();
app.use(
  translationMiddleware({
    engine,
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr'],
    fields: ['name', 'title', 'description'],
  }),
);
```

It also works on its own:

```typescript
const engine = new LocalTranslationEngine();
await engine.translate('Welcome to our application', 'en', 'fr');
// 'Bienvenue dans notre application'

await engine.translateBatch(['Hello', 'Goodbye'], 'en', 'fr');
// ['Bonjour', 'Au revoir']

await engine.translate('Votre commande a été expédiée', 'fr', 'en');
// 'Your order has been shipped'
```

## Models

A language pair maps to `Xenova/opus-mt-{source}-{target}` by default —
`en > fr` becomes
[`Xenova/opus-mt-en-fr`](https://huggingface.co/Xenova/opus-mt-en-fr). The
first call for a pair downloads it (about 40 MB in `q8`) into the Transformers.js
cache directory; every call after that is local. `fr > en` is
[`Xenova/opus-mt-fr-en`](https://huggingface.co/Xenova/opus-mt-fr-en), a
separate model: serving both directions keeps two in memory.

Regional tags use their base language — OPUS-MT has no `fr-CA` model, so
`en > fr-CA` loads `Xenova/opus-mt-en-fr`, and `fr` and `fr-CA` share it. An
exact `'en>fr-CA'` entry in `models` still wins.

Marian models end most outputs with a period, even for a label: `Bonjour`
comes back as `Hello.`. The engine drops that period when the input had none;
`keepAddedPeriod: true` keeps it.

Override per pair, or wholesale:

```typescript
new LocalTranslationEngine({
  models: { 'en>fr': 'Xenova/opus-mt-en-fr', 'en>de': 'my-org/my-finetune' },
  modelResolver: (source, target) => `my-org/mt-${source}-${target}`,
});
```

One model is loaded per language pair, on demand, and kept in memory.

## Air-gapped deployments

Pre-download the models, ship them with your image, and refuse anything else:

```typescript
new LocalTranslationEngine({
  localModelPath: '/srv/models',
  allowRemoteModels: false,
});
```

## Options

| Option              | Type                         | Default                  | Description                                            |
| ------------------- | ---------------------------- | ------------------------ | ------------------------------------------------------ |
| `models`            | `Record<string, string>`     | —                        | Explicit `'en>fr'` to model id mapping, checked first. |
| `modelResolver`     | `(source, target) => string` | `Xenova/opus-mt-{s}-{t}` | Fallback resolution.                                   |
| `dtype`             | `'q8' \| 'fp32' \| ...`      | `'q8'`                   | Weight format. `q8` downloads ~4x smaller than `fp32`. |
| `cacheDir`          | `string`                     | Transformers.js default  | Where downloaded models live.                          |
| `localModelPath`    | `string`                     | —                        | Directory of pre-installed models.                     |
| `allowRemoteModels` | `boolean`                    | `true`                   | Set to `false` to forbid downloads.                    |
| `maxNewTokens`      | `number`                     | `512`                    | Generation cap per text.                               |
| `keepAddedPeriod`   | `boolean`                    | `false`                  | Keep the period the model adds to unpunctuated input.  |
| `onModelLoad`       | `(modelId) => void`          | —                        | Called when a model starts loading.                    |
| `transformers`      | `TransformersModule`         | —                        | Inject a preloaded module (tests).                     |

## Performance

Measured on Apple Silicon (M-series), `q8` weights, `Xenova/opus-mt-en-fr` and
`Xenova/opus-mt-fr-en` (same size, same cost):

| Step                        | Cost                  |
| --------------------------- | --------------------- |
| First download of the model | ~40 MB per pair, once |
| Cold load into memory       | ~10 s                 |
| 4 short sentences, batched  | ~110–170 ms           |

An ONNX session is single-threaded, so calls on the same model are serialised
inside the engine; `en > fr` and `fr > en` run independently. Under real traffic the middleware's cache is what
keeps this off the request path — the same sentence is translated once.

For heavy load, run the engine in a worker thread or a dedicated service, and
point the middleware at it with a small custom engine.

## Licensing

This package is MIT. What it downloads is not covered by that license:

- **OPUS-MT / Marian models** (`Helsinki-NLP`, converted by `Xenova`) are
  published under **CC-BY-4.0**. Attribution is required if you redistribute
  them or their outputs under that license. Check the model card of every model
  you actually ship.
- **ONNX Runtime** (via `onnxruntime-node`) is MIT.
- **Transformers.js** is Apache-2.0.

No model weights are bundled in this package; they are downloaded at runtime.

## Security note

The runtime dependency tree of `@huggingface/transformers` (ONNX Runtime,
`sharp`, `adm-zip`) carries advisories that are outside this project's control.
`@offline-translator/middleware` itself has **zero runtime dependencies** — if
that tree is a problem for you, keep the middleware and write a thin engine
against your own service.

## License

MIT
