# Release checklist

The release gate is executable through `npm run release-check`.

- Version metadata and changelog agree on v0.1.0.
- Lint, formatting, typecheck, coverage, E2E, and production build pass.
- Core line coverage is at least 80%.
- Three browser acceptance paths and the offline sample path pass.
- Static and workflow archives are generated and unpacked in a clean temporary directory.
- SHA256SUMS.txt matches every release asset.
- The tracked tree contains no secrets or unfinished implementation markers.
- Commit authors and committers match the authenticated GitHub owner.
- CI, security, and Pages workflows are green.
- The annotated tag points to the verified main commit.
- The public release is not a draft and all asset checksums match local artifacts.
