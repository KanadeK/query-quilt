// @vitest-environment node

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowStore } from '../../src/adapters/storage';
import type { Workflow } from '../../src/core/workflow';

let storeCounter = 0;
let activeStore: WorkflowStore | undefined;

function workflow(id: string, updatedAt: string): Workflow {
  return {
    id,
    name: id,
    sourceTable: 'sales',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    steps: [],
  };
}

function createStore() {
  activeStore = new WorkflowStore(`query-quilt-storage-test-${storeCounter++}`);
  return activeStore;
}

afterEach(async () => {
  await activeStore?.close();
  activeStore = undefined;
});

describe('WorkflowStore', () => {
  it('saves, validates, retrieves, sorts, removes, and clears workflows', async () => {
    const store = createStore();
    await store.save(workflow('older', '2026-01-01T00:00:00.000Z'));
    await store.save(workflow('newer', '2026-01-02T00:00:00.000Z'));

    expect((await store.get('older'))?.id).toBe('older');
    expect((await store.list()).map((item) => item.id)).toEqual(['newer', 'older']);

    await store.remove('newer');
    expect(await store.get('newer')).toBeUndefined();
    expect(await store.list()).toHaveLength(1);

    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it('rejects invalid workflow documents before writing', async () => {
    const store = createStore();

    await expect(store.save({ id: 'invalid' })).rejects.toThrow();
    expect(await store.list()).toEqual([]);
  });
});
