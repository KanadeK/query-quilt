import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parseWorkflow, type Workflow } from '../core/workflow';

interface QueryQuiltDatabase extends DBSchema {
  workflows: {
    key: string;
    value: Workflow;
    indexes: {
      'by-updated': string;
    };
  };
}

const DATABASE_VERSION = 1;

export class WorkflowStore {
  private databasePromise: Promise<IDBPDatabase<QueryQuiltDatabase>>;

  constructor(databaseName = 'query-quilt') {
    this.databasePromise = openDB<QueryQuiltDatabase>(databaseName, DATABASE_VERSION, {
      upgrade(database) {
        const workflows = database.createObjectStore('workflows', { keyPath: 'id' });
        workflows.createIndex('by-updated', 'updatedAt');
      },
    });
  }

  async save(input: unknown): Promise<Workflow> {
    const workflow = parseWorkflow(input);
    const database = await this.databasePromise;
    await database.put('workflows', workflow);
    return workflow;
  }

  async get(id: string): Promise<Workflow | undefined> {
    const database = await this.databasePromise;
    const stored = await database.get('workflows', id);
    return stored ? parseWorkflow(stored) : undefined;
  }

  async list(): Promise<Workflow[]> {
    const database = await this.databasePromise;
    const workflows = await database.getAll('workflows');
    return workflows
      .map(parseWorkflow)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async remove(id: string): Promise<void> {
    const database = await this.databasePromise;
    await database.delete('workflows', id);
  }

  async clear(): Promise<void> {
    const database = await this.databasePromise;
    await database.clear('workflows');
  }

  async close(): Promise<void> {
    const database = await this.databasePromise;
    database.close();
  }
}
