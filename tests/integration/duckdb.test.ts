// @vitest-environment node

import * as duckdb from '@duckdb/duckdb-wasm/blocking';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { arrowTableToQueryResult } from '../../src/adapters/arrow';
import { executeWorkflow, type QueryExecutor } from '../../src/adapters/query';
import { SAMPLE_TABLES, SAMPLE_WORKFLOWS } from '../../src/adapters/samples';
import { hashValue } from '../../src/core/history';
import { quoteIdentifier, sqlLiteral } from '../../src/core/sql';

const require = createRequire(import.meta.url);
const bundles: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'),
    mainWorker: '',
  },
  eh: {
    mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-eh.wasm'),
    mainWorker: '',
  },
};

let database: Awaited<ReturnType<typeof duckdb.createDuckDB>>;
let connection: ReturnType<Awaited<ReturnType<typeof duckdb.createDuckDB>>['connect']>;
let executor: QueryExecutor;

beforeAll(async () => {
  database = await duckdb.createDuckDB(bundles, new duckdb.VoidLogger(), duckdb.NODE_RUNTIME);
  await database.instantiate(() => undefined);
  connection = database.connect();

  for (const table of SAMPLE_TABLES) {
    const path = `integration_${table.fileName}`;
    database.registerFileText(path, table.csv);
    connection.query(
      `CREATE TABLE ${quoteIdentifier(table.name)} AS ` +
        `SELECT * FROM read_csv_auto(${sqlLiteral(path)}, header = true, sample_size = -1);`,
    );
  }

  executor = {
    query(sql) {
      return Promise.resolve().then(() => arrowTableToQueryResult(connection.query(sql)));
    },
  };
}, 30_000);

afterAll(() => {
  connection.close();
  database.reset();
});

describe('DuckDB-WASM sample integration', () => {
  it('materializes all three repository tables', async () => {
    const result = await executor.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name;",
    );

    expect(result.rows.map((row) => row.table_name)).toEqual(['customers', 'inventory', 'sales']);
  });

  it.each(SAMPLE_WORKFLOWS)(
    'executes $id and reproduces the visible result from exported SQL',
    async (workflow) => {
      const execution = await executeWorkflow(executor, workflow);
      const direct = await executor.query(execution.sql);

      expect(execution.rows.length).toBeGreaterThan(0);
      expect(execution.steps).toHaveLength(workflow.steps.filter((step) => step.enabled).length);
      expect(execution.steps.at(-1)?.outputRows).toBe(execution.rows.length);
      expect(execution.resultHash).toBe(await hashValue(direct.rows));
    },
  );

  it('surfaces invalid SQL as a real database failure', async () => {
    await expect(executor.query('SELECT * FROM missing_table;')).rejects.toThrow(/missing_table/i);
  });
});
