export interface History<T> {
  past: readonly T[];
  present: T;
  future: readonly T[];
}

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}

export function pushHistory<T>(history: History<T>, next: T): History<T> {
  return {
    past: [...history.past, history.present],
    present: next,
    future: [],
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) {
    return history;
  }
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoHistory<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (Number.isNaN(value)) {
        return '{"$number":"NaN"}';
      }
      if (value === Number.POSITIVE_INFINITY) {
        return '{"$number":"Infinity"}';
      }
      if (value === Number.NEGATIVE_INFINITY) {
        return '{"$number":"-Infinity"}';
      }
      return JSON.stringify(value);
    case 'bigint':
      return `{"$bigint":${JSON.stringify(value.toString())}}`;
    case 'undefined':
      return '{"$type":"undefined"}';
    case 'function':
    case 'symbol':
      throw new TypeError(`Cannot hash a ${typeof value}.`);
    case 'object':
      break;
  }

  if (ancestors.has(value)) {
    throw new TypeError('Cannot hash a circular value.');
  }
  ancestors.add(value);

  let serialized: string;
  if (value instanceof Date) {
    serialized = `{"$date":${JSON.stringify(value.toISOString())}}`;
  } else if (Array.isArray(value)) {
    serialized = `[${value.map((item) => serialize(item, ancestors)).join(',')}]`;
  } else {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    serialized = `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry, ancestors)}`)
      .join(',')}}`;
  }

  ancestors.delete(value);
  return serialized;
}

export function stableStringify(value: unknown): string {
  return serialize(value, new Set<object>());
}

export async function hashValue(value: unknown): Promise<string> {
  const payload = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', payload);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
