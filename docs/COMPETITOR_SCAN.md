# Public repository competitor scan

Scan date: 2026-07-23

Source: GitHub public repository search and the listed repositories' README files

Queries: exact `Query Quilt`, exact `query-quilt`, `duckdb-wasm`, `visual SQL`, and `CSV explorer`

No exact repository-name or slug match was returned. The intended
`KanadeK/query-quilt` repository did not exist at scan time.

| Repository                                                              | Stars | Updated (UTC) | Main capability                                                                 | Overlap with Query Quilt                                                                                                   |
| ----------------------------------------------------------------------- | ----: | ------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [StructuredLabs/preswald](https://github.com/StructuredLabs/preswald)   | 4,283 | 2026-07-21    | Packages Python data apps for offline in-browser use with Pyodide and DuckDB    | Local and offline analytics, but code-app packaging rather than a reversible visual SQL step chain                         |
| [duckdb/duckdb-wasm](https://github.com/duckdb/duckdb-wasm)             | 2,080 | 2026-07-23    | Official browser build of DuckDB with CSV, Parquet, JSON, and Arrow support     | Query engine dependency, not a workflow product                                                                            |
| [rpbouman/huey](https://github.com/rpbouman/huey)                       |   595 | 2026-07-22    | Browser query builder, pivot analysis, file import, SQL and result export       | Strongest overlap; it emphasizes multidimensional exploration rather than an ordered, reversible, per-step SQL audit trail |
| [caioricciuti/duck-ui](https://github.com/caioricciuti/duck-ui)         |   593 | 2026-07-23    | DuckDB-WASM SQL editor, file import, data explorer, and query history           | SQL-first workbench without a compiled transformation chain or step-level undo hashes                                      |
| [sqlrooms/sqlrooms](https://github.com/sqlrooms/sqlrooms)               |   486 | 2026-07-22    | React building blocks for browser analytics applications                        | Developer framework rather than an end-user step workflow                                                                  |
| [mattf96s/QuackDB](https://github.com/mattf96s/QuackDB)                 |   204 | 2026-07-06    | Privacy-preserving DuckDB SQL playground with local persistence                 | Local execution and charts, but SQL-editor-first and its README lists data export as unfinished                            |
| [hfmsio/dbxlite](https://github.com/hfmsio/dbxlite)                     |    81 | 2026-07-23    | Large-file SQL workbench with OPFS, virtual grids, and several database engines | Broader query workbench; no deterministic reversible step-chain contract                                                   |
| [excalichart/excalichart](https://github.com/excalichart/excalichart)   |    43 | 2026-07-01    | Whiteboard-oriented dataset visualization                                       | Chart creation overlap, but no DuckDB-backed SQL workflow                                                                  |
| [Chenkeliang/duckdb-query](https://github.com/Chenkeliang/duckdb-query) |    30 | 2026-07-23    | Local-first SQL and AI workbench with joins, charts, and exports                | Strong functional breadth; SQL/AI-centric rather than teaching each transformation as reversible equivalent SQL            |
| [gustavotoyota/VisualSQL](https://github.com/gustavotoyota/VisualSQL)   |    40 | 2026-05-12    | Static visual SQL editing tool                                                  | Visual query construction, but no local file execution, row lineage, or result export contract                             |

Star counts and update timestamps are point-in-time observations and will change.

## Decision

No sampled active project exceeded an estimated 70% overlap with the complete MVP contract.
The name remains **Query Quilt**.

The product is deliberately narrower than general SQL workbenches:

1. A workflow is an ordered, reversible document, not query-history text.
2. Every step exposes equivalent SQL and measured input/output rows.
3. Exported SQL must reproduce the visible result in DuckDB.
4. Undo and redo must restore the same deterministic workflow and result hashes.
5. Five synthetic workflows remain usable after the browser goes offline.

The public repository sample did not reveal an active project with the same name and a
highly isomorphic feature contract. This is an evidence-limited comparison, not a global
uniqueness claim.
