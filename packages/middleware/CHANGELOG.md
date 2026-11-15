# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2026-11-15

### Fixed

- Interpolation placeholders are no longer translated. `{count}` used to come
  back from OPUS-MT as `{compte}`, breaking interpolation on the client. They
  are now replaced by markers the model copies through verbatim — `{0}`,
  `{1}`... — and restored afterwards. Covered: `{name}`, `{{name}}`,
  `${name}`, `{0}`, whole ICU expressions and printf placeholders. A
  translation that loses or duplicates one is discarded and the original text
  served, counted in `stats.errors` and reported to `onTranslationError`.
- Engine errors are reported with the original text, not the masked one.

### Added

- `protectPlaceholders` (default `true`) to turn the above off.

## [0.3.0] - 2026-11-15

English and French in the same API: each text is translated from its own
language, and a text already in the requested language is left alone.

### Added

- `detectSourceLanguage` (default `true`): per-text English/French detection,
  or a detector of your own. Only a supported language is accepted from it.
- `sourceLanguageResolver(text, { path, parent })`, to declare a text's
  language — from a sibling `lang` key, for instance — ahead of detection.
- `undetectedLanguage: 'source' | 'skip'`: what to do with a text whose
  language cannot be told. `'skip'` serves it as written instead of risking a
  French text on an English model.
- `detectEnglishOrFrench()`, the built-in detector, exported. It reads short
  French titles from their spelling too (`Livraison offerte`,
  `Lunettes de soleil`) and abstains rather than guess.
- `TranslationStats.unknownLanguage`.
- `TranslationStats.alreadyInTargetLanguage`.
- A `fr>en` dictionary in `FakeTranslationEngine`.

### Changed

- With per-text source languages on — the default — a request for
  `sourceLanguage` is no longer skipped up front: its body is walked, and texts
  in another language are translated. `detectSourceLanguage: false` restores the
  previous behaviour for single-language APIs.
- Cache keys and engine calls use each text's own language pair.
- `unsupportedLanguageStrategy: 'source'` now serves the body untranslated,
  whatever language each text is in.

Adapters for Fastify and NestJS, built on a documented extension point. No
breaking change: every 0.1.0 export behaves as before.

### Added

- `TranslationPipeline`, the framework-free half of an HTTP adapter — route
  filtering, the bypass header, language detection and the header rules, with
  body interception left to the caller. `plan()`, `shouldTranslateBody()` and
  `translate()` are what an adapter needs.
- `mergeVary()` and `VARY_HEADER_VALUE`, so an adapter appends to a `Vary`
  header another plugin may already have set, without duplicating it.
- `TranslationPlan`, the per-request decision the pipeline returns.
- A public-API test pinning the package's value exports, so a change to the
  published surface has to be deliberate.

### Changed

- `translationMiddleware()` is now a thin Express binding over
  `TranslationPipeline`. Same behaviour, same options, same headers.

### Companion packages

- [`@offline-translator/fastify`](../fastify) — Fastify 4/5 plugin.
- [`@offline-translator/nestjs`](../nestjs) — NestJS 10/11 module.

## [0.1.0] - 2026-09-03

First release.

### Added

- `translationMiddleware()` for Express, wrapping `res.json`.
- Language detection: custom resolver, `?lang=`, `Accept-Language`, then
  `defaultLanguage`; `fr-CA` resolves to a supported `fr`.
- Field selection by name, dotted path, `*` and `**` wildcards, with array
  indices transparent. `excludeFields` always wins.
- Value guards for URLs, emails, UUIDs, ISO dates, hex colours, JWTs and long
  opaque tokens.
- In-process LRU cache with TTL and `maxEntries`, keyed by language pair and
  text; pluggable through `cache.store`.
- Deduplication, optional `translateBatch`, bounded concurrency, and a per-text
  retry when a batch fails.
- `failureMode: 'fallback' | 'throw'`, `onTranslationError`,
  `onTranslationComplete`, `debug`.
- Route filtering (`excludeRoutes`, `includeRoutes`), `shouldTranslate`,
  `X-No-Translation` bypass header.
- `Content-Language` on translated responses, `Vary: Accept-Language` on
  handled routes.
- `maxResponseSize`, `maxTextLength` and `maxDepth` guards.
- `createTranslator()` for use without Express.
- `FakeTranslationEngine` for tests and demos.
