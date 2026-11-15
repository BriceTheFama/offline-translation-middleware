/**
 * Express API translated on the way out.
 *
 *   npm run example
 *   TRANSLATION_ENGINE=local npm run example    # real OPUS-MT model, offline
 *
 * Then:
 *   curl -H 'Accept-Language: fr' localhost:3000/products
 *   curl -H 'Accept-Language: en' localhost:3000/products
 *   curl 'localhost:3000/products?lang=en'
 */
import { createApp, createEngine } from './app.js';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  const app = createApp(await createEngine(), { debug: true });

  app.listen(PORT, () => {
    console.log(`example API on http://localhost:${PORT}`);
    console.log(`  curl -H 'Accept-Language: fr' localhost:${PORT}/products`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
