# Publishing

Four packages, published independently. Nothing here is automatic on merge: a
release is a tag you push on purpose.

| Package                          | npm    | Depends on                       |
| -------------------------------- | ------ | -------------------------------- |
| `@offline-translator/middleware` | public | nothing                          |
| `@offline-translator/fastify`    | public | `middleware`, peer `fastify`     |
| `@offline-translator/nestjs`     | public | `middleware`, peer `@nestjs/*`   |
| `@offline-translator/local`      | public | peer `@huggingface/transformers` |

## Versioning

Independent, not lockstep. A package is only released when it changed, which is
why `local` sits at 0.2.0 while the others are at 0.3.0 — it skipped the
adapters' release, in which nothing in it changed.

Semver, with the pre-1.0 caveat that the API is still allowed to move in a
minor. What "stable" means concretely, today:

- Every package's value exports are pinned by a `tests/public-api.test.ts`.
  Adding a name to that list is a minor; removing or renaming one is a major.
  A change nobody made deliberately fails CI.
- The adapters depend on `^0.2.0` of the core package, so a core patch reaches
  them without a re-release.
- The shared behaviour — route filtering, language detection, headers, error
  handling — is asserted by near-identical suites in all three adapters. A
  divergence between frameworks is a bug, not a variation.

## Before releasing

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
npm pack --dry-run --workspace @offline-translator/middleware
```

The last one is worth reading rather than skimming: it lists exactly what ships.
Expect `dist/`, `README.md`, `CHANGELOG.md` and `LICENSE`, and nothing else —
that is what `files` in each `package.json` restricts it to.

Checklist:

- [ ] `CHANGELOG.md` has an entry for the version, dated.
- [ ] `version` in `package.json` matches it.
- [ ] An adapter's `dependencies` range still covers the core version it needs.
- [ ] The README's examples still compile — the examples under `examples/` are
      the ones that get run, so `npm run demo`, `npm run demo:fastify` and
      `npm run demo:nestjs` all pass.
- [ ] `repository.url` still points at the repository the workflow runs in, or
      provenance will be rejected. See below.

## A known flaky test

The Express and Nest suites drive their apps through supertest, which binds a
throwaway server on an ephemeral port. Roughly one run in twenty, a request
lands on a socket that is no longer the server it was meant for and the
assertion fails on a stray 400, an empty body, or an unparseable response.

It is the harness, not the code: a bare Express app with no middleware at all,
exercised the same way, reproduces it. `tests/setup.ts` turns off keep-alive on
`http.globalAgent`, which cuts the rate down but does not eliminate it.

So a red release run is worth re-running once before believing it. Fixing it
properly means moving those suites off per-request listeners — the Fastify
suite already avoids the whole problem by using `app.inject()`.

## Releasing

Tags are `<package>-v<version>`:

```bash
git tag middleware-v0.2.0
git push origin middleware-v0.2.0
```

The `Release` workflow re-runs the whole verification, checks that the tag and
the `package.json` version agree, and publishes with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements). It
needs an automation token in the `NPM_TOKEN` repository secret, and the
`id-token: write` permission it already declares.

Publish the core package first when a release spans several: the adapters
resolve `@offline-translator/middleware` from the registry, not from the
workspace.

To rehearse without publishing, run the workflow manually from the Actions tab
with **dry-run** left on — it packs instead of publishing.

## Publishing by hand

Same thing, without CI, if the workflow is unavailable:

```bash
npm login
npm publish --access public --workspace @offline-translator/middleware
```

No `--provenance` here: npm only issues a provenance attestation from a
supported CI provider, and refuses the flag from a laptop. A package published
by hand simply has none.

`prepublishOnly` runs the build, so `dist/` is always current. `--access public`
matters: the packages are scoped, and scoped packages default to private.

## Provenance and the `repository` field

`npm publish --provenance` records which repository and workflow built the
tarball, and npm rejects the attestation when that does not match
`repository.url` in `package.json`. All four manifests point at
`github.com/BriceTheFama/offline-translation-middleware`, with `directory` set
to their path inside it — the repository this tree is the root of, and the one
the workflows run in. Moving the tree into another repository means updating
those three fields (`repository`, `homepage`, `bugs`) in every manifest and
relocating `.github/workflows/`.

## After releasing

- Verify the published contents: `npm view @offline-translator/middleware`, and
  install the tarball into a scratch project to check that types resolve under
  both `import` and `require`.
- Unpublishing is only possible within 72 hours, and only if nothing depends on
  the version. `npm deprecate` is the realistic fix for a bad release; a
  follow-up patch is the better one.
