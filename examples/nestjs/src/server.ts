/**
 * NestJS API translated on the way out.
 *
 *   npm run example:nestjs
 *   TRANSLATION_ENGINE=local npm run example:nestjs   # real OPUS-MT model, offline
 *
 * Then:
 *   curl -H 'Accept-Language: fr' localhost:3002/products
 *   curl -H 'Accept-Language: en' localhost:3002/products
 *   curl 'localhost:3002/products?lang=en'
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createAppModule, createEngine } from './app.module.js';

const PORT = Number(process.env.PORT ?? 3002);

async function main(): Promise<void> {
  const app = await NestFactory.create(createAppModule(await createEngine(), true), {
    logger: ['error', 'warn'],
  });

  await app.listen(PORT);
  console.log(`example API on http://localhost:${PORT}`);
  console.log(`  curl -H 'Accept-Language: fr' localhost:${PORT}/products`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
