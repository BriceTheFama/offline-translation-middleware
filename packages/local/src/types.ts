/** Minimal shape of what `@huggingface/transformers` gives us back. */
export interface TranslationPipelineOutput {
  translation_text?: string;
}

export type TranslationPipeline = (
  input: string | string[],
  options?: Record<string, unknown>,
) => Promise<TranslationPipelineOutput | TranslationPipelineOutput[]>;

export interface TransformersModule {
  pipeline(
    task: 'translation',
    model: string,
    options?: Record<string, unknown>,
  ): Promise<TranslationPipeline>;
  env: {
    cacheDir?: string;
    localModelPath?: string;
    allowRemoteModels?: boolean;
    allowLocalModels?: boolean;
    [key: string]: unknown;
  };
}

export interface ModelResolution {
  /** Hugging Face repository id, e.g. `Xenova/opus-mt-en-fr`. */
  readonly modelId: string;
}

export type ModelResolver = (
  sourceLanguage: string,
  targetLanguage: string,
) => string | ModelResolution | undefined;

export interface LocalTranslationEngineOptions {
  /**
   * Maps a language pair to a model id.
   * Default: `Xenova/opus-mt-{source}-{target}`.
   */
  modelResolver?: ModelResolver;

  /** Explicit `{ 'en>fr': 'Xenova/opus-mt-en-fr' }` overrides, checked first. */
  models?: Record<string, string>;

  /**
   * Weight format passed to Transformers.js: `'q8'` keeps the download small,
   * `'fp32'` is slower to fetch but slightly more accurate. Default: `'q8'`.
   */
  dtype?: 'fp32' | 'fp16' | 'q8' | 'int8' | 'uint8' | 'q4';

  /** Where models are stored. Default: the Transformers.js cache directory. */
  cacheDir?: string;

  /** Set to `false` to refuse downloads and require a pre-installed model. */
  allowRemoteModels?: boolean;

  /** Directory holding pre-downloaded models, for a fully air-gapped setup. */
  localModelPath?: string;

  /** Generation cap, in tokens. Default: `512`. */
  maxNewTokens?: number;

  /**
   * Keep the final period the model adds to inputs that had none
   * (`Bonjour` → `Hello.`). Default: `false`, the period is dropped.
   */
  keepAddedPeriod?: boolean;

  /** Called once per model, when it starts loading. */
  onModelLoad?: (modelId: string) => void;

  /** Inject a preloaded module instead of importing it (used in tests). */
  transformers?: TransformersModule;

  /**
   * Advanced: replaces the dynamic `import('@huggingface/transformers')`.
   * Useful with bundlers that cannot see through the dynamic import.
   */
  importTransformers?: () => Promise<unknown>;
}
