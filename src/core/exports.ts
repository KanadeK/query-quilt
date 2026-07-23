import { stableStringify } from './history';
import { WorkflowSchema } from './workflow';

type Row = Readonly<Record<string, unknown>>;

function spreadsheetSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    return stableStringify(value);
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  throw new TypeError(`CSV export does not support ${typeof value} values.`);
}

function csvCell(value: unknown): string {
  const safe = spreadsheetSafe(displayValue(value));
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}

function inferColumns(rows: readonly Row[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }
  return [...columns];
}

export function rowsToCsv(rows: readonly Row[], explicitColumns?: readonly string[]): string {
  const columns = explicitColumns ? [...explicitColumns] : inferColumns(rows);
  if (columns.length === 0) {
    return '';
  }

  const lines = [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function serializeWorkflow(input: unknown): string {
  const workflow = WorkflowSchema.parse(input);
  return `${JSON.stringify(workflow, null, 2)}\n`;
}
