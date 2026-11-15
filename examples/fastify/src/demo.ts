/**
 * Boots the example API in memory, calls it in French and in English, prints
 * both answers, and exits. `npm run demo:fastify`.
 *
 * Uses `app.inject()` rather than a real socket, which is Fastify's own way of
 * exercising the full request lifecycle — hooks included — without a port.
 */
import { createApp, createEngine } from './app.js';

async function main(): Promise<void> {
  const app = await createApp(await createEngine());
  await app.ready();

  const call = async (url: string, language: string): Promise<void> => {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { 'accept-language': language },
    });
    console.log(`\nGET ${url}  (Accept-Language: ${language})`);
    console.log(`Content-Language: ${response.headers['content-language'] ?? '(none)'}`);
    console.log(JSON.stringify(response.json(), null, 2));
  };

  await call('/products', 'fr');
  await call('/products', 'en');
  await call('/health', 'fr');

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
