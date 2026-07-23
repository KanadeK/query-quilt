# Privacy and security

Query Quilt v0.1.0 is a static, local-first browser application. “Local-first” describes a
specific data-flow boundary; it does not mean the hosting origin, browser, or dependency
supply chain is automatically trusted.

## Data inventory and lifetime

| Data                                      | Location                                      | Lifetime                                     |
| ----------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Imported CSV/Parquet bytes                | in-tab DuckDB virtual file, then table memory | until refresh/tab close                      |
| Imported table rows                       | in-memory DuckDB-WASM database                | until refresh/tab close                      |
| Workflow ID/name/steps/table metadata     | React memory; optional same-origin IndexedDB  | until edit/refresh; saved copy until deleted |
| Bundled synthetic tables and workflows    | static application/service-worker cache       | until site data/cache is cleared             |
| Generated SQL/result rows/chart rendering | browser memory                                | until replacement/refresh                    |
| Downloaded SQL/JSON/CSV/PNG               | user-selected browser download destination    | controlled by the user/browser               |

A workflow JSON document does not contain the source CSV or Parquet bytes. Saving a
workflow therefore does not make an imported dataset persistent.

## Network behavior

On first visit, the browser requests static assets from the selected hosting origin:
HTML, JavaScript, CSS, the PWA manifest/service worker, DuckDB's worker, and the roughly
39 MiB uncompressed MVP WASM module. The application code contains:

- no upload endpoint;
- no remote database adapter;
- no account or authentication service;
- no analytics, advertising, error-reporting, or telemetry SDK;
- no automatic third-party fetch.

The GitHub icon is a normal external link and makes no request unless followed. E2E, demo,
screenshot, and benchmark probes treat any non-local request during application execution
as a failure. A deployed Pages build naturally uses the GitHub Pages origin rather than
localhost; the same application bundle still has no business-data request.

After a successful production load and service-worker precache, the bundled samples can
execute offline. An imported dataset is already local, but refresh clears it in v0.1.0.

## Explicit output channels

Query Quilt produces files only after a user activates an export:

- complete equivalent SQL (`.sql`);
- validated workflow definition (`.workflow.json`);
- all result rows (`.results.csv`), even though the DOM displays at most 250;
- the current numeric ECharts view (`.chart.png`).

Clipboard access occurs only when the user selects “Copy equivalent SQL”. If permission is
denied, the UI reports it and points to the download path.

## Input controls

- File type is restricted to CSV and Parquet in the UI and adapter.
- Empty files and files above 512 MiB are rejected.
- Parquet imports require `PAR1` header and footer bytes before DuckDB reads them.
- Filenames are normalized to bounded SQL identifiers.
- Workflow JSON passes a bounded Zod schema before execution or IndexedDB storage.
- All generated table and column identifiers are SQL-quoted.
- Filter scalar values are escaped as SQL literals.
- Derived expressions are capped at 500 characters and reject semicolons, SQL comments,
  subqueries, extension/attachment commands, DDL, and data-changing statement keywords.
- Result CSV cells beginning like spreadsheet formulas are escaped to reduce CSV formula
  injection when opened in spreadsheet software.

These controls reduce accidental and common malicious inputs; they are not a formally
verified SQL sandbox. DuckDB may accept complex expressions not anticipated by the UI.

## Threat model

### Covered

- accidental upload or telemetry from product code;
- malformed or oversized local input;
- identifier/literal injection through structured step fields;
- unsafe statement-shaped derived expressions;
- formula-shaped CSV output;
- workflow corruption at the storage/import boundary;
- release secrets or unfinished markers in tracked content;
- dependency vulnerabilities reported by `npm audit`.

### Not covered

- a malicious browser extension or compromised local browser profile;
- a compromised hosting origin, service worker, npm package, GitHub Action, or browser;
- physical access to downloads, IndexedDB, or browser memory;
- denial of service from a technically valid dataset near the memory limit;
- confidentiality after the user downloads or shares an export;
- multi-user isolation, because there is no multi-user service.

Do not use Query Quilt as the only control for regulated or highly sensitive data on an
untrusted device. Review the hosting origin and dependency lockfile appropriate to your
risk level.

## Supply-chain and release controls

- Dependencies are exact-versioned in `package.json` and locked in `package-lock.json`.
- CI installs with `npm ci`; it does not rewrite the lockfile.
- GitHub workflows use official actions with stable major pins and minimal permissions.
- Security automation runs dependency audit and a tracked-content secret scan.
- Releases are built from a verified main commit, packaged with SHA-256 checksums, and
  smoke-tested after extraction in a fresh temporary directory.
- Synthetic sample records were created for this repository and are MIT-licensed.

## Testing the boundary

The browser tests:

1. observe production requests and fail on any destination outside localhost;
2. import real CSV and invalid Parquet/JSON fixtures;
3. verify failures do not destroy the last successful result;
4. save/reload a workflow through real IndexedDB;
5. take the browser offline and execute all five cached samples;
6. validate real downloaded SQL, JSON, CSV, and PNG bytes.

Static checks complement, but do not replace, this runtime evidence.

## Reporting

Report vulnerabilities privately through GitHub's private vulnerability reporting for
`KanadeK/query-quilt`; do not publish an unpatched exploit in an issue. See
[`SECURITY.md`](../SECURITY.md) for the supported-version policy.
