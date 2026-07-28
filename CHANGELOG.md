# Changelog

All notable changes to Query Quilt are documented here.

## [v0.1.0] - 2026-07-28

- Establish the React, TypeScript, Vite, Vitest, Playwright, and DuckDB-WASM foundation.
- Record the public-repository competitor scan and local-first privacy boundary.
- Add a validated six-step workflow model, deterministic SQL compiler, undo/redo history, and safe export helpers.
- Add local CSV and Parquet adapters, IndexedDB persistence, three synthetic datasets, and five executable sample workflows.
- Deliver the browser workbench with live DuckDB execution, editable step cards, row-count telemetry, SQL inspection, responsive data tables, charts, and four export formats.
- Fix chart lifecycle isolation so switching workflows while a chart is open cannot remove React-owned interface nodes.
- Precache the local DuckDB WASM runtime so the production application can execute samples after the network is disconnected.
- Add 58 unit and integration checks plus eight Chromium end-to-end paths covering import, export, editing, history, persistence, accessibility, responsive layout, and offline use.
- Preserve exact Arrow decimal scale during result normalization and cover the behavior against a real DuckDB `DECIMAL(21,1)` result.
- Add a deterministic production-server harness with isolated service-worker coverage for stable Windows and CI browser runs.
- Complete the English and Simplified Chinese guides, architecture and privacy threat model, release checklist, and measured benchmark.
- Add reproducible production-browser scripts for a real DuckDB demo result, README screenshot, and all-sample performance baseline.
- Add Linux, Windows, and macOS quality gates plus minimal-permission security, Pages, and tag-release workflows.
- Build deterministic static/workflow archives with SHA-256 sums, safe-entry validation, clean extraction, and a real packaged-browser smoke test.
- Add repository secret/unfinished-marker scans and a one-command release gate that verifies versions, coverage, artifacts, authors, and a clean tree.
- Override Workbox's legacy Jake file-list dependency with its Node 22-compatible patched major, removing the high-severity brace-expansion advisory chain.
