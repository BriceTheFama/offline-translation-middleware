import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

/** See the note in the middleware package: this list is the API contract. */
const PUBLIC_API = [
  'FakeTranslationEngine',
  'MemoryTranslationCache',
  'NoopTranslationCache',
  'TRANSLATION_OPTIONS',
  'TRANSLATION_PIPELINE',
  'TranslationConfigError',
  'TranslationEngineError',
  'TranslationInterceptor',
  'TranslationModule',
  'TranslationPipeline',
  'createTranslator',
];

describe('public API', () => {
  it('exports exactly the documented names', () => {
    expect(Object.keys(api).sort()).toEqual([...PUBLIC_API].sort());
  });
});
