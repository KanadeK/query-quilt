# Architecture

Query Quilt separates deterministic workflow meaning from browser infrastructure.

- `src/core`: validated workflow types, SQL compilation, history, hashing, and exports.
- `src/adapters`: DuckDB-WASM, local files, IndexedDB, and browser download boundaries.
- `src/features`: React components and application orchestration.
- `src/workers`: browser worker entry points for compute-heavy adapters.
- `examples`: synthetic, redistributable datasets and workflows.
- `tests`: unit, integration, and browser-level acceptance coverage.

The domain core never imports React, DOM APIs, storage, networking, or DuckDB. The SQL
compiler emits a complete query for the result and a prefix query for each step. The
DuckDB adapter is the source of truth for result rows and row counts.
