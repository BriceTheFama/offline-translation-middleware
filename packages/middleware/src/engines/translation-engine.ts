export type { TranslationEngine } from '../types/index.js';

import type { TranslationEngine } from '../types/index.js';

/** `true` when the engine can translate a whole batch in one call. */
export function supportsBatch(
  engine: TranslationEngine,
): engine is TranslationEngine & Required<Pick<TranslationEngine, 'translateBatch'>> {
  return typeof engine.translateBatch === 'function';
}
