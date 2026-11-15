import { describe, expect, it } from 'vitest';
import { isTranslatableText } from '../src/utils/translatable-value.js';

describe('isTranslatableText', () => {
  it('accepts natural language', () => {
    expect(isTranslatableText('Welcome to our application')).toBe(true);
    expect(isTranslatableText('Bonjour')).toBe(true);
    expect(isTranslatableText('ACTIVE')).toBe(true); // an explicit field wins
  });

  it('rejects strings with nothing to translate', () => {
    expect(isTranslatableText('')).toBe(false);
    expect(isTranslatableText('   ')).toBe(false);
    expect(isTranslatableText('5000')).toBe(false);
    expect(isTranslatableText('+228 90 00 00 00')).toBe(false);
  });

  it('rejects machine-readable values', () => {
    expect(isTranslatableText('https://example.com/a/b')).toBe(false);
    expect(isTranslatableText('john@example.com')).toBe(false);
    expect(isTranslatableText('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(isTranslatableText('2026-01-15T10:30:00Z')).toBe(false);
    expect(isTranslatableText('2026-01-15')).toBe(false);
    expect(isTranslatableText('#ff8800')).toBe(false);
    expect(isTranslatableText('data:image/png;base64,iVBORw0KGgo=')).toBe(false);
  });

  it('rejects credentials that would otherwise leak to the engine', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(isTranslatableText(jwt)).toBe(false);
    expect(isTranslatableText('a'.repeat(48))).toBe(false);
  });
});
