import { describe, expect, it } from 'vitest';
import { rowsToCsv, serializeWorkflow } from '../../src/core/exports';
import type { Workflow } from '../../src/core/workflow';

const workflow: Workflow = {
  id: 'export-example',
  name: 'Export example',
  sourceTable: 'sales',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  steps: [],
};

describe('rowsToCsv', () => {
  it('escapes commas, quotes, and newlines', () => {
    const csv = rowsToCsv([
      { name: 'A, B', note: 'He said "yes"' },
      { name: 'C', note: 'line 1\nline 2' },
    ]);

    expect(csv).toBe('name,note\r\n"A, B","He said ""yes"""\r\nC,"line 1\nline 2"\r\n');
  });

  it('neutralizes spreadsheet formulas while preserving ordinary values', () => {
    const csv = rowsToCsv([{ label: '=2+2', amount: 4, missing: null }]);

    expect(csv).toBe("label,amount,missing\r\n'=2+2,4,\r\n");
  });

  it('uses an explicit column order', () => {
    const csv = rowsToCsv([{ beta: 2, alpha: 1 }], ['alpha', 'beta']);

    expect(csv).toBe('alpha,beta\r\n1,2\r\n');
  });

  it('serializes dates, nested values, bigint values, and undefined cells', () => {
    const csv = rowsToCsv([
      {
        recorded_at: new Date('2026-01-02T03:04:05.000Z'),
        metadata: { beta: 2, alpha: 1 },
        units: 9n,
        optional: undefined,
      },
    ]);

    expect(csv).toBe(
      'recorded_at,metadata,units,optional\r\n2026-01-02T03:04:05.000Z,"{""alpha"":1,""beta"":2}",9,\r\n',
    );
  });

  it('returns an empty document when no columns exist', () => {
    expect(rowsToCsv([])).toBe('');
  });

  it('rejects executable values instead of using object stringification', () => {
    expect(() => rowsToCsv([{ unsafe: () => 'value' }])).toThrow(/function/i);
  });
});

describe('serializeWorkflow', () => {
  it('validates and emits a stable newline-terminated document', () => {
    const document = serializeWorkflow({ ...workflow, ignoredRows: [{ secret: 'not exported' }] });

    expect(document.endsWith('\n')).toBe(true);
    expect(document).toContain('"sourceTable": "sales"');
    expect(document).not.toContain('ignoredRows');
    expect(document).not.toContain('not exported');
  });
});
