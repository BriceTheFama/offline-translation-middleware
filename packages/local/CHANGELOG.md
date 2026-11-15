# Changelog

## [0.2.0] - 2026-11-15

### Added

- `keepAddedPeriod` option.
- Real-model test and smoke script for French to English, alongside English to
  French.

### Changed

- Regional language tags resolve to their base language: `en > fr-CA` loads
  `Xenova/opus-mt-en-fr`. An exact regional entry in `models` still wins.
- Models are cached and queued by model id, so `fr` and `fr-CA` share one
  loaded model.
- The final period the model adds to an input that had none is dropped
  (`Bonjour` gives `Hello`, not `Hello.`). Set `keepAddedPeriod: true` for the
  previous output.

## [0.1.0] - 2026-09-03

First release.

### Added

- `LocalTranslationEngine`, running OPUS-MT models through Transformers.js and
  ONNX Runtime, in-process and offline after the first download.
- Model resolution from the language pair (`Xenova/opus-mt-en-fr`), overridable
  per pair or through a resolver.
- `warmup()` to load a model before the first request.
- Batch translation in a single pipeline call, with per-pair serialisation of
  concurrent requests.
- Air-gapped operation through `localModelPath` and `allowRemoteModels: false`.
