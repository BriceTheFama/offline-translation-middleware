const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

function escapeRegex(value: string): string {
  return value.replace(REGEX_SPECIALS, '\\$&');
}

export function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0] ?? '';
  const withoutHash = withoutQuery.split('#')[0] ?? '';
  if (withoutHash.length === 0) return '/';
  if (withoutHash.length > 1 && withoutHash.endsWith('/')) return withoutHash.slice(0, -1);
  return withoutHash;
}

/**
 * Compiles route patterns into a predicate.
 *
 * `*` matches inside one path segment, `**` matches across segments.
 * Anything else must match exactly. Query strings are ignored.
 */
export function createRouteMatcher(patterns: readonly string[]): (path: string) => boolean {
  if (patterns.length === 0) return () => false;

  const regexes = patterns.map((pattern) => {
    const body = normalizePath(pattern)
      .split('**')
      .map((part) => part.split('*').map(escapeRegex).join('[^/]*'))
      .join('.*');
    return new RegExp(`^${body}$`);
  });

  return (path: string): boolean => {
    const normalized = normalizePath(path);
    return regexes.some((regex) => regex.test(normalized));
  };
}
