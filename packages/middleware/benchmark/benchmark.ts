/**
 * `npm run benchmark`
 *
 * Measures the middleware pipeline — traversal, dedup, cache, replacement —
 * against an engine with a fixed, configurable latency, so the numbers are
 * about this package rather than about a model.
 */
import { createTranslator } from '../src/core/translator.js';
import type { TranslationEngine, TranslationStats } from '../src/types/index.js';

const ENGINE_LATENCY_MS = Number(process.env.ENGINE_LATENCY_MS ?? 2);

/** Stands in for a real engine: constant latency, batch aware. */
function createBenchmarkEngine(latencyMs: number): TranslationEngine & { texts: number } {
  return {
    texts: 0,
    async translate(text) {
      this.texts++;
      if (latencyMs > 0) await sleep(latencyMs);
      return `fr:${text}`;
    },
    async translateBatch(texts) {
      this.texts += texts.length;
      if (latencyMs > 0) await sleep(latencyMs);
      return texts.map((text) => `fr:${text}`);
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `uniqueTexts` distinct sentences spread over `count` records. */
function buildPayload(count: number, uniqueTexts: number): unknown {
  return {
    success: true,
    data: Array.from({ length: count }, (_, index) => ({
      id: index,
      sku: `SKU-${index}`,
      price: 1000 + index,
      currency: 'XOF',
      status: 'ACTIVE',
      url: `https://example.com/p/${index}`,
      name: `Product name number ${index % uniqueTexts}`,
      description: `A fairly long product description number ${index % uniqueTexts}`,
    })),
  };
}

interface Row {
  scenario: string;
  strings: number;
  unique: number;
  durationMs: number;
  engineTexts: number;
  cacheHitRate: string;
}

async function run(
  scenario: string,
  payload: unknown,
  options: { cache: boolean; warm: boolean },
): Promise<Row> {
  const engine = createBenchmarkEngine(ENGINE_LATENCY_MS);
  let last: TranslationStats | undefined;

  const translator = createTranslator({
    engine,
    sourceLanguage: 'en',
    defaultLanguage: 'fr',
    supportedLanguages: ['en', 'fr'],
    fields: ['name', 'description'],
    cache: options.cache ? { ttl: 3600, maxEntries: 100_000 } : false,
    concurrency: 5,
    batchSize: 25,
    onTranslationComplete: (stats) => {
      last = stats;
    },
  });

  if (options.warm) await translator.translateResponse(payload, 'fr');
  const before = engine.texts;

  const start = performance.now();
  await translator.translateResponse(payload, 'fr');
  const durationMs = performance.now() - start;

  const stats = last as TranslationStats;
  return {
    scenario,
    strings: stats.totalFields,
    unique: stats.uniqueTexts,
    durationMs: Math.round(durationMs * 100) / 100,
    engineTexts: engine.texts - before,
    cacheHitRate: `${Math.round((stats.cacheHits / Math.max(1, stats.uniqueTexts)) * 100)}%`,
  };
}

async function main(): Promise<void> {
  console.log(`engine latency: ${ENGINE_LATENCY_MS}ms per call\n`);
  const rows: Row[] = [];

  for (const count of [5, 50, 500]) {
    // 2 translatable strings per record.
    const allUnique = buildPayload(count, count);
    const manyDuplicates = buildPayload(count, 10);
    const label = `${count * 2} strings`;

    rows.push(await run(`${label}, cold cache`, allUnique, { cache: true, warm: false }));
    rows.push(await run(`${label}, warm cache`, allUnique, { cache: true, warm: true }));
    rows.push(await run(`${label}, no cache`, allUnique, { cache: false, warm: false }));
    rows.push(
      await run(`${label}, duplicated texts`, manyDuplicates, { cache: true, warm: false }),
    );
  }

  console.table(rows);

  const overhead = await run('1000 strings, warm cache', buildPayload(500, 500), {
    cache: true,
    warm: true,
  });
  console.log(
    `\npipeline overhead on 1000 cached strings: ${overhead.durationMs}ms ` +
      `(${Math.round((overhead.durationMs / 1000) * 1000) / 1000}ms per string)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
