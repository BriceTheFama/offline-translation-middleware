import type { TranslationRequest } from '@offline-translator/middleware';

/**
 * The subset of a response object the interceptor touches, across both Nest
 * platforms: Express exposes `setHeader`, Fastify's reply exposes `header`.
 */
interface HeaderCapableResponse {
  setHeader?(name: string, value: string): unknown;
  header?(name: string, value: string): unknown;
  getHeader?(name: string): number | string | string[] | undefined;
  headersSent?: boolean;
  sent?: boolean;
}

export function toTranslationRequest(request: unknown): TranslationRequest {
  const source = (request ?? {}) as Record<string, unknown>;
  return {
    headers: (source.headers ?? {}) as Record<string, string | string[] | undefined>,
    query: source.query as Record<string, unknown> | undefined,
    path: typeof source.path === 'string' ? source.path : undefined,
    originalUrl: typeof source.originalUrl === 'string' ? source.originalUrl : undefined,
    url: typeof source.url === 'string' ? source.url : undefined,
    method: typeof source.method === 'string' ? source.method : undefined,
  };
}

export function headersAlreadySent(response: unknown): boolean {
  const target = response as HeaderCapableResponse | null;
  return target?.headersSent === true || target?.sent === true;
}

export function getResponseHeader(
  response: unknown,
  name: string,
): number | string | string[] | undefined {
  const target = response as HeaderCapableResponse | null;
  return typeof target?.getHeader === 'function' ? target.getHeader(name) : undefined;
}

export function setResponseHeader(response: unknown, name: string, value: string): void {
  const target = response as HeaderCapableResponse | null;
  if (typeof target?.setHeader === 'function') target.setHeader(name, value);
  else if (typeof target?.header === 'function') target.header(name, value);
}
