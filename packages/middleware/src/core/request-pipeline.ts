import { detectLanguage } from './language-detector.js';
import { isContainer, isEmptyPayload } from './json-traverser.js';
import { ResponseTranslator } from './translator.js';
import type { ResolvedTranslatorOptions } from './options.js';
import type {
  FailureMode,
  TranslationMiddlewareOptions,
  TranslationRequest,
  TranslationResult,
} from '../types/index.js';
import { createRouteMatcher, normalizePath } from '../utils/route-matcher.js';

const DEFAULT_BYPASS_HEADER = 'x-no-translation';
const DEFAULT_QUERY_PARAMETER = 'lang';

/** The header HTTP caches must key on once a route is handled. */
export const VARY_HEADER_VALUE = 'Accept-Language';

/** What the pipeline decided about one request, before the body exists. */
export interface TranslationPlan {
  /**
   * The request passed route filtering and the bypass header. `Vary` applies to
   * handled requests only, translated or not.
   */
  readonly handled: boolean;
  /**
   * The request is handled *and* its body may need translating: the target
   * differs from the source language, or texts can be in other languages
   * (`detectSourceLanguage`, `sourceLanguageResolver`).
   */
  readonly translate: boolean;
  /** Always a supported language. */
  readonly targetLanguage: string;
}

const NOT_HANDLED: TranslationPlan = { handled: false, translate: false, targetLanguage: '' };

/**
 * Everything an HTTP adapter needs, with no HTTP in it.
 *
 * Route filtering, the bypass header, language detection and the two response
 * headers are identical whether the framework is Express, Fastify or Nest; only
 * the way a body is intercepted differs. Adapters own that part and delegate
 * the rest here, which is what keeps them honest about behaving the same.
 */
export class TranslationPipeline {
  readonly translator: ResponseTranslator;
  readonly config: ResolvedTranslatorOptions;

  /** Send `Vary: Accept-Language` on handled routes. */
  readonly setVaryHeader: boolean;
  /** Send `Content-Language` on a response that was actually translated. */
  readonly setContentLanguage: boolean;

  /** Language the API produces; a request asking for it is not translated. */
  readonly sourceLanguage: string;
  /** What an engine failure does. Adapters need it to decide whether to rethrow. */
  readonly failureMode: FailureMode;

  private readonly isExcludedRoute: (path: string) => boolean;
  private readonly isIncludedRoute: (path: string) => boolean;
  private readonly hasIncludeRoutes: boolean;
  private readonly bypassHeader: string | undefined;
  private readonly detection: {
    supportedLanguages: string[];
    defaultLanguage: string;
    queryParameter: string | false;
    useAcceptLanguageHeader: boolean;
  };

  constructor(readonly options: Readonly<TranslationMiddlewareOptions>) {
    this.translator = new ResponseTranslator(options);
    this.config = this.translator.resolvedOptions;

    this.isExcludedRoute = createRouteMatcher(options.excludeRoutes ?? []);
    const includeRoutes = options.includeRoutes ?? [];
    this.hasIncludeRoutes = includeRoutes.length > 0;
    this.isIncludedRoute = createRouteMatcher(includeRoutes);

    this.bypassHeader =
      options.bypassHeader === false
        ? undefined
        : (options.bypassHeader ?? DEFAULT_BYPASS_HEADER).toLowerCase();

    this.setVaryHeader = options.setVaryHeader !== false;
    this.setContentLanguage = options.setContentLanguage !== false;
    this.sourceLanguage = this.config.sourceLanguage;
    this.failureMode = this.config.failureMode;

    this.detection = {
      supportedLanguages: this.config.supportedLanguages,
      defaultLanguage: this.config.defaultLanguage,
      queryParameter:
        options.queryParameter === false
          ? (false as const)
          : (options.queryParameter ?? DEFAULT_QUERY_PARAMETER),
      useAcceptLanguageHeader: options.useAcceptLanguageHeader ?? true,
    };
  }

  /** Route filtering, bypass header and target language. No body involved yet. */
  plan(req: TranslationRequest): TranslationPlan {
    const path = normalizePath(req.path ?? req.originalUrl ?? req.url ?? '/');

    if (this.isExcludedRoute(path)) return NOT_HANDLED;
    if (this.hasIncludeRoutes && !this.isIncludedRoute(path)) return NOT_HANDLED;
    if (this.bypassHeader && isTruthyHeader(req.headers?.[this.bypassHeader])) return NOT_HANDLED;

    const detected = detectLanguage(req, this.detection, this.options.languageResolver);

    // 'source' means "serve what the handler produced", whatever language
    // each text is in.
    if (!detected.supported && this.options.unsupportedLanguageStrategy === 'source') {
      this.config.logger.debug(`unsupported ${detected.requested ?? '?'}, served untranslated`);
      return { handled: true, translate: false, targetLanguage: this.config.sourceLanguage };
    }

    const targetLanguage = detected.language;

    // With per-value source languages, an English request can still carry
    // French texts to translate; only a single-language API can stop here.
    if (targetLanguage === this.config.sourceLanguage && !this.config.perValueSourceLanguage) {
      this.config.logger.debug(`target=${targetLanguage} equals sourceLanguage, skipped`);
      return { handled: true, translate: false, targetLanguage };
    }

    return { handled: true, translate: true, targetLanguage };
  }

  /**
   * Whether this particular body is worth the pipeline: it must be a non-empty
   * JSON container, and pass the caller's `shouldTranslate` hook.
   */
  shouldTranslateBody(req: TranslationRequest, body: unknown): boolean {
    if (!isContainer(body) || isEmptyPayload(body)) return false;
    return this.options.shouldTranslate?.(req, body) ?? true;
  }

  /** Runs the translation pipeline over a body already cleared by {@link shouldTranslateBody}. */
  translate<T>(body: T, targetLanguage: string): Promise<TranslationResult<T>> {
    return this.translator.translateResponseWithStats(body, targetLanguage);
  }
}

/** A header counts as set unless it is absent, empty, `false` or `0`. */
export function isTruthyHeader(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized !== '' && normalized !== 'false' && normalized !== '0';
}

/**
 * Adds `value` to an existing `Vary` header without duplicating it.
 * Returns `undefined` when the header already covers the value.
 */
export function mergeVary(
  current: number | string | readonly string[] | undefined | null,
  value: string,
): string | undefined {
  if (current === undefined || current === null) return value;

  const values = Array.isArray(current) ? [...current] : String(current).split(',');
  const normalized = values.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (normalized.some((entry) => entry.toLowerCase() === value.toLowerCase())) return undefined;
  return [...normalized, value].join(', ');
}
