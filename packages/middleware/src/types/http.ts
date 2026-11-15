/**
 * Minimal structural shapes of the HTTP objects the middleware touches.
 *
 * They are deliberately looser than Express's own `Request`/`Response` so that
 * an Express handler stays assignable to them — which is what lets this package
 * work with Express without depending on it.
 */

export interface TranslationRequest {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, unknown>;
  path?: string;
  originalUrl?: string;
  url?: string;
  method?: string;
}

export interface TranslationResponse {
  json(body?: unknown): unknown;
  setHeader(name: string, value: number | string | ReadonlyArray<string>): unknown;
  getHeader?(name: string): number | string | string[] | undefined;
  headersSent?: boolean;
  statusCode?: number;
}

export type NextFunction = (error?: unknown) => void;

export type RequestHandler = (
  req: TranslationRequest,
  res: TranslationResponse,
  next: NextFunction,
) => void;
