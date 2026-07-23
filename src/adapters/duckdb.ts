import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import { quoteIdentifier, sqlLiteral } from '../core/sql';
import { IdentifierSchema, type Workflow } from '../core/workflow';
import { arrowTableToQueryResult } from './arrow';
import type { LocalDatasetFile } from './files';
import {
  executeWorkflow,
  type QueryExecutor,
  type QueryResult,
  type WorkflowExecution,
} from './query';

const LOCAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdbWasmUrl,
    mainWorker: duckdbWorkerUrl,
  },
};

export interface TableColumn {
  name: string;
  type: string;
}

export class DuckDbEngine implements QueryExecutor {
  private database: duckdb.AsyncDuckDB | null = null;
  private connection: duckdb.AsyncDuckDBConnection | null = null;
  private initialization: Promise<void> | null = null;
  private fileCounter = 0;

  async initialize(): Promise<void> {
    if (this.connection) {
      return;
    }
    if (!this.initialization) {
      this.initialization = this.createDatabase().catch((error: unknown) => {
        this.initialization = null;
        throw error;
      });
    }
    await this.initialization;
  }

  private async createDatabase(): Promise<void> {
    const bundle = await duckdb.selectBundle(LOCAL_BUNDLES);
    if (!bundle.mainWorker) {
      throw new Error('DuckDB-WASM did not select a browser worker.');
    }

    const worker = new Worker(bundle.mainWorker);
    const database = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    try {
      await database.instantiate(bundle.mainModule, bundle.pthreadWorker);
      this.connection = await database.connect();
      this.database = database;
    } catch (error) {
      await database.terminate();
      throw error;
    }
  }

  private async resources() {
    await this.initialize();
    if (!this.database || !this.connection) {
      throw new Error('DuckDB-WASM initialization completed without a connection.');
    }
    return { database: this.database, connection: this.connection };
  }

  async query(sql: string): Promise<QueryResult> {
    const { connection } = await this.resources();
    return arrowTableToQueryResult(await connection.query(sql));
  }

  async registerCsv(tableName: string, csv: string): Promise<void> {
    const validName = IdentifierSchema.parse(tableName);
    const { database, connection } = await this.resources();
    const path = `query_quilt_${this.fileCounter++}_${validName}.csv`;
    await database.registerFileText(path, csv);
    try {
      await connection.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(validName)} AS ` +
          `SELECT * FROM read_csv_auto(${sqlLiteral(path)}, header = true, sample_size = -1);`,
      );
    } finally {
      await database.dropFile(path);
    }
  }

  async registerParquet(tableName: string, buffer: Uint8Array): Promise<void> {
    const validName = IdentifierSchema.parse(tableName);
    const { database, connection } = await this.resources();
    const path = `query_quilt_${this.fileCounter++}_${validName}.parquet`;
    await database.registerFileBuffer(path, buffer);
    try {
      await connection.query(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(validName)} AS ` +
          `SELECT * FROM read_parquet(${sqlLiteral(path)});`,
      );
    } finally {
      await database.dropFile(path);
    }
  }

  async registerDataset(dataset: LocalDatasetFile): Promise<void> {
    if (dataset.kind === 'csv') {
      await this.registerCsv(dataset.tableName, dataset.text);
    } else {
      await this.registerParquet(dataset.tableName, dataset.buffer);
    }
  }

  async listTables(): Promise<string[]> {
    const result = await this.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name;",
    );
    return result.rows.map((row) => String(row.table_name));
  }

  async tableColumns(tableName: string): Promise<TableColumn[]> {
    const validName = IdentifierSchema.parse(tableName);
    const result = await this.query(
      'SELECT column_name, data_type FROM information_schema.columns ' +
        `WHERE table_schema = 'main' AND table_name = ${sqlLiteral(validName)} ` +
        'ORDER BY ordinal_position;',
    );
    return result.rows.map((row) => ({
      name: String(row.column_name),
      type: String(row.data_type),
    }));
  }

  async execute(workflow: Workflow): Promise<WorkflowExecution> {
    return executeWorkflow(this, workflow);
  }

  async dispose(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    if (this.database) {
      await this.database.terminate();
      this.database = null;
    }
    this.initialization = null;
  }
}
