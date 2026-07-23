# Release checklist

Query Quilt uses executable gates rather than a manually claimed release status. The local
gate is `npm run release-check` (or `make release-check` where Make is installed).

## 1. Repository state

- [ ] The branch is `main`, the index and worktree are clean, and no untracked file is
      hidden from the decision.
- [ ] `package.json`, `package-lock.json`, `src/version.ts`, and the documented current
      version all say `0.1.0`.
- [ ] `CHANGELOG.md` contains a dated `v0.1.0` section with no remaining Unreleased item.
- [ ] Every author and committer matches the authenticated GitHub owner.
- [ ] No commit message contains a `Co-authored-by` trailer.
- [ ] The tracked tree contains no secret-like value or unfinished implementation marker.

The final release commit is allowed to run the local gate against its staged snapshot
before the commit exists. After committing, run it again in clean-tree mode.

## 2. Quality gates

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
```

- [ ] All commands exit zero without suppressed failures or `continue-on-error`.
- [ ] All 58 unit/integration and 8 Chromium E2E tests pass.
- [ ] Core line coverage is at least 80% (the v0.1.0 baseline is 97.68%).
- [ ] The browser suite covers imports, four exports, edits/history, persistence, invalid
      inputs, chart lifecycle, 390 px layout, Axe, privacy probes, and offline samples.
- [ ] `npm audit --audit-level=high` reports no high/critical production or development
      vulnerability.

## 3. Documentation evidence

- [ ] `npm run demo` produces a real DuckDB-WASM result and the documented hash.
- [ ] `npm run screenshot` regenerates the real workbench image and shows v0.1.0.
- [ ] `npm run benchmark` completes without browser errors or external requests.
- [ ] README commands work from a fresh checkout with Node.js 22 or newer.
- [ ] English and Chinese README facts, privacy boundaries, limits, and links agree.

## 4. Packages

```bash
npm run package
```

- [ ] `dist-release/query-quilt-v0.1.0-static.zip` exists.
- [ ] `dist-release/query-quilt-v0.1.0-workflows.zip` exists.
- [ ] `dist-release/SHA256SUMS.txt` lists both archives.
- [ ] The packager verifies each digest.
- [ ] Each archive is extracted in a new temporary directory.
- [ ] The static archive serves its entry page and required WASM/worker assets with safe
      relative paths.
- [ ] The workflow archive parses all five workflows and includes all three synthetic
      source tables, license, and example guide.
- [ ] Neither archive contains `.env`, source maps, caches, databases, logs, or repository
      metadata.

## 5. Hosted verification

- [ ] The GitHub repository is public and its default branch is `main`.
- [ ] Repository description, MIT license, topics, and private vulnerability reporting are
      configured.
- [ ] CI, Security, and Pages workflows for the release commit are green.
- [ ] The Pages URL returns HTTP 200 and executes a sample in a browser.
- [ ] Only after those checks pass, annotated tag `v0.1.0` is pushed.
- [ ] The tag resolves to the verified main commit.
- [ ] The release workflow reruns its quality gate and uploads both archives plus
      `SHA256SUMS.txt`.
- [ ] The GitHub Release is public, non-draft, and non-prerelease.
- [ ] Downloaded remote assets match the local SHA-256 values.
- [ ] GitHub contributors, `git shortlog`, authors, and committers show only the
      authenticated owner expected for this initial release.

## 6. One-command gate

`npm run release-check` runs the test/build/package/security/version/author checks and
prints an explicit failure for any unmet local condition. It does not tag, push, or create
a release. Hosted checks remain a separate post-push gate so a network failure cannot be
misreported as a successful local release.
