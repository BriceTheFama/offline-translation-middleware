import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from '../src/core/translator.js';
import { FakeTranslationEngine } from '../src/engines/fake-engine.js';
import { TranslationConfigError } from '../src/core/errors.js';
import type { TranslationEngine, TranslatorOptions } from '../src/types/index.js';

function build(overrides: Partial<TranslatorOptions> = {}, engine = new FakeTranslationEngine()) {
  const translator = createTranslator({
    engine,
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr', 'es'],
    fields: ['name', 'title', 'description', 'message', 'label'],
    ...overrides,
  });
  return { translator, engine };
}

describe('createTranslator', () => {
  it('rejects a configuration without an engine', () => {
    expect(() =>
      createTranslator({ defaultLanguage: 'fr', fields: ['name'] } as unknown as TranslatorOptions),
    ).toThrow(TranslationConfigError);
  });

  it('rejects an empty field list', () => {
    expect(() =>
      createTranslator({ engine: new FakeTranslationEngine(), defaultLanguage: 'fr', fields: [] }),
    ).toThrow(TranslationConfigError);
  });
});

describe('ResponseTranslator', () => {
  it('translates the configured fields of a nested payload', async () => {
    const { translator } = build();
    const result = await translator.translateResponse(
      {
        success: true,
        data: [
          {
            id: 1,
            name: 'Hello',
            description: 'Welcome to our application',
            price: 5000,
            status: 'ACTIVE',
          },
        ],
      },
      'fr',
    );

    expect(result).toEqual({
      success: true,
      data: [
        {
          id: 1,
          name: 'Bonjour',
          description: 'Bienvenue dans notre application',
          price: 5000,
          status: 'ACTIVE',
        },
      ],
    });
  });

  it('never calls the engine when source and target match', async () => {
    const { translator, engine } = build();
    const payload = { name: 'Hello' };
    const result = await translator.translateResponseWithStats(payload, 'en');

    expect(engine.callCount).toBe(0);
    expect(result.translated).toBe(false);
    expect(result.value).toBe(payload);
  });

  it('translates a duplicated string only once', async () => {
    const { translator, engine } = build();
    const result = await translator.translateResponseWithStats(
      { title: 'Welcome', message: 'Welcome', label: 'Welcome' },
      'fr',
    );

    expect(engine.callCount).toBe(1);
    expect(result.stats.totalFields).toBe(3);
    expect(result.stats.uniqueTexts).toBe(1);
    expect(result.stats.translatedFields).toBe(3);
    expect(result.value).toEqual({
      title: 'Bienvenue',
      message: 'Bienvenue',
      label: 'Bienvenue',
    });
  });

  it('serves the second response from the cache', async () => {
    const { translator, engine } = build();
    await translator.translateResponse({ name: 'Hello' }, 'fr');
    const second = await translator.translateResponseWithStats({ name: 'Hello' }, 'fr');

    expect(engine.callCount).toBe(1);
    expect(second.stats.cacheHits).toBe(1);
    expect(second.stats.engineCalls).toBe(0);
    expect(second.value).toEqual({ name: 'Bonjour' });
  });

  it('keys the cache by language pair', async () => {
    const { translator, engine } = build();
    await translator.translateResponse({ name: 'Hello' }, 'fr');
    const spanish = await translator.translateResponse({ name: 'Hello' }, 'es');

    expect(spanish).toEqual({ name: 'Hola' });
    expect(engine.callCount).toBe(2);
  });

  it('can run without a cache', async () => {
    const { translator, engine } = build({ cache: false });
    await translator.translateResponse({ name: 'Hello' }, 'fr');
    await translator.translateResponse({ name: 'Hello' }, 'fr');
    expect(engine.callCount).toBe(2);
  });

  it('accepts a custom cache store', async () => {
    const store = new Map<string, string>();
    const { translator } = build({
      cache: { store: { get: (k) => store.get(k), set: (k, v) => void store.set(k, v) } },
    });
    await translator.translateResponse({ name: 'Hello' }, 'fr');
    expect(store.size).toBe(1);
  });

  it('keeps the original text when the engine fails', async () => {
    const onTranslationError = vi.fn();
    const engine = new FakeTranslationEngine({ failOn: (text) => text === 'Hello' });
    const { translator } = build({ onTranslationError }, engine);

    const result = await translator.translateResponseWithStats(
      { name: 'Hello', message: 'Welcome' },
      'fr',
    );

    expect(result.value).toEqual({ name: 'Hello', message: 'Bienvenue' });
    expect(result.stats.errors).toBe(1);
    expect(onTranslationError).toHaveBeenCalledOnce();
    expect(onTranslationError.mock.calls[0]?.[1]).toMatchObject({
      text: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'fr',
    });
  });

  it('propagates the error in strict mode', async () => {
    const engine = new FakeTranslationEngine({ failOn: () => true });
    const { translator } = build({ failureMode: 'throw' }, engine);
    await expect(translator.translateResponse({ name: 'Hello' }, 'fr')).rejects.toThrow();
  });

  it('leaves empty and non-object payloads alone', async () => {
    const { translator, engine } = build();
    expect(await translator.translateResponse(null, 'fr')).toBeNull();
    expect(await translator.translateResponse({}, 'fr')).toEqual({});
    expect(await translator.translateResponse([], 'fr')).toEqual([]);
    expect(await translator.translateResponse('Hello' as unknown, 'fr')).toBe('Hello');
    expect(engine.callCount).toBe(0);
  });

  it('returns the payload untouched above maxResponseSize', async () => {
    const { translator, engine } = build({ maxResponseSize: 100 });
    const payload = { description: 'Welcome to our application'.repeat(20) };
    const result = await translator.translateResponseWithStats(payload, 'fr');

    expect(result.value).toBe(payload);
    expect(result.translated).toBe(false);
    expect(engine.callCount).toBe(0);
  });

  it('reports statistics through onTranslationComplete', async () => {
    const onTranslationComplete = vi.fn();
    const { translator } = build({ onTranslationComplete });
    await translator.translateResponse({ name: 'Hello', message: 'Welcome' }, 'fr');

    expect(onTranslationComplete).toHaveBeenCalledOnce();
    expect(onTranslationComplete.mock.calls[0]?.[0]).toMatchObject({
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      totalFields: 2,
      uniqueTexts: 2,
      translatedFields: 2,
      engineCalls: 2,
    });
  });

  it('uses translateBatch when the engine provides one', async () => {
    const { translator, engine } = build();
    await translator.translateResponse({ name: 'Hello', message: 'Welcome' }, 'fr');

    expect(engine.callCount).toBe(2);
    expect(engine.invocationCount).toBe(1);
  });

  it('splits work into batches of batchSize', async () => {
    const engine = new FakeTranslationEngine({ unknownText: 'mark' });
    const { translator } = build({ batchSize: 2 }, engine);
    await translator.translateResponse(
      { data: [{ name: 'a1' }, { name: 'a2' }, { name: 'a3' }, { name: 'a4' }, { name: 'a5' }] },
      'fr',
    );
    expect(engine.invocationCount).toBe(3);
  });

  it('falls back to single calls when a batch blows up', async () => {
    const engine: TranslationEngine = {
      translate: async (text) => `${text}!`,
      translateBatch: async () => {
        throw new Error('batch is down');
      },
    };
    const { translator } = build({}, engine as FakeTranslationEngine);
    const result = await translator.translateResponse({ name: 'Hello', message: 'Welcome' }, 'fr');
    expect(result).toEqual({ name: 'Hello!', message: 'Welcome!' });
  });

  it('rejects a batch whose length does not match the input', async () => {
    const engine: TranslationEngine = {
      translate: async (text) => `${text}?`,
      translateBatch: async () => ['only one'],
    };
    const { translator } = build({}, engine as FakeTranslationEngine);
    const result = await translator.translateResponse({ name: 'Hello', message: 'Welcome' }, 'fr');
    expect(result).toEqual({ name: 'Hello?', message: 'Welcome?' });
  });

  it('honours the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const engine: TranslationEngine = {
      translate: async (text) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        return `fr:${text}`;
      },
    };
    const { translator } = build({ concurrency: 3 }, engine as FakeTranslationEngine);
    await translator.translateResponse(
      { data: Array.from({ length: 20 }, (_, i) => ({ name: `text ${i}` })) },
      'fr',
    );

    expect(peak).toBeLessThanOrEqual(3);
  });

  it('translates a single string through translateText', async () => {
    const { translator } = build();
    expect(await translator.translateText('Hello', 'fr')).toBe('Bonjour');
    expect(await translator.translateText('Hello', 'en')).toBe('Hello');
  });

  it('defaults the target language to defaultLanguage', async () => {
    const { translator } = build();
    expect(await translator.translateResponse({ name: 'Hello' })).toEqual({ name: 'Bonjour' });
  });
});

