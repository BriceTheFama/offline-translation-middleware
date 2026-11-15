import type { TranslationRequest } from '../types/index.js';

export interface LanguageDetectionOptions {
  readonly supportedLanguages: readonly string[];
  readonly defaultLanguage: string;
  readonly queryParameter: string | false;
  readonly useAcceptLanguageHeader: boolean;
}

export type LanguageSource = 'resolver' | 'query' | 'header' | 'default';

export interface LanguageDetection {
  /** Always a supported language. */
  readonly language: string;
  /** What the client actually asked for, before the fallback kicked in. */
  readonly requested?: string;
  readonly source: LanguageSource;
  readonly supported: boolean;
}

export function normalizeLanguage(value: string): string {
  return value.trim().toLowerCase().replace('_', '-');
}

/**
 * Resolves `fr-CA` against `['fr', 'en']` by falling back to the base subtag.
 * Returns `undefined` when nothing matches.
 */
export function matchSupportedLanguage(
  candidate: string,
  supportedLanguages: readonly string[],
): string | undefined {
  const normalized = normalizeLanguage(candidate);
  if (normalized.length === 0) return undefined;

  for (const supported of supportedLanguages) {
    if (normalizeLanguage(supported) === normalized) return supported;
  }

  const base = normalized.split('-')[0] as string;
  for (const supported of supportedLanguages) {
    if (normalizeLanguage(supported).split('-')[0] === base) return supported;
  }

  return undefined;
}

/** Parses `Accept-Language`, best quality first. */
export function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [tag = '', ...parameters] = part.trim().split(';');
      const quality = parameters
        .map((parameter) => parameter.trim())
        .filter((parameter) => parameter.startsWith('q='))
        .map((parameter) => Number.parseFloat(parameter.slice(2)))
        .find((value) => !Number.isNaN(value));
      return { tag: tag.trim(), quality: quality ?? 1 };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality)
    .map((entry) => entry.tag);
}

function readHeader(req: TranslationRequest, name: string): string | undefined {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function readQueryLanguage(req: TranslationRequest, parameter: string): string | undefined {
  const raw = req.query?.[parameter];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];

  // Frameworks that do not pre-parse the query string still expose the URL.
  const url = req.originalUrl ?? req.url;
  if (typeof url !== 'string') return undefined;
  const questionMark = url.indexOf('?');
  if (questionMark < 0) return undefined;
  const value = new URLSearchParams(url.slice(questionMark + 1)).get(parameter);
  return value ?? undefined;
}

/**
 * Target language, in order of precedence: custom resolver, query parameter,
 * `Accept-Language`, then the configured default.
 */
export function detectLanguage(
  req: TranslationRequest,
  options: LanguageDetectionOptions,
  resolver?: (req: TranslationRequest) => string | undefined | null,
): LanguageDetection {
  const { supportedLanguages, defaultLanguage } = options;

  const fromResolver = resolver?.(req);
  if (fromResolver) return finalize(fromResolver, 'resolver', supportedLanguages, defaultLanguage);

  if (options.queryParameter !== false) {
    const fromQuery = readQueryLanguage(req, options.queryParameter);
    if (fromQuery) return finalize(fromQuery, 'query', supportedLanguages, defaultLanguage);
  }

  if (options.useAcceptLanguageHeader) {
    const header = readHeader(req, 'accept-language');
    if (header) {
      const candidates = parseAcceptLanguage(header);
      for (const candidate of candidates) {
        if (candidate === '*') break;
        const matched = matchSupportedLanguage(candidate, supportedLanguages);
        if (matched) {
          return { language: matched, requested: candidate, source: 'header', supported: true };
        }
      }
      const first = candidates[0];
      if (first && first !== '*') {
        return {
          language: defaultLanguage,
          requested: first,
          source: 'header',
          supported: false,
        };
      }
    }
  }

  return { language: defaultLanguage, source: 'default', supported: true };
}

function finalize(
  requested: string,
  source: LanguageSource,
  supportedLanguages: readonly string[],
  defaultLanguage: string,
): LanguageDetection {
  const matched = matchSupportedLanguage(requested, supportedLanguages);
  if (matched) return { language: matched, requested, source, supported: true };
  return { language: defaultLanguage, requested, source, supported: false };
}
