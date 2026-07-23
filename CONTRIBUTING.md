# Contributing

## Set up

Use Node.js 22 or newer.

```bash
npm ci
npm run verify
```

Keep domain rules in `src/core`, browser integrations in `src/adapters`, and user-facing
flows in `src/features`. Add a regression test for every fixed defect.

## Pull requests

- Keep changes focused and explain user impact.
- Do not add telemetry, remote uploads, or sample data with personal information.
- Run lint, format check, typecheck, coverage, E2E, and build before requesting review.
- Use Conventional Commit style and do not add unrequested co-author trailers.
