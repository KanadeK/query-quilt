import { describe, expect, it } from 'vitest';
import { arrowTableToQueryResult } from '../../src/adapters/arrow';

describe('arrowTableToQueryResult', () => {
  it('normalizes Arrow rows while preserving data meaning', () => {
    const recordedAt = new Date('2026-01-02T03:04:05.000Z');
    const result = arrowTableToQueryResult({
      schema: {
        fields: [
          { name: 'id', type: { toString: () => 'BIGINT' } },
          { name: 'payload', type: { toString: () => 'STRUCT' } },
        ],
      },
      toArray: () => [
        {
          toJSON: () => ({
            id: 9n,
            recordedAt,
            bytes: new Uint8Array([1, 2]),
            tags: ['north', 'priority'],
            metadata: new Map([['active', true]]),
          }),
        },
      ],
    });

    expect(result.columns).toEqual([
      { name: 'id', type: 'BIGINT' },
      { name: 'payload', type: 'STRUCT' },
    ]);
    expect(result.rows[0]).toEqual({
      id: 9n,
      recordedAt,
      bytes: [1, 2],
      tags: ['north', 'priority'],
      metadata: { active: true },
    });
  });

  it('rejects non-object rows', () => {
    expect(() =>
      arrowTableToQueryResult({
        schema: { fields: [] },
        toArray: () => [{ toJSON: () => 'not a row' }],
      }),
    ).toThrow(/not an object/i);
  });
});
