/**
 * Fastify API translated on the way out.
 *
 *   npm run example:fastify
 *   TRANSLATION_ENGINE=local npm run example:fastify   # real OPUS-MT model, offline
 *
 * Then:
 *   curl -H 'Accept-Language: fr' localhost:3001/products
 *   curl -H 'Accept-Language: en' localhost:3001/products
 *   curl 'localhost:3001/products?lang=en'
 */
import { createApp, createEngine } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  const app = await createApp(await createEngine(), { debug: true });

  await app.listen({ port: PORT });
  console.log(`example API on http://localhost:${PORT}`);
  console.log(`  curl -H 'Accept-Language: fr' localhost:${PORT}/products`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
