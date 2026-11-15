const PREFIX = '[translation]';
// Built from a string so the source file itself stays free of control characters.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');

/** Flattens control characters so a hostile payload cannot forge log lines. */
export function sanitizeForLog(value: string, maxLength = 120): string {
  const flattened = value.replace(CONTROL_CHARACTERS, ' ');
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}...` : flattened;
}

export interface Logger {
  readonly enabled: boolean;
  debug(message: string): void;
  warn(message: string): void;
}

/** Debug output goes to stderr, so it never pollutes piped stdout. */
export function createLogger(enabled: boolean): Logger {
  return {
    enabled,
    debug(message: string): void {
      if (!enabled) return;
      console.warn(`${PREFIX} ${sanitizeForLog(message, 500)}`);
    },
    warn(message: string): void {
      if (!enabled) return;
      console.warn(`${PREFIX} ${sanitizeForLog(message, 500)}`);
    },
  };
}

export const silentLogger: Logger = {
  enabled: false,
  debug: () => undefined,
  warn: () => undefined,
};
