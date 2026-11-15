/**
 * Boots the example API, calls it in French and in English, prints both
 * answers, and exits. `npm run demo`.
 */
import { createApp, createEngine } from './app.js';

async function main(): Promise<void> {
  const app = createApp(await createEngine());
  const server = app.listen(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const call = async (path: string, language: string): Promise<unknown> => {
    const response = await fetch(`http://localhost:${port}${path}`, {
      headers: { 'Accept-Language': language },
    });
    console.log(`\nGET ${path}  (Accept-Language: ${language})`);
    console.log(`Content-Language: ${response.headers.get('content-language') ?? '(none)'}`);
    const body = await response.json();
    console.log(JSON.stringify(body, null, 2));
    return body;
  };

  await call('/products', 'fr');
  await call('/products', 'en');
  await call('/health', 'fr');

  server.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
