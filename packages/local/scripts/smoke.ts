/**
 * Real end-to-end check of the local engine, in both directions: downloads the
 * en-fr and fr-en OPUS-MT models on the first run, then translates offline.
 * Run with `npm run smoke`.
 */
import { LocalTranslationEngine } from '../src/index.js';

const SENTENCES: Record<'en' | 'fr', string[]> = {
  en: [
    'Hello',
    'Welcome to our application',
    'A smartphone with a large screen',
    'Your order has been shipped',
  ],
  fr: [
    'Bonjour',
    'Bienvenue dans notre application',
    'Un smartphone avec un grand écran',
    'Votre commande a été expédiée',
  ],
};

async function main(): Promise<void> {
  const engine = new LocalTranslationEngine({
    onModelLoad: (modelId) => console.log(`loading ${modelId} (first run downloads it)`),
  });

  for (const [source, target] of [
    ['en', 'fr'],
    ['fr', 'en'],
  ] as const) {
    const loadStart = performance.now();
    await engine.warmup(source, target);
    console.log(
      `${source} > ${target}: model ready in ${Math.round(performance.now() - loadStart)}ms`,
    );

    const sentences = SENTENCES[source];
    const start = performance.now();
    const translations = await engine.translateBatch(sentences, source, target);
    const duration = Math.round(performance.now() - start);

    for (const [index, sentence] of sentences.entries()) {
      console.log(`  ${sentence}  ->  ${translations[index]}`);
    }
    console.log(`  ${sentences.length} sentences in ${duration}ms\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
