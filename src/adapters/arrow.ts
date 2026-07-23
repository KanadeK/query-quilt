import type { QueryResult } from './query';

interface ArrowFieldLike {
  name: string;
  type: {
    scale?: number;
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

const arrowBigNumSymbol = Symbol.for('isArrowBigNum');

function decimalString(value: ArrayBufferView, scale: number): string {
  const arrowValue = value as ArrayBufferView & {
    [arrowBigNumSymbol]?: boolean;
    toString(): string;
  };
  if (!arrowValue[arrowBigNumSymbol]) {
    throw new TypeError('Arrow returned a decimal without its exact-number marker.');
  }

  const raw = arrowValue.toString();
  const negative = raw.startsWith('-');
  const digits = negative ? raw.slice(1) : raw;
  if (!/^\d+$/.test(digits)) {
    throw new TypeError('Arrow returned an invalid decimal value.');
  }
  const sign = negative ? '-' : '';
  if (scale === 0) {
    return `${sign}${digits}`;
  }
  if (scale < 0) {
    return `${sign}${digits}${'0'.repeat(-scale)}`;
  }
  const padded = digits.padStart(scale + 1, '0');
  const split = padded.length - scale;
  return `${sign}${padded.slice(0, split)}.${padded.slice(split)}`;
}

function normalizeValue(value: unknown, arrowType?: ArrowFieldLike['type']): unknown {
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
    if (typeof arrowType?.scale === 'number') {
      return decimalString(value, arrowType.scale);
    }
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
  const fieldsByName = new Map(table.schema.fields.map((field) => [field.name, field.type]));
  const columns = table.schema.fields.map((field) => ({
    name: field.name,
    type: field.type.toString(),
  }));
  const rows = table.toArray().map((row) => {
    const json = row.toJSON ? row.toJSON() : row;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new TypeError('DuckDB returned a result row that is not an object.');
    }
    return Object.fromEntries(
      Object.entries(json).map(([key, value]) => [
        key,
        normalizeValue(value, fieldsByName.get(key)),
      ]),
    );
  });

  return { columns, rows };
}
