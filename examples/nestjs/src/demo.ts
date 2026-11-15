/**
 * Boots the example API, calls it in French and in English, prints both
 * answers, and exits. `npm run demo:nestjs`.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createAppModule, createEngine } from './app.module.js';

async function main(): Promise<void> {
  const app = await NestFactory.create(createAppModule(await createEngine()), { logger: false });
  await app.listen(0);
  const url = await app.getUrl();

  const call = async (path: string, language: string): Promise<void> => {
    const response = await fetch(`${url}${path}`, { headers: { 'Accept-Language': language } });
    console.log(`\nGET ${path}  (Accept-Language: ${language})`);
    console.log(`Content-Language: ${response.headers.get('content-language') ?? '(none)'}`);
    console.log(JSON.stringify(await response.json(), null, 2));
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
