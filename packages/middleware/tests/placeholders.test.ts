import { describe, expect, it } from 'vitest';
import { maskPlaceholders, unmaskPlaceholders } from '../src/utils/placeholders.js';

describe('maskPlaceholders', () => {
  it.each([
    ['You have {count} new messages', 'You have {0} new messages', ['{count}']],
    ['Hello {{name}}!', 'Hello {0}!', ['{{name}}']],
    ['Hello ${user.name}', 'Hello {0}', ['${user.name}']],
    ['Page {0} of {1}', 'Page {0} of {1}', ['{0}', '{1}']],
    ['Sent by %s on %2$s', 'Sent by {0} on {1}', ['%s', '%2$s']],
    ['Total: %(amount).2f', 'Total: {0}', ['%(amount).2f']],
    [
      'You have {count, plural, one {# item} other {# items}} in your cart',
      'You have {0} in your cart',
      ['{count, plural, one {# item} other {# items}}'],
    ],
  ])('masks %j', (text, masked, placeholders) => {
    expect(maskPlaceholders(text)).toEqual({ text: masked, placeholders });
  });

  it('leaves prose alone', () => {
    for (const text of ['50% off everything', 'Use the { key', 'Price: 100%', 'Hello']) {
      expect(maskPlaceholders(text)).toEqual({ text, placeholders: [] });
    }
  });
});

describe('unmaskPlaceholders', () => {
  it('restores placeholders, in whatever order the engine put them', () => {
    expect(unmaskPlaceholders('{1} : page {0}', ['{page}', '{book}'])).toBe('{book} : page {page}');
  });

  it('tolerates spaces the engine added inside a marker', () => {
    expect(unmaskPlaceholders('Vous avez { 0 } messages', ['{count}'])).toBe(
      'Vous avez {count} messages',
    );
  });

  it.each([
    ['lost', 'Vous avez nouveaux messages'],
    ['duplicated', 'Vous avez {0} {0} messages'],
    ['invented', 'Vous avez {0} messages {1}'],
  ])('refuses a translation that %s a marker', (_case, translated) => {
    expect(unmaskPlaceholders(translated, ['{count}'])).toBeUndefined();
  });

  it('passes a text without placeholders through', () => {
    expect(unmaskPlaceholders('Bonjour', [])).toBe('Bonjour');
  });
});
