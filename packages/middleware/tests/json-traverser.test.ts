import { describe, expect, it } from 'vitest';
import { createFieldMatcher } from '../src/core/field-matcher.js';
import {
  applyTranslations,
  collectTranslatableSlots,
  isEmptyPayload,
  isPlainObject,
} from '../src/core/json-traverser.js';
import { isTranslatableText } from '../src/utils/translatable-value.js';

function collect(root: unknown, fields: string[], excludeFields: string[] = []) {
  return collectTranslatableSlots(root, {
    include: createFieldMatcher(fields),
    exclude: createFieldMatcher(excludeFields),
    maxTextLength: 5000,
    maxDepth: 100,
    maxResponseSize: 2 * 1024 * 1024,
    isTranslatableText,
  });
}

describe('collectTranslatableSlots', () => {
  it('tags each slot with the language resolveSource gives it', () => {
    const parents: unknown[] = [];
    const root = { data: [{ lang: 'fr', name: 'Bonjour' }], title: 'Hello' };
    const result = collectTranslatableSlots(root, {
      include: createFieldMatcher(['name', 'title']),
      exclude: createFieldMatcher([]),
      maxTextLength: 5000,
      maxDepth: 100,
      maxResponseSize: 2 * 1024 * 1024,
      isTranslatableText,
      resolveSource: (_text, _path, parent) => {
        parents.push(parent);
        return !Array.isArray(parent) && parent.lang === 'fr' ? 'fr' : 'en';
      },
    });

    expect(result.slots).toEqual([
      { path: ['data', 0, 'name'], text: 'Bonjour', source: 'fr' },
      { path: ['title'], text: 'Hello', source: 'en' },
    ]);
    expect(parents).toEqual([root.data[0], root]);
  });

  it('finds configured fields in nested objects', () => {
    const result = collect({ data: { product: { name: 'Phone', price: 1000 } } }, ['name']);
    expect(result.slots).toEqual([{ path: ['data', 'product', 'name'], text: 'Phone' }]);
  });

  it('walks arrays and keeps indices in the path', () => {
    const result = collect({ data: [{ name: 'Phone' }, { name: 'Computer' }] }, ['name']);
    expect(result.slots.map((slot) => slot.path)).toEqual([
      ['data', 0, 'name'],
      ['data', 1, 'name'],
    ]);
  });

  it('matches dotted paths through arrays', () => {
    const result = collect({ data: [{ name: 'Phone' }], other: { name: 'Skip' } }, ['data.name']);
    expect(result.texts).toEqual(['Phone']);
  });

  it('deduplicates texts while keeping every slot', () => {
    const result = collect({ title: 'Welcome', subtitle: 'Welcome', message: 'Welcome' }, [
      'title',
      'subtitle',
      'message',
    ]);
    expect(result.slots).toHaveLength(3);
    expect(result.texts).toEqual(['Welcome']);
  });

  it('ignores non-string values and unconfigured fields', () => {
    const result = collect(
      {
        id: '123',
        name: 'Hello',
        email: 'john@example.com',
        status: 'ACTIVE',
        description: 'Welcome',
        url: 'https://example.com',
        currency: 'XOF',
        price: 5000,
        active: true,
        deletedAt: null,
      },
      ['name', 'description'],
    );
    expect(result.texts).toEqual(['Hello', 'Welcome']);
  });

  it('lets excludeFields win over fields', () => {
    const result = collect(
      { name: 'Hello', description: 'Welcome' },
      ['name', 'description'],
      ['name'],
    );
    expect(result.texts).toEqual(['Welcome']);
  });

  it('skips strings longer than maxTextLength', () => {
    const long = 'word '.repeat(100);
    const result = collectTranslatableSlots(
      { description: long },
      {
        include: createFieldMatcher(['description']),
        exclude: createFieldMatcher([]),
        maxTextLength: 10,
        maxDepth: 100,
        maxResponseSize: 1_000_000,
        isTranslatableText,
      },
    );
    expect(result.slots).toHaveLength(0);
  });

  it('stops when the payload blows the size budget', () => {
    const result = collectTranslatableSlots(
      { description: 'x'.repeat(5000) },
      {
        include: createFieldMatcher(['description']),
        exclude: createFieldMatcher([]),
        maxTextLength: 100_000,
        maxDepth: 100,
        maxResponseSize: 1000,
        isTranslatableText,
      },
    );
    expect(result.exceededSize).toBe(true);
    expect(result.slots).toHaveLength(0);
  });

  it('respects maxDepth', () => {
    const result = collectTranslatableSlots(
      { a: { b: { c: { name: 'Hello' } } } },
      {
        include: createFieldMatcher(['name']),
        exclude: createFieldMatcher([]),
        maxTextLength: 5000,
        maxDepth: 2,
        maxResponseSize: 1_000_000,
        isTranslatableText,
      },
    );
    expect(result.slots).toHaveLength(0);
  });

  it('does not descend into class instances or dates', () => {
    class Model {
      name = 'Hello';
    }
    const result = collect({ model: new Model(), date: new Date(0) }, ['name']);
    expect(result.slots).toHaveLength(0);
  });

  it('honours a custom shouldTranslateValue', () => {
    const result = collectTranslatableSlots(
      { name: 'Hello', description: 'Welcome' },
      {
        include: createFieldMatcher(['name', 'description']),
        exclude: createFieldMatcher([]),
        maxTextLength: 5000,
        maxDepth: 100,
        maxResponseSize: 1_000_000,
        isTranslatableText,
        shouldTranslateValue: (text) => text !== 'Hello',
      },
    );
    expect(result.texts).toEqual(['Welcome']);
  });
});

describe('applyTranslations', () => {
  it('returns a new object and leaves the original untouched', () => {
    const original = { data: { name: 'Hello', price: 5000 } };
    const { slots } = collect(original, ['name']);
    const { value, replaced } = applyTranslations(original, slots, () => 'Bonjour');

    expect(replaced).toBe(1);
    expect(value).toEqual({ data: { name: 'Bonjour', price: 5000 } });
    expect(original.data.name).toBe('Hello');
    expect(value).not.toBe(original);
  });

  it('shares the subtrees that did not change', () => {
    const untouched = { deep: { value: 1 } };
    const original = { untouched, translated: { name: 'Hello' } };
    const { slots } = collect(original, ['name']);
    const { value } = applyTranslations(original, slots, () => 'Bonjour');

    expect((value as typeof original).untouched).toBe(untouched);
  });

  it('keeps the original text when the resolver has no translation', () => {
    const original = { name: 'Hello' };
    const { slots } = collect(original, ['name']);
    const { value, replaced } = applyTranslations(original, slots, () => undefined);

    expect(replaced).toBe(0);
    expect(value).toBe(original);
  });

  it('replaces values inside arrays', () => {
    const original = { data: [{ name: 'Phone' }, { name: 'Computer' }] };
    const { slots } = collect(original, ['name']);
    const { value } = applyTranslations(original, slots, (text) =>
      text === 'Phone' ? 'Téléphone' : 'Ordinateur',
    );

    expect(value).toEqual({ data: [{ name: 'Téléphone' }, { name: 'Ordinateur' }] });
  });
});

describe('payload helpers', () => {
  it('detects empty payloads', () => {
    expect(isEmptyPayload(null)).toBe(true);
    expect(isEmptyPayload(undefined)).toBe(true);
    expect(isEmptyPayload({})).toBe(true);
    expect(isEmptyPayload([])).toBe(true);
    expect(isEmptyPayload({ a: 1 })).toBe(false);
  });

  it('recognises plain objects only', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(new Date())).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
  });
});
