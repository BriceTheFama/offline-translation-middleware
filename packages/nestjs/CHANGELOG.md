# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-15

### Changed

- Requires `@offline-translator/middleware` `^0.3.0`, and with it English and
  French in the same response: each text is translated from its own language,
  and a text already in the requested language is left alone. New options
  `sourceLanguageResolver`, `detectSourceLanguage` and `undetectedLanguage`
  behave exactly as in the Express middleware.
- A request for `sourceLanguage` now reaches the body when per-text detection
  is on (the default), so French texts can be translated into English.
  `detectSourceLanguage: false` restores the previous shortcut.

## [0.2.0] - 2026-09-03

First release.

### Added

- `TranslationModule.forRoot()` and `forRootAsync()`, wiring the pipeline into
  a Nest 10/11 application as a global module. An invalid configuration throws
  at import time rather than on the first request.
- `TranslationInterceptor`, translating the value a handler returns. Registered
  as an `APP_INTERCEPTOR` by default; `global: false` leaves it to
  `@UseInterceptors()`.
- `TRANSLATION_PIPELINE` and `TRANSLATION_OPTIONS` injection tokens, so the
  pipeline — and its cache — can be reused outside the request cycle.
- Support for both platforms, `@nestjs/platform-express` and
  `@nestjs/platform-fastify`.
- `Content-Language` on translated responses, `Vary: Accept-Language` on
  handled routes, merged with any `Vary` already set.
- Non-HTTP execution contexts pass through untouched.
- The core engines, caches, errors and types are re-exported, so an application
  needs only this package.
