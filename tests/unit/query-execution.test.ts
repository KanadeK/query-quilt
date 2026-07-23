import { describe, expect, it } from 'vitest';
import { executeWorkflow, type QueryExecutor } from '../../src/adapters/query';
import { compileWorkflow } from '../../src/core/sql';
import type { Workflow } from '../../src/core/workflow';

const workflow: Workflow = {
  id: 'execution-test',
  name: 'Execution test',
  sourceTable: 'sales',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  steps: [
    {
      id: 'north-only',
      kind: 'filter',
      label: 'North only',
      enabled: true,
      column: 'region',
      operator: '=',
      value: 'North',
    },
    {
      id: 'largest-first',
      kind: 'sort',
      label: 'Largest first',
      enabled: true,
      orders: [{ column: 'revenue', direction: 'desc' }],
    },
  ],
};

describe('executeWorkflow', () => {
  it('measures each step, reuses duplicate count queries, and hashes real rows', async () => {
    const compiled = compileWorkflow(workflow);
    const calls: string[] = [];
    const responses = new Map([
      [compiled.steps[0]?.inputCountSql, [{ row_count: 4n }]],
      [compiled.steps[0]?.outputCountSql, [{ row_count: 2n }]],
      [compiled.steps[1]?.outputCountSql, [{ row_count: 2n }]],
      [
        compiled.sql,
        [
          { order_id: 'O-2', revenue: 200 },
          { order_id: 'O-1', revenue: 100 },
        ],
      ],
    ]);
    const executor: QueryExecutor = {
      query(sql) {
        calls.push(sql);
        const rows = responses.get(sql);
        if (!rows) {
          throw new Error(`Unexpected query: ${sql}`);
        }
        return Promise.resolve({
          columns: Object.keys(rows[0] ?? {}).map((name) => ({
            name,
            type: 'TEST',
          })),
          rows,
        });
      },
    };
    const moments = [10, 26];

    const execution = await executeWorkflow(executor, workflow, {
      now: () => moments.shift() ?? 26,
    });

    expect(execution.steps).toEqual([
      {
        stepId: 'north-only',
        label: 'North only',
        kind: 'filter',
        inputRows: 4,
        outputRows: 2,
      },
      {
        stepId: 'largest-first',
        label: 'Largest first',
        kind: 'sort',
        inputRows: 2,
        outputRows: 2,
      },
    ]);
    expect(execution.rows).toHaveLength(2);
    expect(execution.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(execution.durationMs).toBe(16);
    expect(calls).toHaveLength(4);
  });

  it('rejects unsafe row-count values from an executor', async () => {
    const executor: QueryExecutor = {
      query() {
        return Promise.resolve({
          columns: [{ name: 'row_count', type: 'VARCHAR' }],
          rows: [{ row_count: 'not-a-count' }],
        });
      },
    };

    await expect(executeWorkflow(executor, workflow)).rejects.toThrow(/invalid row count/i);
  });
});
