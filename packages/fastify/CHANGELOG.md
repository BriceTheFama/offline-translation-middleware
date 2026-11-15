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

- `translationPlugin`, a Fastify 4/5 plugin translating JSON payloads in
  `preSerialization`, with route filtering, the bypass header and the target
  language resolved in `onRequest`.
- `Content-Language` on translated responses, `Vary: Accept-Language` on
  handled routes, merged with any `Vary` already set.
- Every option of the Express middleware, behaving identically.
- `failureMode: 'throw'` forwards to Fastify's error handler; `'fallback'`
  returns the untranslated payload.
- The core engines, caches, errors and types are re-exported, so an application
  needs only this package.
