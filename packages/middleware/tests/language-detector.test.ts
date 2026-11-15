import { describe, expect, it } from 'vitest';
import {
  detectLanguage,
  matchSupportedLanguage,
  parseAcceptLanguage,
} from '../src/core/language-detector.js';
import type { TranslationRequest } from '../src/types/index.js';

const options = {
  supportedLanguages: ['en', 'fr', 'es'],
  defaultLanguage: 'fr',
  queryParameter: 'lang' as const,
  useAcceptLanguageHeader: true,
};

function request(partial: Partial<TranslationRequest>): TranslationRequest {
  return { headers: {}, ...partial };
}

describe('parseAcceptLanguage', () => {
  it('sorts by quality', () => {
    expect(parseAcceptLanguage('de;q=0.4, fr;q=0.9, en;q=0.8')).toEqual(['fr', 'en', 'de']);
  });

  it('defaults missing quality to 1 and drops q=0', () => {
    expect(parseAcceptLanguage('fr, en;q=0')).toEqual(['fr']);
  });
});

describe('matchSupportedLanguage', () => {
  it('falls back to the base subtag', () => {
    expect(matchSupportedLanguage('fr-CA', ['en', 'fr'])).toBe('fr');
    expect(matchSupportedLanguage('FR', ['en', 'fr'])).toBe('fr');
    expect(matchSupportedLanguage('pt', ['en', 'fr'])).toBeUndefined();
  });
});

describe('detectLanguage', () => {
  it('prefers the query parameter over the header', () => {
    const detection = detectLanguage(
      request({ query: { lang: 'es' }, headers: { 'accept-language': 'fr' } }),
      options,
    );
    expect(detection).toMatchObject({ language: 'es', source: 'query', supported: true });
  });

  it('parses the query parameter out of the url when the framework did not', () => {
    const detection = detectLanguage(request({ url: '/products?lang=es' }), options);
    expect(detection.language).toBe('es');
  });

  it('uses Accept-Language when there is no query parameter', () => {
    const detection = detectLanguage(
      request({ headers: { 'accept-language': 'fr-CA,fr;q=0.9' } }),
      options,
    );
    expect(detection).toMatchObject({ language: 'fr', source: 'header', supported: true });
  });

  it('skips unsupported languages in the header and takes the next best one', () => {
    const detection = detectLanguage(
      request({ headers: { 'accept-language': 'pt;q=1.0, es;q=0.8' } }),
      options,
    );
    expect(detection.language).toBe('es');
  });

  it('falls back to the default language when nothing is supported', () => {
    const detection = detectLanguage(request({ headers: { 'accept-language': 'pt' } }), options);
    expect(detection).toMatchObject({
      language: 'fr',
      requested: 'pt',
      source: 'header',
      supported: false,
    });
  });

  it('falls back to the default language when nothing is asked for', () => {
    const detection = detectLanguage(request({}), options);
    expect(detection).toMatchObject({ language: 'fr', source: 'default' });
  });

  it('gives the custom resolver the last word', () => {
    const detection = detectLanguage(
      request({ headers: { 'x-language': 'es', 'accept-language': 'fr' } }),
      options,
      (req) => req.headers['x-language'] as string,
    );
    expect(detection).toMatchObject({ language: 'es', source: 'resolver' });
  });

  it('falls through when the resolver returns nothing', () => {
    const detection = detectLanguage(
      request({ headers: { 'accept-language': 'es' } }),
      options,
      () => undefined,
    );
    expect(detection).toMatchObject({ language: 'es', source: 'header' });
  });

  it('ignores the query parameter when it is disabled', () => {
    const detection = detectLanguage(request({ query: { lang: 'es' } }), {
      ...options,
      queryParameter: false,
    });
    expect(detection.language).toBe('fr');
  });
});