describe('ResponseTranslator, English and French in the same payload', () => {
  const MIXED = {
    data: [
      { id: 1, name: 'Hello', description: 'Welcome to our application' },
      { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
    ],
  };

  function bilingual(overrides: Partial<TranslatorOptions> = {}, engine?: TranslationEngine) {
    return build(
      { supportedLanguages: ['en', 'fr'], ...overrides },
      engine as FakeTranslationEngine | undefined,
    );
  }

  it('translates the English texts into French and leaves the French ones alone', async () => {
    const { translator, engine } = bilingual();
    const result = await translator.translateResponseWithStats(MIXED, 'fr');

    expect(result.value).toEqual({
      data: [
        { id: 1, name: 'Bonjour', description: 'Bienvenue dans notre application' },
        { id: 2, name: 'Ordinateur portable', description: 'Livré avec son chargeur' },
      ],
    });
    expect(engine.callCount).toBe(2);
    expect(result.stats).toMatchObject({ totalFields: 4, alreadyInTargetLanguage: 2 });
  });

  it('translates the French texts into English for an English request', async () => {
    const { translator, engine } = bilingual();
    const result = await translator.translateResponseWithStats(MIXED, 'en');

    expect(result.value).toEqual({
      data: [
        { id: 1, name: 'Hello', description: 'Welcome to our application' },
        { id: 2, name: 'Laptop', description: 'Comes with its charger' },
      ],
    });
    expect(result.translated).toBe(true);
    expect(engine.callCount).toBe(2);
    expect(result.stats.alreadyInTargetLanguage).toBe(2);
  });

  it('calls the engine with each text’s own language pair', async () => {
    const calls: string[] = [];
    const engine: TranslationEngine = {
      translateBatch: async (texts, source, target) => {
        calls.push(`${source}>${target}:${texts.join('|')}`);
        return texts;
      },
      translate: async (text) => text,
    };
    const { translator } = bilingual({}, engine);
    await translator.translateResponse(MIXED, 'en');

    expect(calls).toEqual(['fr>en:Ordinateur portable|Livré avec son chargeur']);
  });

  it('keys the cache by the detected language', async () => {
    const { translator, engine } = bilingual();
    await translator.translateResponse(MIXED, 'en');
    const second = await translator.translateResponseWithStats(MIXED, 'en');

    expect(engine.callCount).toBe(2);
    expect(second.stats.cacheHits).toBe(2);
  });

  it('falls back to sourceLanguage when a text gives no clear signal', async () => {
    const { translator } = bilingual();
    // "Phone" could be either; sourceLanguage says English.
    expect(await translator.translateResponse({ name: 'Phone' }, 'fr')).toEqual({
      name: 'Téléphone',
    });
    expect(await translator.translateResponse({ name: 'Phone' }, 'en')).toEqual({
      name: 'Phone',
    });
  });

  it('works the other way round, for an API written in French', async () => {
    const { translator } = bilingual({ sourceLanguage: 'fr', defaultLanguage: 'en' });
    const result = await translator.translateResponse(
      { title: 'Ordinateur', message: 'Your order has been shipped' },
      'en',
    );
    expect(result).toEqual({ title: 'Computer', message: 'Your order has been shipped' });
  });

  it('lets a resolver declare the language, ahead of detection', async () => {
    const { translator } = bilingual(
      {
        sourceLanguageResolver: (_text, { parent }) =>
          !Array.isArray(parent) && typeof parent.lang === 'string' ? parent.lang : undefined,
      },
      new FakeTranslationEngine({ unknownText: 'mark' }),
    );
    const result = await translator.translateResponse(
      {
        // "Hello" would be detected as English; the first record says otherwise.
        data: [{ lang: 'fr', name: 'Hello' }, { lang: 'en', name: 'Hello' }, { name: 'Bonjour' }],
      },
      'en',
    );
    expect(result).toEqual({
      data: [{ lang: 'fr', name: '[en] Hello' }, { lang: 'en', name: 'Hello' }, { name: 'Hello' }],
    });
  });

  it('accepts a custom detector', async () => {
    const { translator } = bilingual({ detectSourceLanguage: () => 'fr' });
    expect(await translator.translateResponse({ name: 'Bonjour' }, 'en')).toEqual({
      name: 'Hello',
    });
  });

  it('ignores a detected language that is not supported', async () => {
    const { translator, engine } = bilingual({ detectSourceLanguage: () => 'de' });
    expect(await translator.translateResponse({ name: 'Hello' }, 'fr')).toEqual({
      name: 'Bonjour',
    });
    expect(engine.callCount).toBe(1);
  });

  it('treats every text as sourceLanguage with detection off', async () => {
    const { translator, engine } = bilingual({ detectSourceLanguage: false });
    const result = await translator.translateResponseWithStats(MIXED, 'en');

    expect(result.value).toBe(MIXED);
    expect(engine.callCount).toBe(0);
  });

  it('can leave a text of unknown language untranslated', async () => {
    const { translator, engine } = bilingual({ undetectedLanguage: 'skip' });
    const result = await translator.translateResponseWithStats(
      { name: 'Phone', title: 'Hello', description: 'Rupture de stock' },
      'en',
    );

    expect(result.value).toEqual({ name: 'Phone', title: 'Hello', description: 'Out of stock' });
    expect(result.stats).toMatchObject({ unknownLanguage: 1, alreadyInTargetLanguage: 1 });
    expect(engine.callCount).toBe(1);
    expect(await translator.translateText('Phone', 'fr')).toBe('Phone');
  });

  it('still lets a resolver place a text the detector cannot', async () => {
    const { translator } = bilingual({
      undetectedLanguage: 'skip',
      sourceLanguageResolver: (_text, { parent }) =>
        Array.isArray(parent) ? undefined : (parent.lang as string | undefined),
    });
    expect(await translator.translateResponse({ lang: 'en', name: 'Phone' }, 'fr')).toEqual({
      lang: 'en',
      name: 'Téléphone',
    });
  });

  it('applies detection to translateText too', async () => {
    const { translator } = bilingual();
    expect(await translator.translateText('Bonjour', 'en')).toBe('Hello');
    expect(await translator.translateText('Bonjour', 'fr')).toBe('Bonjour');
    expect(await translator.translateText('Hello', 'fr')).toBe('Bonjour');
  });
});
