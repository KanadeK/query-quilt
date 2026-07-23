# Query Quilt

Query Quilt turns local CSV and Parquet files into an inspectable chain of data steps. Every
step compiles to DuckDB SQL and remains reversible.

The v0.1.0 delivery will include local file import, filter/select/derive/group/join/sort
steps, per-step row counts, undo and redo, charts, and SQL/workflow/CSV/chart exports.

## Development

```bash
npm ci
npm run verify
```

Data stays in the browser. The application has no upload service or analytics endpoint.

## Project status

Active development toward v0.1.0. See [CHANGELOG.md](CHANGELOG.md) and
[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md).

## License

[MIT](LICENSE)
