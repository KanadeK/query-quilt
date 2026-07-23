# Privacy and security

## Data flow

Imported files are registered with the in-browser DuckDB-WASM instance. Workflow documents
are stored in IndexedDB on the same origin. Query Quilt has no server component, account
system, telemetry, advertising, or automatic network adapter.

## Explicit outputs

SQL, workflow JSON, result CSV, and chart images leave the application only through a user
initiated download. A workflow stores table metadata and transformation definitions, not
the source file contents.

## Trust boundary

Derived-column expressions are local SQL fragments. They are validated to reject statement
separators and comments, then executed only against the local DuckDB instance. Users should
still treat workflows from untrusted sources as code and inspect the displayed SQL before
running them.

The static demo contains only synthetic records created for this repository.
