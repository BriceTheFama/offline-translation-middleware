import type { TranslationEngine } from '../types/index.js';

export interface FakeTranslationEngineOptions {
  /** `{ 'en>fr': { Hello: 'Bonjour' } }`, or a flat dictionary for a single pair. */
  dictionary?: Record<string, Record<string, string>>;
  /** What to do with a text the dictionary does not know. Default: `'echo'`. */
  unknownText?: 'echo' | 'mark';
  /** Artificial latency in milliseconds, useful for benchmarks. Default: `0`. */
  latencyMs?: number;
  /** Throw for texts matching this predicate, to exercise error handling. */
  failOn?: (text: string) => boolean;
}

const DEFAULT_DICTIONARY: Record<string, Record<string, string>> = {
  'en>fr': {
    Hello: 'Bonjour',
    Welcome: 'Bienvenue',
    'Good morning': 'Bonjour',
    Goodbye: 'Au revoir',
    'Welcome to our application': 'Bienvenue dans notre application',
    Phone: 'Téléphone',
    Computer: 'Ordinateur',
    'A smartphone': 'Un smartphone',
    'Thank you': 'Merci',
    Products: 'Produits',
    'Out of stock': 'Rupture de stock',
  },
  'fr>en': {
    Bonjour: 'Hello',
    Bienvenue: 'Welcome',
    'Au revoir': 'Goodbye',
    'Bienvenue dans notre application': 'Welcome to our application',
    Téléphone: 'Phone',
    Ordinateur: 'Computer',
    'Un smartphone': 'A smartphone',
    Merci: 'Thank you',
    Produits: 'Products',
    'Rupture de stock': 'Out of stock',
    'Ordinateur portable': 'Laptop',
    'Livré avec son chargeur': 'Comes with its charger',
    'Votre commande a été expédiée': 'Your order has been shipped',
  },
  'en>es': {
    Hello: 'Hola',
    Welcome: 'Bienvenido',
    Goodbye: 'Adiós',
    'Welcome to our application': 'Bienvenido a nuestra aplicación',
  },
};

/**
 * Deterministic dictionary engine.
 *
 * It exists so the middleware, the cache and the traversal can be tested — and
 * demoed — without downloading a model. Do not ship it to production.
 */
export class FakeTranslationEngine implements TranslationEngine {
  readonly name = 'fake';

  /** Number of texts handed to the engine, batches included. */
  callCount = 0;
  /** Number of `translate` / `translateBatch` invocations. */
  invocationCount = 0;

  private readonly dictionary: Record<string, Record<string, string>>;
  private readonly options: FakeTranslationEngineOptions;

  constructor(options: FakeTranslationEngineOptions = {}) {
    this.options = options;
    this.dictionary = options.dictionary ?? DEFAULT_DICTIONARY;
  }

  async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
    this.invocationCount++;
    return this.translateOne(text, sourceLanguage, targetLanguage);
  }

  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string[]> {
    this.invocationCount++;
    const results: string[] = [];
    for (const text of texts) {
      results.push(await this.translateOne(text, sourceLanguage, targetLanguage));
    }
    return results;
  }

  reset(): void {
    this.callCount = 0;
    this.invocationCount = 0;
  }

  private async translateOne(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
  ): Promise<string> {
    this.callCount++;

    if (this.options.failOn?.(text)) {
      throw new Error(`FakeTranslationEngine: refusing to translate "${text}"`);
    }

    if (this.options.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }

    const pair = this.dictionary[`${sourceLanguage}>${targetLanguage}`];
    const known = pair?.[text];
    if (known !== undefined) return known;

    if (this.options.unknownText === 'mark') return `[${targetLanguage}] ${text}`;
    return text;
  }
}
