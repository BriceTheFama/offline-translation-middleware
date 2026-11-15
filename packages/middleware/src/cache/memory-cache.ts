import type { TranslationCache } from '../types/index.js';

interface Entry {
  value: string;
  /** Epoch milliseconds; `0` means "never expires". */
  expiresAt: number;
}

export interface MemoryTranslationCacheOptions {
  /** Time to live in seconds. Default: `3600`. `0` disables expiry. */
  ttl?: number;
  /** Default: `10_000`. The least recently used entry is evicted first. */
  maxEntries?: number;
}

const DEFAULT_TTL_SECONDS = 3600;
const DEFAULT_MAX_ENTRIES = 10_000;

/**
 * In-process LRU cache with a TTL.
 *
 * A `Map` keeps insertion order, so the oldest key is always the first one —
 * re-inserting on every hit is all an LRU needs.
 */
export class MemoryTranslationCache implements TranslationCache {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: MemoryTranslationCacheOptions = {}) {
    const ttl = options.ttl ?? DEFAULT_TTL_SECONDS;
    this.ttlMs = ttl > 0 ? ttl * 1000 : 0;
    this.maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  get(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt !== 0 && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    if (this.entries.has(key)) this.entries.delete(key);
    else if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }

    this.entries.set(key, {
      value,
      expiresAt: this.ttlMs === 0 ? 0 : Date.now() + this.ttlMs,
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

/** Drop-in cache that stores nothing, used when caching is turned off. */
export class NoopTranslationCache implements TranslationCache {
  get(_key: string): undefined {
    return undefined;
  }
  set(_key: string, _value: string): void {
    // intentionally empty
  }
  clear(): void {
    // intentionally empty
  }
  get size(): number {
    return 0;
  }
}
