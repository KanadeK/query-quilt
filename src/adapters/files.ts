import { IdentifierSchema } from '../core/workflow';

export const MAX_LOCAL_FILE_BYTES = 512 * 1024 * 1024;

export interface CsvDatasetFile {
  kind: 'csv';
  tableName: string;
  originalName: string;
  bytes: number;
  text: string;
}

export interface ParquetDatasetFile {
  kind: 'parquet';
  tableName: string;
  originalName: string;
  bytes: number;
  buffer: Uint8Array;
}

export type LocalDatasetFile = CsvDatasetFile | ParquetDatasetFile;

export function tableNameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  let normalized = withoutExtension
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

  if (!normalized) {
    normalized = 'imported_data';
  }
  if (/^[0-9]/.test(normalized)) {
    normalized = `data_${normalized}`;
  }
  return IdentifierSchema.parse(normalized);
}

function assertReadableFile(file: File, maxBytes: number) {
  if (file.size === 0) {
    throw new Error(`${file.name} is empty.`);
  }
  if (file.size > maxBytes) {
    throw new Error(
      `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the local limit is ${(
        maxBytes /
        (1024 * 1024)
      ).toFixed(0)} MB.`,
    );
  }
}

function assertParquetMagic(buffer: Uint8Array, fileName: string) {
  const decoder = new TextDecoder('ascii');
  const start = decoder.decode(buffer.subarray(0, 4));
  const end = decoder.decode(buffer.subarray(Math.max(0, buffer.length - 4)));
  if (buffer.length < 8 || start !== 'PAR1' || end !== 'PAR1') {
    throw new Error(`${fileName} does not contain a valid Parquet header and footer.`);
  }
}

export async function readDatasetFile(
  file: File,
  maxBytes = MAX_LOCAL_FILE_BYTES,
): Promise<LocalDatasetFile> {
  assertReadableFile(file, maxBytes);
  const tableName = tableNameFromFileName(file.name);
  const extension = file.name.split('.').at(-1)?.toLowerCase();

  try {
    if (extension === 'csv') {
      const text = (await file.text()).replace(/^\uFEFF/, '');
      if (!text.trim()) {
        throw new Error(`${file.name} contains no CSV data.`);
      }
      return {
        kind: 'csv',
        tableName,
        originalName: file.name,
        bytes: file.size,
        text,
      };
    }

    if (extension === 'parquet') {
      const buffer = new Uint8Array(await file.arrayBuffer());
      assertParquetMagic(buffer, file.name);
      return {
        kind: 'parquet',
        tableName,
        originalName: file.name,
        bytes: file.size,
        buffer,
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unable to read ${file.name}.`, { cause: error });
  }

  throw new Error(`Unsupported file type for ${file.name}; choose a .csv or .parquet file.`);
}
