import { describe, expect, it } from 'vitest';
import { createRouteMatcher, normalizePath } from '../src/utils/route-matcher.js';

describe('normalizePath', () => {
  it('drops query strings, hashes and trailing slashes', () => {
    expect(normalizePath('/products?lang=fr')).toBe('/products');
    expect(normalizePath('/products/')).toBe('/products');
    expect(normalizePath('/products#top')).toBe('/products');
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });
});

describe('createRouteMatcher', () => {
  it('matches exact routes', () => {
    const matches = createRouteMatcher(['/health', '/metrics']);
    expect(matches('/health')).toBe(true);
    expect(matches('/metrics')).toBe(true);
    expect(matches('/health/live')).toBe(false);
    expect(matches('/products')).toBe(false);
  });

  it('matches a single segment with *', () => {
    const matches = createRouteMatcher(['/auth/*']);
    expect(matches('/auth/login')).toBe(true);
    expect(matches('/auth/login/callback')).toBe(false);
    expect(matches('/auth')).toBe(false);
  });

  it('matches across segments with **', () => {
    const matches = createRouteMatcher(['/auth/**']);
    expect(matches('/auth/login')).toBe(true);
    expect(matches('/auth/login/callback')).toBe(true);
  });

  it('never matches when the list is empty', () => {
    expect(createRouteMatcher([])('/anything')).toBe(false);
  });

  it('does not let dots act as wildcards', () => {
    const matches = createRouteMatcher(['/a.b']);
    expect(matches('/axb')).toBe(false);
    expect(matches('/a.b')).toBe(true);
  });
});
