import { describe, expect, it } from 'vitest';
import * as api from '../src/index.js';

/**
 * The package's published value exports.
 *
 * This list is the API contract, and changing it is a deliberate act: adding a
 * name is a minor release, removing or renaming one is a major. Type-only
 * exports are absent because they do not exist at runtime — the consumer's own
 * `tsc` is what catches a change there.
 */
const PUBLIC_API = [
  'FakeTranslationEngine',
  'MemoryTranslationCache',
  'NoopTranslationCache',
  'ResponseTranslator',
  'TranslationConfigError',
  'TranslationEngineError',
  'TranslationPipeline',
  'VARY_HEADER_VALUE',
  'buildCacheKey',
  'createTranslator',
  'detectEnglishOrFrench',
  'mergeVary',
  'translationMiddleware',
];

describe('public API', () => {
  it('exports exactly the documented names', () => {
    expect(Object.keys(api).sort()).toEqual([...PUBLIC_API].sort());
  });
});
