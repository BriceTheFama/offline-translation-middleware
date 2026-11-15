# Architecture

## The pipeline

```text
1  request arrives
2  route filtering            excludeRoutes / includeRoutes / bypass header
3  target language            resolver -> ?lang= -> Accept-Language -> default
4  handler runs               your code, untouched
5  res.json(body) intercepted
6  is translation necessary?  empty body, size limit; source === target only
                              when per-text source languages are off
7  find configured fields     one traversal, deduplicating as it goes;
                              each text gets its own source language
                              (resolver -> en/fr detector -> sourceLanguage)
                              and is dropped if already in the target
8  cache lookup               key = text's source + target + text
9  translate the rest         batch when available, bounded concurrency
10 update the cache
11 rebuild the payload        copy-on-write, original untouched
12 Content-Language           only when something was translated
13 send
```

Steps 7 to 11 are the `ResponseTranslator`. Steps 1 to 4, 6, 12 and 13 are
`TranslationPipeline`, which is framework-free too; only step 5 — getting hold
of the body — is the adapter's own.

## The three adapters

```text
                       TranslationPipeline
        plan(req) -> { handled, translate, targetLanguage }
        shouldTranslateBody(req, body) -> boolean
        translate(body, target)        -> { value, translated, stats }
                    |            |             |
        Express     |  Fastify   |   NestJS    |
        res.json    |  preSeri-  |   inter-    |
        wrapper     |  alization |   ceptor    |
```

Each adapter answers the same two questions in the same order — _should this
request be handled?_ then _should this body be translated?_ — and differs only
in how it gets the body and how it sets a header. Express wraps `res.json`;
Fastify uses the `preSerialization` hook, which it skips for strings, buffers
and streams; Nest maps the value the handler returned.

`Vary: Accept-Language` goes on every handled route, `Content-Language` only on
a response that actually changed. `mergeVary` exists so an adapter appends to a
`Vary` another plugin already set instead of overwriting it.

Splitting it this way is what keeps the three honest: the adapter test suites
are near-copies of each other because the behaviour genuinely is the same.

## Modules

```text
src/
  middleware/translation.middleware.ts   Express glue: res.json, headers, routes
  core/
    request-pipeline.ts  framework-free HTTP layer, shared by every adapter
    translator.ts        the pipeline: dedup, cache, engine, stats
    json-traverser.ts    collect slots + copy-on-write rebuild
    field-matcher.ts     'name', 'data.name', 'data.**.name'
    language-detector.ts query, Accept-Language, fallbacks (target language)
    options.ts           defaults and validation
    errors.ts
  cache/
    memory-cache.ts      LRU + TTL, and a noop implementation
    cache.interface.ts   cache key construction
  engines/
    translation-engine.ts  the contract, plus a batch capability check
    fake-engine.ts         deterministic dictionary for tests
  utils/
    concurrency.ts        bounded map, chunking
    route-matcher.ts      '/auth/*', '/admin/**'
    translatable-value.ts URL/email/UUID/JWT guards
    en-fr-detector.ts     English or French, per text (source language)
    logger.ts             debug output, sanitised
```

## Why a copy-on-write rebuild

Collecting and translating cannot happen in a single pass: the engine wants all
the texts at once, so it can batch and deduplicate. That means two passes.

The second pass is not a second full traversal. The collected paths are turned
into a trie, and only the nodes on those paths are visited and cloned. A
response with 1000 objects and two translated fields in one of them clones two
containers, not a thousand. The original object is never mutated, so a handler
that keeps a reference to what it passed to `res.json()` — a cached document,
for instance — does not see it change under its feet.

## Why the engine is an interface

Translation quality, licensing and cost are the application's decisions, not
the middleware's. The contract is one required method:

```typescript
translate(text, sourceLanguage, targetLanguage): Promise<string>
```

`translateBatch` is optional; when present it is preferred, because nearly every
engine amortises overhead across a batch. A batch failure degrades to per-text
calls rather than losing the whole group.

## Why the cache is synchronous

A synchronous `get`/`set` keeps the hot path free of promises and makes the
in-process case — by far the most common one — as cheap as a `Map` lookup. The
cost is that an out-of-process cache needs a local write-through layer. An
async cache interface is planned for v0.3, alongside a Redis adapter.

## Size and depth limits

Traversal counts characters as it walks and stops as soon as `maxResponseSize`
is exceeded, returning the payload untouched. Nothing is serialised to measure
it, and a hostile or accidentally huge response cannot turn into thousands of
model calls. `maxDepth` bounds recursion; `maxTextLength` bounds a single call.
