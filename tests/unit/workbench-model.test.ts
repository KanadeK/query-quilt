import { describe, expect, it } from 'vitest';
import { getSampleWorkflow, type QueryColumn } from '../../src/adapters';
import { parseWorkflow } from '../../src/core';
import {
  availableColumns,
  createStep,
  displayCell,
  fileSlug,
  numericColumns,
  STEP_KIND_OPTIONS,
  type TableInfo,
} from '../../src/features/workbench/model';

const workflow = getSampleWorkflow('regional-category-sales');
const tables: TableInfo[] = [
  {
    name: 'sales',
    columns: [
      { name: 'order_id', type: 'VARCHAR' },
      { name: 'revenue', type: 'DOUBLE' },
    ],
  },
  {
    name: 'customers',
    columns: [{ name: 'customer_id', type: 'VARCHAR' }],
  },
];

describe('workbench model', () => {
  it('creates a valid default for every supported step kind', () => {
    let candidate = structuredClone(workflow);
    const columns = ['order_id', 'revenue'];

    for (const option of STEP_KIND_OPTIONS) {
      const step = createStep(option.value, candidate, tables, columns);
      candidate = parseWorkflow({
        ...candidate,
        steps: [...candidate.steps, step],
      });
    }

    expect(candidate.steps).toHaveLength(workflow.steps.length + 6);
    expect(new Set(candidate.steps.map((step) => step.id)).size).toBe(candidate.steps.length);
  });

  it('uses result columns first and table columns as a fallback', () => {
    expect(availableColumns(workflow, tables, null)).toEqual(['order_id', 'revenue']);
    expect(
      availableColumns(workflow, tables, {
        sql: 'SELECT 1',
        resultHash: 'hash',
        durationMs: 1,
        steps: [],
        columns: [{ name: 'final_column', type: 'INTEGER' }],
        rows: [{ final_column: 1 }],
      }),
    ).toEqual(['final_column']);
  });

  it('formats cells, file slugs, and numeric columns deterministically', () => {
    const columns: QueryColumn[] = [
      { name: 'label', type: 'VARCHAR' },
      { name: 'amount', type: 'DOUBLE' },
      { name: 'inferred', type: 'UNKNOWN' },
    ];
    const rows = [{ label: 'North', amount: 12.5, inferred: 2n }];

    expect(numericColumns(columns, rows).map((column) => column.name)).toEqual([
      'amount',
      'inferred',
    ]);
    expect(displayCell(null)).toBe('NULL');
    expect(displayCell(2n)).toBe('2');
    expect(displayCell({ value: 1 })).toBe('{"value":1}');
    expect(fileSlug('  Mini order path! ')).toBe('mini-order-path');
    expect(fileSlug('数据')).toBe('query-quilt-workflow');
  });
});
