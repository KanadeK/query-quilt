# Benchmark

This page records a real v0.1.0 development-candidate run, not a performance guarantee.
Results vary with browser, power state, memory pressure, cache state, and future code.

## Environment

Measured on 2026-07-23 with the production Vite build:

| Item           | Value                                                     |
| -------------- | --------------------------------------------------------- |
| OS             | Windows 10.0.26200 x64                                    |
| CPU            | Intel Core i9-14900HX, 32 logical cores                   |
| Memory         | 31.8 GiB total; 3.7 GiB free at measurement               |
| Node.js        | v24.18.0                                                  |
| Browser        | headless Chromium 149.0.7827.55                           |
| Database       | DuckDB-WASM 1.32.0, bundled MVP Worker/WASM               |
| Build          | minified production assets served from localhost          |
| Network policy | localhost only; service workers blocked for repeatability |

## Data

| Dataset         | Rows | Bytes |
| --------------- | ---: | ----: |
| `sales.csv`     |   30 | 2,176 |
| `inventory.csv` |   10 |   657 |
| `customers.csv` |   10 |   480 |

These small synthetic tables measure application overhead and query correctness, not
large-file throughput.

## Method

The executable `npm run benchmark` task:

1. rebuilds the production application;
2. starts the repository's static server;
3. launches a clean headless Chromium context;
4. measures cold start from navigation until DuckDB is ready and the first 64-character
   result hash exists;
5. cycles through all five workflows five times;
6. measures each selection until a different committed result hash appears;
7. fails if the page raises an exception or makes an external request;
8. writes the complete observation to `artifacts/benchmark.json`.

No arbitrary sleeps, mocked query results, or external APIs are used.

## Results

Cold start: **4,626.3 ms**.

| Workflow                     | Output rows | Minimum |  Median |      p95 | Result hash prefix |
| ---------------------------- | ----------: | ------: | ------: | -------: | ------------------ |
| Customer segment value       |           3 | 60.6 ms | 76.2 ms | 128.5 ms | `23226cc9`         |
| Inventory reorder queue      |           5 | 63.2 ms | 65.7 ms |  79.4 ms | `1512f125`         |
| Product performance          |          10 | 48.1 ms | 60.7 ms |  63.0 ms | `b81cd578`         |
| High-value order review      |          17 | 63.0 ms | 65.2 ms |  80.3 ms | `bdc9469d`         |
| Northern revenue by category |           3 | 57.2 ms | 60.9 ms |  76.0 ms | `221e8503`         |

The full hashes stayed stable across all five repetitions and matched the earlier browser
validation for this build. Cold start is dominated by loading and instantiating the local
DuckDB runtime; warm workflow changes on these fixtures are well below one second.

## Interpretation and limits

- The sample scale is deliberately reproducible and too small to claim large-data
  performance.
- Headless Chromium timing is useful for regression comparisons, not a substitute for
  interactive measurements on target devices.
- The test machine had substantial memory pressure at measurement time, which may affect
  cold start.
- The current production build precaches roughly 39.4 MiB, primarily DuckDB WASM.
- v0.1.1 keeps imported tables in memory; practical limits depend on browser and device,
  even though the input guard is 512 MiB.

Future releases should retain this fixture baseline and add generated 10k/100k/1m-row
profiles before making throughput claims.
