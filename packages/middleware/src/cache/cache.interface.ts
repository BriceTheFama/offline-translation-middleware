import { createHash } from 'node:crypto';

export type { CacheOptions, TranslationCache } from '../types/index.js';

/** Beyond this many characters the text is hashed instead of stored inline. */
const INLINE_KEY_LIMIT = 256;

/**
 * Cache keys are scoped by language pair, so the same sentence translated into
 * two languages never collides.
 */
export function buildCacheKey(
  sourceLanguage: string,
  targetLanguage: string,
  text: string,
): string {
  const prefix = `${sourceLanguage}>${targetLanguage}:`;
  if (text.length <= INLINE_KEY_LIMIT) return prefix + text;
  return `${prefix}#${createHash('sha256').update(text).digest('base64url')}`;
}
