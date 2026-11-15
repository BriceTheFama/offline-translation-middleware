/**
 * Turns the `fields` / `excludeFields` configuration into a fast predicate over
 * JSON key paths.
 *
 * Syntax:
 *   'name'            the key `name`, at any depth
 *   'data.name'       `name` directly under a root-level `data`
 *   'data[].name'     same thing; array indices are transparent either way
 *   'data.*.name'     exactly one segment in between
 *   'data.**.name'    any number of segments in between
 *   '**.name'         same as the bare 'name'
 */

type Segment =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'deep' };

export interface FieldMatcher {
  /** `keyPath` holds object keys only; array indices are filtered out upstream. */
  matches(keyPath: readonly string[]): boolean;
  readonly isEmpty: boolean;
}

const EMPTY_MATCHER: FieldMatcher = { matches: () => false, isEmpty: true };

export function createFieldMatcher(patterns: readonly string[]): FieldMatcher {
  const compiled = patterns
    .map((pattern) => compilePattern(pattern))
    .filter((segments): segments is Segment[] => segments.length > 0);

  if (compiled.length === 0) return EMPTY_MATCHER;

  return {
    isEmpty: false,
    matches(keyPath: readonly string[]): boolean {
      for (const segments of compiled) {
        if (matchFrom(segments, 0, keyPath, 0)) return true;
      }
      return false;
    },
  };
}

function compilePattern(pattern: string): Segment[] {
  const normalized = pattern.trim().replace(/\[\s*\*?\s*\]/g, '');
  if (normalized.length === 0) return [];

  const parts = normalized.split('.').filter((part) => part.length > 0);
  if (parts.length === 0) return [];

  // A bare field name means "this key, wherever it sits".
  const segments: Segment[] = parts.length === 1 && parts[0] !== '**' ? [{ kind: 'deep' }] : [];

  for (const part of parts) {
    if (part === '**') segments.push({ kind: 'deep' });
    else if (part === '*') segments.push({ kind: 'any' });
    else segments.push({ kind: 'literal', value: part });
  }

  return segments;
}

function matchFrom(
  segments: readonly Segment[],
  segmentIndex: number,
  path: readonly string[],
  pathIndex: number,
): boolean {
  let si = segmentIndex;
  let pi = pathIndex;

  while (si < segments.length) {
    const segment = segments[si] as Segment;

    if (segment.kind === 'deep') {
      for (let skip = pi; skip <= path.length; skip++) {
        if (matchFrom(segments, si + 1, path, skip)) return true;
      }
      return false;
    }

    if (pi >= path.length) return false;
    if (segment.kind === 'literal' && segment.value !== path[pi]) return false;

    si++;
    pi++;
  }

  return pi === path.length;
}
