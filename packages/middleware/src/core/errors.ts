/** Thrown at construction time when the configuration cannot work. */
export class TranslationConfigError extends Error {
  override readonly name = 'TranslationConfigError';
}

/** Wraps an engine failure with the context that produced it. */
export class TranslationEngineError extends Error {
  override readonly name = 'TranslationEngineError';

  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}
