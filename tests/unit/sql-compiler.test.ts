import { describe, expect, it } from 'vitest';
import { compileWorkflow, quoteIdentifier, sqlLiteral } from '../../src/core/sql';
import type { Workflow } from '../../src/core/workflow';

const workflow: Workflow = {
  id: 'customer-revenue',
  name: 'Customer revenue',
  sourceTable: 'sales',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  steps: [
    {
      id: 'positive-revenue',
      kind: 'filter',
      label: 'Keep positive revenue',
      enabled: true,
      column: 'revenue',
      operator: '>',
      value: 0,
    },
    {
      id: 'analysis-columns',
      kind: 'select',
      label: 'Choose analysis columns',
      enabled: true,
      columns: ['order_id', 'customer_id', 'revenue'],
    },
    {
      id: 'gross-revenue',
      kind: 'derive',
      label: 'Calculate gross revenue',
      enabled: true,
      column: 'gross_revenue',
      expression: 'revenue * 1.2',
    },
    {
      id: 'customer-segment',
      kind: 'join',
      label: 'Join customer segment',
      enabled: true,
      rightTable: 'customers',
      joinType: 'left',
      leftColumn: 'customer_id',
      rightColumn: 'customer_id',
      rightColumns: [{ column: 'segment', alias: 'segment' }],
    },
    {
      id: 'segment-summary',
      kind: 'group',
      label: 'Summarize by segment',
      enabled: true,
      dimensions: ['segment'],
      measures: [
        {
          aggregation: 'sum',
          column: 'gross_revenue',
          alias: 'total_gross_revenue',
        },
        { aggregation: 'count', alias: 'order_count' },
      ],
    },
    {
      id: 'largest-first',
      kind: 'sort',
      label: 'Sort by gross revenue',
      enabled: true,
      orders: [{ column: 'total_gross_revenue', direction: 'desc' }],
    },
    {
      id: 'disabled-step',
      kind: 'filter',
      label: 'Disabled',
      enabled: false,
      column: 'segment',
      operator: '=',
      value: 'Enterprise',
    },
  ],
};

describe('SQL helpers', () => {
  it('quotes identifiers and escapes embedded quotes', () => {
    expect(quoteIdentifier('order"value')).toBe('"order""value"');
  });

  it('serializes supported literal values without losing meaning', () => {
    expect(sqlLiteral("O'Reilly")).toBe("'O''Reilly'");
    expect(sqlLiteral(true)).toBe('TRUE');
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(19.5)).toBe('19.5');
  });

  it('rejects non-finite numbers', () => {
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });
});

describe('compileWorkflow', () => {
  it('compiles all six enabled step kinds into one executable CTE query', () => {
    const compiled = compileWorkflow(workflow);

    expect(compiled.steps).toHaveLength(6);
    expect(compiled.sql).toContain('FROM "sales"');
    expect(compiled.sql).toContain('WHERE "revenue" > 0');
    expect(compiled.sql).toContain('SELECT "order_id", "customer_id", "revenue"');
    expect(compiled.sql).toContain('(revenue * 1.2) AS "gross_revenue"');
    expect(compiled.sql).toContain('LEFT JOIN "customers" AS "r"');
    expect(compiled.sql).toContain('SUM("gross_revenue") AS "total_gross_revenue"');
    expect(compiled.sql).toContain('COUNT(*) AS "order_count"');
    expect(compiled.sql).toContain('ORDER BY "total_gross_revenue" DESC');
    expect(compiled.sql).not.toContain('Disabled');
  });

  it('provides executable input and output count SQL for every step', () => {
    const compiled = compileWorkflow(workflow);
    const first = compiled.steps[0];
    const last = compiled.steps.at(-1);

    expect(first?.inputCountSql).toBe('SELECT COUNT(*) AS "row_count" FROM "sales";');
    expect(first?.outputCountSql).toContain('FROM "step_1"');
    expect(last?.inputCountSql).toContain('FROM "step_5"');
    expect(last?.outputCountSql).toContain('FROM "step_6"');
  });

  it('returns a direct source query when no steps are enabled', () => {
    const compiled = compileWorkflow({ ...workflow, steps: [] });

    expect(compiled.sql).toBe('SELECT * FROM "sales";');
    expect(compiled.steps).toEqual([]);
  });

  it('compiles text filter operators with escaped LIKE patterns', () => {
    const compiled = compileWorkflow({
      ...workflow,
      steps: [
        {
          id: 'contains-percent',
          kind: 'filter',
          label: 'Literal wildcard',
          enabled: true,
          column: 'note',
          operator: 'contains',
          value: '50%_done',
        },
      ],
    });

    expect(compiled.sql).toContain(`"note" LIKE '%50$%$_done%' ESCAPE '$'`);
  });

  it('compiles prefix filters and null checks', () => {
    const startsWith = compileWorkflow({
      ...workflow,
      steps: [
        {
          id: 'prefix',
          kind: 'filter',
          label: 'Prefix',
          enabled: true,
          column: 'note',
          operator: 'starts_with',
          value: '$draft',
        },
      ],
    });
    const missing = compileWorkflow({
      ...workflow,
      steps: [
        {
          id: 'missing',
          kind: 'filter',
          label: 'Missing',
          enabled: true,
          column: 'note',
          operator: 'is_not_null',
        },
      ],
    });

    expect(startsWith.sql).toContain(`"note" LIKE '$$draft%' ESCAPE '$'`);
    expect(missing.sql).toContain('"note" IS NOT NULL');
  });

  it('compiles a dimension-free distinct count', () => {
    const compiled = compileWorkflow({
      ...workflow,
      steps: [
        {
          id: 'unique-customers',
          kind: 'group',
          label: 'Unique customers',
          enabled: true,
          dimensions: [],
          measures: [
            {
              aggregation: 'count_distinct',
              column: 'customer_id',
              alias: 'customer_count',
            },
          ],
        },
      ],
    });

    expect(compiled.sql).toContain('COUNT(DISTINCT "customer_id") AS "customer_count"');
    expect(compiled.sql).not.toContain('GROUP BY');
  });
});
