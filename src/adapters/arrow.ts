import type { QueryResult } from './query';

interface ArrowFieldLike {
  name: string;
  type: {
    toString(): string;
  };
}

interface ArrowRowLike {
  toJSON?(): unknown;
  [key: string]: unknown;
}

export interface ArrowTableLike {
  schema: {
    fields: readonly ArrowFieldLike[];
  };
  toArray(): readonly ArrowRowLike[];
}

function normalizeValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value.entries()].map(([key, entry]) => [String(key), normalizeValue(entry)]),
    );
  }
  if (typeof value === 'object') {
    const possibleJson = value as { toJSON?: () => unknown };
    if (possibleJson.toJSON) {
      return normalizeValue(possibleJson.toJSON());
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }
  throw new TypeError(`Unsupported Arrow value type: ${typeof value}`);
}

export function arrowTableToQueryResult(table: ArrowTableLike): QueryResult {
  const columns = table.schema.fields.map((field) => ({
    name: field.name,
    type: field.type.toString(),
  }));
  const rows = table.toArray().map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    const normalized = normalizeValue(json);
    if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
      throw new TypeError('DuckDB returned a result row that is not an object.');
    }
    return normalized as Readonly<Record<string, unknown>>;
  });

  return { columns, rows };
}
