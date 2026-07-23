import { hashValue } from '../core/history';
import { compileWorkflow } from '../core/sql';
import type { Workflow, WorkflowStep } from '../core/workflow';

export interface QueryColumn {
  name: string;
  type: string;
}

export type DataRow = Readonly<Record<string, unknown>>;

export interface QueryResult {
  columns: readonly QueryColumn[];
  rows: readonly DataRow[];
}

export interface QueryExecutor {
  query(sql: string): Promise<QueryResult>;
}

export interface Clock {
  now(): number;
}

export interface StepExecution {
  stepId: string;
  label: string;
  kind: WorkflowStep['kind'];
  inputRows: number;
  outputRows: number;
}

export interface WorkflowExecution extends QueryResult {
  sql: string;
  resultHash: string;
  durationMs: number;
  steps: readonly StepExecution[];
}

const systemClock: Clock = {
  now: () => globalThis.performance.now(),
};

function readRowCount(result: QueryResult): number {
  const value = result.rows[0]?.row_count;
  const count =
    typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error('DuckDB returned an invalid row count.');
  }
  return count;
}

export async function executeWorkflow(
  executor: QueryExecutor,
  workflow: Workflow,
  clock: Clock = systemClock,
): Promise<WorkflowExecution> {
  const startedAt = clock.now();
  const compiled = compileWorkflow(workflow);
  const countCache = new Map<string, number>();

  const count = async (sql: string) => {
    const cached = countCache.get(sql);
    if (cached !== undefined) {
      return cached;
    }
    const value = readRowCount(await executor.query(sql));
    countCache.set(sql, value);
    return value;
  };

  const steps: StepExecution[] = [];
  for (const step of compiled.steps) {
    steps.push({
      stepId: step.stepId,
      label: step.label,
      kind: step.kind,
      inputRows: await count(step.inputCountSql),
      outputRows: await count(step.outputCountSql),
    });
  }

  const result = await executor.query(compiled.sql);
  const resultHash = await hashValue(result.rows);
  const durationMs = Math.max(0, clock.now() - startedAt);

  return {
    ...result,
    sql: compiled.sql,
    resultHash,
    durationMs,
    steps,
  };
}
