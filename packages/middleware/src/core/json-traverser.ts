import type { PathSegment, ShouldTranslateValue } from '../types/index.js';
import type { FieldMatcher } from './field-matcher.js';

export interface TranslatableSlot {
  /** Full path, array indices included, used to write the value back. */
  readonly path: PathSegment[];
  readonly text: string;
  /**
   * Language of `text`, when the collector was given `resolveSource`;
   * `undefined` there means it could not be told.
   */
  readonly source?: string;
}

export interface CollectOptions {
  readonly include: FieldMatcher;
  readonly exclude: FieldMatcher;
  readonly maxTextLength: number;
  readonly maxDepth: number;
  /** Budget in characters; traversal stops as soon as it is blown. */
  readonly maxResponseSize: number;
  readonly isTranslatableText: (text: string) => boolean;
  readonly shouldTranslateValue?: ShouldTranslateValue;
  /** Per-value source language; receives the container holding the value. */
  readonly resolveSource?: (
    text: string,
    path: PathSegment[],
    parent: Record<string, unknown> | unknown[],
  ) => string | undefined;
}

export interface CollectResult {
  readonly slots: TranslatableSlot[];
  /** Distinct texts, in first-seen order. */
  readonly texts: string[];
  readonly approxSize: number;
  /** `true` when the payload blew the size budget; `slots` is then empty. */
  readonly exceededSize: boolean;
}

const EMPTY_RESULT: CollectResult = {
  slots: [],
  texts: [],
  approxSize: 0,
  exceededSize: false,
};

/**
 * Single pass over the payload: finds every string worth translating, measures
 * the payload as it goes, and deduplicates the texts along the way.
 */
export function collectTranslatableSlots(root: unknown, options: CollectOptions): CollectResult {
  if (!isContainer(root)) return EMPTY_RESULT;

  const slots: TranslatableSlot[] = [];
  const seen = new Set<string>();
  const texts: string[] = [];
  const fullPath: PathSegment[] = [];
  const keyPath: string[] = [];
  let approxSize = 0;
  let exceededSize = false;

  const visit = (
    value: unknown,
    depth: number,
    parent: Record<string, unknown> | unknown[] | undefined,
  ): void => {
    if (exceededSize || depth > options.maxDepth) return;

    if (Array.isArray(value)) {
      approxSize += 2 + value.length;
      for (let index = 0; index < value.length; index++) {
        if (exceededSize) return;
        fullPath.push(index);
        visit(value[index], depth + 1, value);
        fullPath.pop();
      }
      return;
    }

    if (isPlainObject(value)) {
      approxSize += 2;
      for (const key of Object.keys(value)) {
        if (exceededSize) return;
        approxSize += key.length + 3;
        fullPath.push(key);
        keyPath.push(key);
        visit(value[key], depth + 1, value);
        keyPath.pop();
        fullPath.pop();
      }
      return;
    }

    if (typeof value !== 'string') {
      approxSize += 8;
      return;
    }

    approxSize += value.length + 2;
    if (approxSize > options.maxResponseSize) {
      exceededSize = true;
      return;
    }

    if (keyPath.length === 0 || parent === undefined) return;
    if (value.length > options.maxTextLength) return;
    if (!options.include.matches(keyPath)) return;
    if (options.exclude.matches(keyPath)) return;
    if (!options.isTranslatableText(value)) return;

    const path = fullPath.slice();
    if (options.shouldTranslateValue && !options.shouldTranslateValue(value, path)) return;

    slots.push(
      options.resolveSource
        ? { path, text: value, source: options.resolveSource(value, path, parent) }
        : { path, text: value },
    );
    if (!seen.has(value)) {
      seen.add(value);
      texts.push(value);
    }
  };

  visit(root, 0, undefined);

  if (exceededSize) {
    return { slots: [], texts: [], approxSize, exceededSize: true };
  }

  return { slots, texts, approxSize, exceededSize: false };
}

interface TrieNode {
  children: Map<PathSegment, TrieNode>;
  text?: string;
  source?: string;
}

export interface ApplyResult<T> {
  readonly value: T;
  readonly replaced: number;
}

/**
 * Rebuilds the payload with the translations applied.
 *
 * Only the containers on a path that actually changed are cloned; everything
 * else is shared with the original object, which is never mutated.
 */
export function applyTranslations<T>(
  root: T,
  slots: readonly TranslatableSlot[],
  resolve: (text: string, source: string | undefined) => string | undefined,
): ApplyResult<T> {
  if (slots.length === 0) return { value: root, replaced: 0 };

  const trie: TrieNode = { children: new Map() };
  for (const slot of slots) {
    let node = trie;
    for (const segment of slot.path) {
      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.text = slot.text;
    node.source = slot.source;
  }

  let replaced = 0;

  const rebuild = (value: unknown, node: TrieNode): unknown => {
    if (node.text !== undefined) {
      const translation = resolve(node.text, node.source);
      if (translation === undefined || translation === value) return value;
      replaced++;
      return translation;
    }

    if (Array.isArray(value)) {
      let copy: unknown[] | undefined;
      for (const [segment, child] of node.children) {
        if (typeof segment !== 'number') continue;
        const current = value[segment];
        const next = rebuild(current, child);
        if (next !== current) {
          copy ??= value.slice();
          copy[segment] = next;
        }
      }
      return copy ?? value;
    }

    if (isPlainObject(value)) {
      let copy: Record<string, unknown> | undefined;
      for (const [segment, child] of node.children) {
        if (typeof segment !== 'string') continue;
        const current = value[segment];
        const next = rebuild(current, child);
        if (next !== current) {
          copy ??= { ...value };
          copy[segment] = next;
        }
      }
      return copy ?? value;
    }

    return value;
  };

  return { value: rebuild(root, trie) as T, replaced };
}

export function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Array.isArray(value) || isPlainObject(value);
}

/**
 * Plain objects only. A `Date`, a `Buffer` or anything with a custom `toJSON`
 * does not survive a clone unchanged, so it is left alone.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return typeof (value as { toJSON?: unknown }).toJSON !== 'function';
}

/** `true` for `null`, `undefined`, `{}` and `[]`. */
export function isEmptyPayload(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}
