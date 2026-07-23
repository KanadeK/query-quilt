import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  hashValue,
  pushHistory,
  redoHistory,
  stableStringify,
  undoHistory,
} from '../../src/core/history';

describe('history', () => {
  it('undoes and redoes exact states', () => {
    const initial = createHistory({ steps: ['filter'] });
    const changed = pushHistory(initial, { steps: ['filter', 'sort'] });
    const undone = undoHistory(changed);
    const redone = redoHistory(undone);

    expect(canUndo(changed)).toBe(true);
    expect(undone.present).toEqual(initial.present);
    expect(canRedo(undone)).toBe(true);
    expect(redone.present).toEqual(changed.present);
  });

  it('clears the redo branch after a new edit', () => {
    const state = pushHistory(undoHistory(pushHistory(createHistory({ value: 1 }), { value: 2 })), {
      value: 3,
    });

    expect(state.present).toEqual({ value: 3 });
    expect(state.future).toEqual([]);
    expect(canRedo(state)).toBe(false);
  });

  it('leaves boundary undo and redo operations unchanged', () => {
    const history = createHistory({ value: 1 });

    expect(undoHistory(history)).toBe(history);
    expect(redoHistory(history)).toBe(history);
  });
});

describe('deterministic hashing', () => {
  it('sorts object keys recursively', () => {
    expect(stableStringify({ beta: 2, alpha: { delta: 4, gamma: 3 } })).toBe(
      '{"alpha":{"delta":4,"gamma":3},"beta":2}',
    );
  });

  it('normalizes browser and DuckDB value types without collisions', () => {
    expect(
      stableStringify([
        true,
        'text',
        undefined,
        9n,
        new Date('2026-01-02T03:04:05.000Z'),
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]),
    ).toBe(
      '[true,"text",{"$type":"undefined"},{"$bigint":"9"},{"$date":"2026-01-02T03:04:05.000Z"},{"$number":"NaN"},{"$number":"Infinity"},{"$number":"-Infinity"}]',
    );
  });

  it('rejects functions and circular values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => stableStringify(() => 'not data')).toThrow(/function/i);
    expect(() => stableStringify(circular)).toThrow(/circular/i);
  });

  it('produces the same hash for semantically identical values', async () => {
    const left = await hashValue({ beta: [2, 3], alpha: 1 });
    const right = await hashValue({ alpha: 1, beta: [2, 3] });

    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it('restores the original hash after undo', async () => {
    const initial = createHistory({ steps: ['filter'] });
    const initialHash = await hashValue(initial.present);
    const changed = pushHistory(initial, { steps: ['filter', 'sort'] });
    const restoredHash = await hashValue(undoHistory(changed).present);

    expect(await hashValue(changed.present)).not.toBe(initialHash);
    expect(restoredHash).toBe(initialHash);
  });
});
