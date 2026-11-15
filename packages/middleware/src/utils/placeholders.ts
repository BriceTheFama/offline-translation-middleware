/**
 * Interpolation placeholders, kept away from the engine.
 *
 * A neural model reads `{count}` as a word and translates it: `You have {count}
 * new messages` comes back as `Vous avez {compte} nouveaux messages`, and the
 * front end's interpolation breaks. Each placeholder is swapped for an indexed
 * marker before the engine sees the text, and swapped back afterwards.
 *
 * `{0}`-style markers were chosen by measurement: OPUS-MT copies them through
 * verbatim in both directions, where `__0__`, `[0]`, `#0` or `<x0/>` get mangled.
 */

export interface MaskedText {
  /** The text the engine sees, with `{0}`, `{1}`... in place of placeholders. */
  readonly text: string;
  /** The original placeholders, by marker index. */
  readonly placeholders: readonly string[];
}

/** printf-style: `%s`, `%d`, `%1$s`, `%(name)s`, `%.2f`. No space flag: "50% off" is prose. */
const PRINTF = /%(?:\(\w+\)|\d+\$)?[-+0#]*\d*(?:\.\d+)?[sdifuxXoeEgGc@]/y;

/** A marker as the engine may hand it back, tolerating inner spaces: `{ 0 }`. */
const MARKER = /\{\s*(\d+)\s*\}/g;

/**
 * Masks `{name}`, `{{name}}`, `${name}`, `{0}`, whole ICU expressions
 * (`{count, plural, one {# item} other {# items}}`) and printf placeholders.
 * An unbalanced `{` is left as text.
 */
export function maskPlaceholders(text: string): MaskedText {
  const placeholders: string[] = [];
  let masked = '';
  let index = 0;

  while (index < text.length) {
    const start = text[index] === '$' && text[index + 1] === '{' ? index + 1 : index;

    if (text[start] === '{') {
      const end = matchingBrace(text, start);
      if (end !== -1) {
        masked += `{${placeholders.length}}`;
        placeholders.push(text.slice(index, end + 1));
        index = end + 1;
        continue;
      }
    }

    if (text[index] === '%') {
      PRINTF.lastIndex = index;
      const match = PRINTF.exec(text);
      if (match) {
        masked += `{${placeholders.length}}`;
        placeholders.push(match[0]);
        index += match[0].length;
        continue;
      }
    }

    masked += text[index];
    index++;
  }

  return { text: masked, placeholders };
}

/**
 * Puts the placeholders back. Returns `undefined` when the engine lost,
 * duplicated or invented a marker: a translation with a broken placeholder is
 * worse than no translation, so the caller keeps the original text.
 */
export function unmaskPlaceholders(
  translated: string,
  placeholders: readonly string[],
): string | undefined {
  if (placeholders.length === 0) return translated;

  const seen = new Array<number>(placeholders.length).fill(0);
  let valid = true;

  const restored = translated.replace(MARKER, (_marker, digits: string) => {
    const position = Number(digits);
    const placeholder = placeholders[position];
    if (placeholder === undefined) {
      valid = false;
      return '';
    }
    seen[position] = (seen[position] ?? 0) + 1;
    return placeholder;
  });

  if (!valid || seen.some((count) => count !== 1)) return undefined;
  return restored;
}

/** Index of the `}` closing the `{` at `open`, nesting included; `-1` if none. */
function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    if (text[index] === '{') depth++;
    else if (text[index] === '}') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}
