import { describe, expect, it, vi } from 'vitest';
import { LocalTranslationEngine } from '../src/local-engine.js';
import type { TransformersModule } from '../src/types.js';

function fakeTransformers(overrides: Partial<TransformersModule> = {}): {
  module: TransformersModule;
  pipelineFactory: ReturnType<typeof vi.fn>;
  calls: Array<string | string[]>;
} {
  const calls: Array<string | string[]> = [];

  const pipelineFactory = vi.fn(async () => async (input: string | string[]) => {
    calls.push(input);
    const texts = Array.isArray(input) ? input : [input];
    const output = texts.map((text) => ({ translation_text: `fr:${text}` }));
    return Array.isArray(input) ? output : (output[0] as { translation_text: string });
  });

  const module = {
    pipeline: pipelineFactory,
    env: {},
    ...overrides,
  } as unknown as TransformersModule;

  return { module, pipelineFactory, calls };
}

describe('LocalTranslationEngine', () => {
  it('resolves the OPUS-MT model id from the language pair', () => {
    const engine = new LocalTranslationEngine();
    expect(engine.resolveModelId('en', 'fr')).toBe('Xenova/opus-mt-en-fr');
    expect(engine.resolveModelId('en', 'es')).toBe('Xenova/opus-mt-en-es');
  });

  it('resolves French to English the same way', () => {
    expect(new LocalTranslationEngine().resolveModelId('fr', 'en')).toBe('Xenova/opus-mt-fr-en');
  });

  it('falls back to the base language for regional tags', () => {
    const engine = new LocalTranslationEngine();
    expect(engine.resolveModelId('en', 'fr-CA')).toBe('Xenova/opus-mt-en-fr');
    expect(engine.resolveModelId('fr_FR', 'en-GB')).toBe('Xenova/opus-mt-fr-en');
  });

  it('lets an exact regional mapping win over the base one', () => {
    const engine = new LocalTranslationEngine({
      models: { 'en>fr': 'my-org/en-fr', 'en>fr-CA': 'my-org/en-fr-ca' },
    });
    expect(engine.resolveModelId('en', 'fr-CA')).toBe('my-org/en-fr-ca');
    expect(engine.resolveModelId('en', 'fr-BE')).toBe('my-org/en-fr');
  });

  it('loads a single model for fr and fr-CA', async () => {
    const { module, pipelineFactory } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });
    await engine.translate('Hello', 'en', 'fr');
    await engine.translate('Hello', 'en', 'fr-CA');
    expect(pipelineFactory).toHaveBeenCalledOnce();
  });

  it('does not translate between two variants of one language', async () => {
    const { module, calls } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });
    expect(await engine.translate('Bonjour', 'fr-CA', 'fr')).toBe('Bonjour');
    expect(calls).toHaveLength(0);
  });

  it('drops the final period the model adds to a label', async () => {
    const module = {
      pipeline: async () => async (input: string | string[]) =>
        (Array.isArray(input) ? input : [input]).map(() => ({ translation_text: 'Hello.' })),
      env: {},
    } as unknown as TransformersModule;

    const engine = new LocalTranslationEngine({ transformers: module });
    expect(await engine.translateBatch(['Bonjour', 'Bonjour.', 'Bonjour !'], 'fr', 'en')).toEqual([
      'Hello',
      'Hello.',
      'Hello.',
    ]);

    const keeping = new LocalTranslationEngine({ transformers: module, keepAddedPeriod: true });
    expect(await keeping.translate('Bonjour', 'fr', 'en')).toBe('Hello.');
  });

  it('prefers an explicit model mapping', () => {
    const engine = new LocalTranslationEngine({ models: { 'en>fr': 'my-org/my-model' } });
    expect(engine.resolveModelId('en', 'fr')).toBe('my-org/my-model');
  });

  it('accepts a custom resolver', () => {
    const engine = new LocalTranslationEngine({
      modelResolver: (source, target) => `custom/${source}-${target}`,
    });
    expect(engine.resolveModelId('en', 'de')).toBe('custom/en-de');
  });

  it('translates a single text', async () => {
    const { module } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });
    expect(await engine.translate('Hello', 'en', 'fr')).toBe('fr:Hello');
  });

  it('translates a batch in one pipeline call', async () => {
    const { module, calls } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });

    expect(await engine.translateBatch(['Hello', 'Welcome'], 'en', 'fr')).toEqual([
      'fr:Hello',
      'fr:Welcome',
    ]);
    expect(calls).toEqual([['Hello', 'Welcome']]);
  });

  it('loads a model once per language pair', async () => {
    const { module, pipelineFactory } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });

    await engine.translate('Hello', 'en', 'fr');
    await engine.translate('Welcome', 'en', 'fr');
    await engine.translate('Hello', 'en', 'es');

    expect(pipelineFactory).toHaveBeenCalledTimes(2);
  });

  it('serialises concurrent calls on the same pair', async () => {
    let inFlight = 0;
    let peak = 0;
    const module = {
      env: {},
      pipeline: async () => async (input: string | string[]) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        const texts = Array.isArray(input) ? input : [input];
        return texts.map((text) => ({ translation_text: text }));
      },
    } as unknown as TransformersModule;

    const engine = new LocalTranslationEngine({ transformers: module });
    await Promise.all([
      engine.translateBatch(['a'], 'en', 'fr'),
      engine.translateBatch(['b'], 'en', 'fr'),
      engine.translateBatch(['c'], 'en', 'fr'),
    ]);

    expect(peak).toBe(1);
  });

  it('short-circuits when both languages are the same', async () => {
    const { module, pipelineFactory } = fakeTransformers();
    const engine = new LocalTranslationEngine({ transformers: module });

    expect(await engine.translateBatch(['Hello'], 'en', 'en')).toEqual(['Hello']);
    expect(pipelineFactory).not.toHaveBeenCalled();
  });

  it('keeps the input when the model returns nothing usable', async () => {
    const module = {
      env: {},
      pipeline: async () => async () => [{}],
    } as unknown as TransformersModule;

    const engine = new LocalTranslationEngine({ transformers: module });
    expect(await engine.translate('Hello', 'en', 'fr')).toBe('Hello');
  });

  it('retries the load after a failure instead of caching it', async () => {
    let attempts = 0;
    const module = {
      env: {},
      pipeline: async () => {
        attempts++;
        if (attempts === 1) throw new Error('network down');
        return async (input: string | string[]) =>
          (Array.isArray(input) ? input : [input]).map((text) => ({
            translation_text: `ok:${text}`,
          }));
      },
    } as unknown as TransformersModule;

    const engine = new LocalTranslationEngine({ transformers: module });
    await expect(engine.translate('Hello', 'en', 'fr')).rejects.toThrow('network down');
    expect(await engine.translate('Hello', 'en', 'fr')).toBe('ok:Hello');
  });

  it('forwards the runtime configuration to Transformers.js', async () => {
    const { module } = fakeTransformers();
    const engine = new LocalTranslationEngine({
      transformers: module,
      cacheDir: '/tmp/models',
      allowRemoteModels: false,
      localModelPath: '/srv/models',
    });

    await engine.warmup('en', 'fr');

    expect(module.env.cacheDir).toBe('/tmp/models');
    expect(module.env.allowRemoteModels).toBe(false);
    expect(module.env.localModelPath).toBe('/srv/models');
  });

  it('explains how to fix a missing peer dependency', async () => {
    const engine = new LocalTranslationEngine({
      importTransformers: () =>
        Promise.reject(new Error("Cannot find package '@huggingface/transformers'")),
    });
    await expect(engine.translate('Hello', 'en', 'fr')).rejects.toThrow(
      /npm install @huggingface\/transformers/,
    );
  });
});
