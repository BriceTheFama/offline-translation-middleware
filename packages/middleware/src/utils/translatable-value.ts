/**
 * Value-level guards.
 *
 * Field selection is the developer's job; this only filters out strings that
 * no translation engine could improve — and that would otherwise burn a model
 * call. It never looks at the key, so an explicitly configured field is still
 * honoured for anything that carries actual words.
 */

const LETTER = /\p{L}/u;
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/\/|www\.)\S*$/i;
const DATA_URI = /^data:[a-z]+\/[a-z0-9.+-]+;/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const JWT = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+$/;
const LONG_OPAQUE_TOKEN = /^[A-Za-z0-9_-]{40,}$/;

/** `true` when the string carries natural language worth sending to an engine. */
export function isTranslatableText(value: string): boolean {
  const text = value.trim();
  if (text.length === 0) return false;
  if (!LETTER.test(text)) return false;
  if (URL_LIKE.test(text)) return false;
  if (DATA_URI.test(text)) return false;
  if (EMAIL.test(text)) return false;
  if (UUID.test(text)) return false;
  if (ISO_DATE.test(text)) return false;
  if (HEX_COLOR.test(text)) return false;
  if (JWT.test(text)) return false;
  if (LONG_OPAQUE_TOKEN.test(text)) return false;
  return true;
}
