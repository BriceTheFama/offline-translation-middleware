import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryTranslationCache, NoopTranslationCache } from '../src/cache/memory-cache.js';
import { buildCacheKey } from '../src/cache/cache.interface.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('MemoryTranslationCache', () => {
  it('stores and reads values', () => {
    const cache = new MemoryTranslationCache();
    cache.set('k', 'Bonjour');
    expect(cache.get('k')).toBe('Bonjour');
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after the ttl', () => {
    vi.useFakeTimers();
    const cache = new MemoryTranslationCache({ ttl: 60 });
    cache.set('k', 'Bonjour');

    vi.advanceTimersByTime(59_000);
    expect(cache.get('k')).toBe('Bonjour');

    vi.advanceTimersByTime(2_000);
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('never expires when ttl is 0', () => {
    vi.useFakeTimers();
    const cache = new MemoryTranslationCache({ ttl: 0 });
    cache.set('k', 'Bonjour');
    vi.advanceTimersByTime(10 * 365 * 24 * 3600 * 1000);
    expect(cache.get('k')).toBe('Bonjour');
  });

  it('evicts the least recently used entry past maxEntries', () => {
    const cache = new MemoryTranslationCache({ maxEntries: 2 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.get('a'); // 'a' becomes the most recent
    cache.set('c', '3');

    expect(cache.size).toBe(2);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('c')).toBe('3');
  });

  it('overwrites without growing', () => {
    const cache = new MemoryTranslationCache();
    cache.set('a', '1');
    cache.set('a', '2');
    expect(cache.size).toBe(1);
    expect(cache.get('a')).toBe('2');
  });

  it('clears and deletes', () => {
    const cache = new MemoryTranslationCache();
    cache.set('a', '1');
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    cache.set('b', '2');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('NoopTranslationCache', () => {
  it('stores nothing', () => {
    const cache = new NoopTranslationCache();
    cache.set('a', '1');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});

describe('buildCacheKey', () => {
  it('scopes keys by language pair', () => {
    expect(buildCacheKey('en', 'fr', 'Hello')).not.toBe(buildCacheKey('en', 'es', 'Hello'));
    expect(buildCacheKey('en', 'fr', 'Hello')).toBe(buildCacheKey('en', 'fr', 'Hello'));
  });

  it('hashes long texts instead of storing them inline', () => {
    const long = 'x'.repeat(500);
    const key = buildCacheKey('en', 'fr', long);
    expect(key.length).toBeLessThan(100);
    expect(key).toBe(buildCacheKey('en', 'fr', long));
    expect(key).not.toBe(buildCacheKey('en', 'fr', `${long}!`));
  });
});
