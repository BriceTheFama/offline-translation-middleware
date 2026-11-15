import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

/** See the note in the middleware package: this list is the API contract. */
const PUBLIC_API = [
  'FakeTranslationEngine',
  'MemoryTranslationCache',
  'NoopTranslationCache',
  'TranslationConfigError',
  'TranslationEngineError',
  'createTranslator',
  'default',
  'translationPlugin',
];

describe('public API', () => {
  it('exports exactly the documented names', () => {
    expect(Object.keys(api).sort()).toEqual([...PUBLIC_API].sort());
  });

  it('exports the plugin as the default too', () => {
    expect(api.default).toBe(api.translationPlugin);
  });
});
