import { describe, expect, it } from 'vitest';
import { getSampleWorkflow, SAMPLE_TABLES, SAMPLE_WORKFLOWS } from '../../src/adapters/samples';

describe('sample catalog', () => {
  it('contains three synthetic tables and five valid workflows', () => {
    expect(SAMPLE_TABLES.map((table) => table.name)).toEqual(['sales', 'inventory', 'customers']);
    expect(SAMPLE_WORKFLOWS).toHaveLength(5);
    expect(new Set(SAMPLE_WORKFLOWS.map((workflow) => workflow.id)).size).toBe(5);
  });

  it('references only tables that ship with the repository', () => {
    const tableNames = new Set(SAMPLE_TABLES.map((table) => table.name));

    for (const workflow of SAMPLE_WORKFLOWS) {
      expect(tableNames.has(workflow.sourceTable)).toBe(true);
      for (const step of workflow.steps) {
        if (step.kind === 'join') {
          expect(tableNames.has(step.rightTable)).toBe(true);
        }
      }
    }
  });

  it('ships non-empty deterministic CSV documents', () => {
    const rowCounts = Object.fromEntries(
      SAMPLE_TABLES.map((table) => [table.name, table.csv.trim().split(/\r?\n/).length - 1]),
    );

    expect(rowCounts).toEqual({ sales: 30, inventory: 10, customers: 10 });
  });

  it('retrieves a workflow by stable identifier and rejects unknown identifiers', () => {
    expect(getSampleWorkflow('inventory-reorder').sourceTable).toBe('inventory');
    expect(() => getSampleWorkflow('not-a-sample')).toThrow(/unknown sample workflow/i);
  });
});
