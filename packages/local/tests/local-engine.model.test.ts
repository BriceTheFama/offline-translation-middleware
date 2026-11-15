/**
 * Real model tests. Download Xenova/opus-mt-en-fr and Xenova/opus-mt-fr-en on
 * the first run (~40 MB each), so they are opt-in:
 * `RUN_MODEL_TESTS=1 npx vitest run`.
 */
import { describe, expect, it } from 'vitest';
import { LocalTranslationEngine } from '../src/local-engine.js';

const enabled = process.env.RUN_MODEL_TESTS === '1';

describe.skipIf(!enabled)('LocalTranslationEngine (real model)', () => {
  it('translates English to French offline', { timeout: 300_000 }, async () => {
    const engine = new LocalTranslationEngine();
    await engine.warmup('en', 'fr');

    const [greeting, sentence] = await engine.translateBatch(
      ['Hello', 'Your order has been shipped'],
      'en',
      'fr',
    );

    expect(greeting?.toLowerCase()).toContain('bonjour');
    expect(sentence?.toLowerCase()).toContain('commande');
  });

  it('translates French to English offline', { timeout: 300_000 }, async () => {
    const engine = new LocalTranslationEngine();
    await engine.warmup('fr', 'en');

    const [greeting, sentence] = await engine.translateBatch(
      ['Bonjour', 'Votre commande a été expédiée'],
      'fr',
      'en',
    );

    // No added period on a label that had none.
    expect(greeting).toBe('Hello');
    expect(sentence?.toLowerCase()).toContain('order');
  });
});
