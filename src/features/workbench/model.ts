import type { QueryColumn, WorkflowExecution } from '../../adapters';
import type { TableColumn } from '../../adapters/duckdb';
import { stableStringify } from '../../core';
import type { Workflow, WorkflowStep } from '../../core';

export type StepKind = WorkflowStep['kind'];

export interface TableInfo {
  name: string;
  columns: readonly TableColumn[];
}

const STEP_LABELS: Record<StepKind, string> = {
  filter: 'Filter rows',
  select: 'Select columns',
  derive: 'Derive column',
  group: 'Group and summarize',
  join: 'Join table',
  sort: 'Sort rows',
};

export const STEP_KIND_OPTIONS = (Object.entries(STEP_LABELS) as [StepKind, string][]).map(
  ([value, label]) => ({ value, label }),
);

function uniqueStepId(workflow: Workflow, kind: StepKind): string {
  const used = new Set(workflow.steps.map((step) => step.id));
  for (let index = 1; index <= workflow.steps.length + 1; index += 1) {
    const candidate = `${kind}-${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('Unable to allocate a workflow step identifier.');
}

function firstColumn(columns: readonly string[]): string {
  return columns[0] ?? 'column_1';
}

export function availableColumns(
  workflow: Workflow,
  tables: readonly TableInfo[],
  execution: WorkflowExecution | null,
): string[] {
  const resultColumns = execution?.columns.map((column) => column.name) ?? [];
  if (resultColumns.length > 0) {
    return resultColumns;
  }
  return (
    tables
      .find((table) => table.name === workflow.sourceTable)
      ?.columns.map((column) => column.name) ?? []
  );
}

export function createStep(
  kind: StepKind,
  workflow: Workflow,
  tables: readonly TableInfo[],
  columns: readonly string[],
): WorkflowStep {
  const id = uniqueStepId(workflow, kind);
  const column = firstColumn(columns);
  const base = {
    id,
    kind,
    label: STEP_LABELS[kind],
    enabled: true,
  } as const;

  switch (kind) {
    case 'filter':
      return { ...base, kind, column, operator: 'is_not_null' };
    case 'select':
      return { ...base, kind, columns: columns.length > 0 ? [...columns] : [column] };
    case 'derive':
      return { ...base, kind, column: 'derived_value', expression: '1' };
    case 'group':
      return {
        ...base,
        kind,
        dimensions: [column],
        measures: [{ aggregation: 'count', alias: 'row_count' }],
      };
    case 'join': {
      const rightTable =
        tables.find((table) => table.name !== workflow.sourceTable) ??
        tables.find((table) => table.name === workflow.sourceTable);
      const rightColumn = rightTable?.columns[0]?.name ?? column;
      return {
        ...base,
        kind,
        rightTable: rightTable?.name ?? workflow.sourceTable,
        joinType: 'left',
        leftColumn: column,
        rightColumn,
        rightColumns: [{ column: rightColumn, alias: `${rightColumn}_joined` }],
      };
    }
    case 'sort':
      return { ...base, kind, orders: [{ column, direction: 'asc' }] };
  }
}

export function displayCell(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object') {
    return stableStringify(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return `[unsupported ${typeof value}]`;
}

export function numericColumns(columns: readonly QueryColumn[], rows: readonly object[]) {
  return columns.filter((column) => {
    const typeSuggestsNumber = /int|decimal|double|float|real|numeric|hugeint|ubigint/i.test(
      column.type,
    );
    if (typeSuggestsNumber) {
      return true;
    }
    return rows.some((row) => {
      const value = (row as Record<string, unknown>)[column.name];
      return typeof value === 'number' || typeof value === 'bigint';
    });
  });
}

export function fileSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'query-quilt-workflow';
}
