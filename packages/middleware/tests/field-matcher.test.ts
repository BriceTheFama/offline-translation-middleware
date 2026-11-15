import { describe, expect, it } from 'vitest';
import { createFieldMatcher } from '../src/core/field-matcher.js';

describe('createFieldMatcher', () => {
  it('matches a bare field name at any depth', () => {
    const matcher = createFieldMatcher(['name']);
    expect(matcher.matches(['name'])).toBe(true);
    expect(matcher.matches(['data', 'name'])).toBe(true);
    expect(matcher.matches(['a', 'b', 'c', 'name'])).toBe(true);
    expect(matcher.matches(['name', 'other'])).toBe(false);
    expect(matcher.matches(['nickname'])).toBe(false);
  });

  it('anchors dotted paths at the root', () => {
    const matcher = createFieldMatcher(['data.name']);
    expect(matcher.matches(['data', 'name'])).toBe(true);
    expect(matcher.matches(['name'])).toBe(false);
    expect(matcher.matches(['payload', 'data', 'name'])).toBe(false);
  });

  it('accepts array notation as a synonym of the plain path', () => {
    const matcher = createFieldMatcher(['data[].name']);
    expect(matcher.matches(['data', 'name'])).toBe(true);
  });

  it('supports a single-segment wildcard', () => {
    const matcher = createFieldMatcher(['data.*.name']);
    expect(matcher.matches(['data', 'product', 'name'])).toBe(true);
    expect(matcher.matches(['data', 'name'])).toBe(false);
    expect(matcher.matches(['data', 'a', 'b', 'name'])).toBe(false);
  });

  it('supports a deep wildcard', () => {
    const matcher = createFieldMatcher(['data.**.name']);
    expect(matcher.matches(['data', 'name'])).toBe(true);
    expect(matcher.matches(['data', 'a', 'b', 'name'])).toBe(true);
    expect(matcher.matches(['other', 'name'])).toBe(false);
  });

  it('treats "**.name" like the bare name', () => {
    const matcher = createFieldMatcher(['**.name']);
    expect(matcher.matches(['name'])).toBe(true);
    expect(matcher.matches(['a', 'name'])).toBe(true);
  });

  it('never matches when no pattern is configured', () => {
    const matcher = createFieldMatcher([]);
    expect(matcher.isEmpty).toBe(true);
    expect(matcher.matches(['name'])).toBe(false);
  });

  it('is case sensitive', () => {
    const matcher = createFieldMatcher(['name']);
    expect(matcher.matches(['Name'])).toBe(false);
  });
});
