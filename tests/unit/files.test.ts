import { describe, expect, it } from 'vitest';
import { readDatasetFile, tableNameFromFileName } from '../../src/adapters/files';

describe('tableNameFromFileName', () => {
  it('creates safe, stable SQL identifiers', () => {
    expect(tableNameFromFileName('Quarterly Sales 2026.csv')).toBe('quarterly_sales_2026');
    expect(tableNameFromFileName('42-résumé.csv')).toBe('data_42_resume');
    expect(tableNameFromFileName('数据.csv')).toBe('imported_data');
  });
});

describe('readDatasetFile', () => {
  it('reads CSV text and strips a UTF-8 byte-order mark', async () => {
    const file = new File(['\uFEFFid,value\n1,alpha\n'], 'sample.csv', {
      type: 'text/csv',
    });

    await expect(readDatasetFile(file)).resolves.toMatchObject({
      kind: 'csv',
      tableName: 'sample',
      text: 'id,value\n1,alpha\n',
    });
  });

  it('accepts a Parquet-shaped binary with matching header and footer magic', async () => {
    const bytes = new TextEncoder().encode('PAR1payloadPAR1');
    const file = new File([bytes], 'sample.parquet');

    const result = await readDatasetFile(file);

    expect(result.kind).toBe('parquet');
    if (result.kind === 'parquet') {
      expect(Array.from(result.buffer)).toEqual(Array.from(bytes));
    }
  });

  it('rejects empty, oversized, invalid, and unsupported files', async () => {
    await expect(readDatasetFile(new File([], 'empty.csv'))).rejects.toThrow(/empty/i);
    await expect(readDatasetFile(new File(['abcdef'], 'large.csv'), 4)).rejects.toThrow(
      /local limit/i,
    );
    await expect(readDatasetFile(new File(['not parquet'], 'broken.parquet'))).rejects.toThrow(
      /parquet header and footer/i,
    );
    await expect(readDatasetFile(new File(['{}'], 'sample.json'))).rejects.toThrow(
      /unsupported file type/i,
    );
  });
});
