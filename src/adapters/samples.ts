import customersCsv from '../../examples/data/customers.csv?raw';
import inventoryCsv from '../../examples/data/inventory.csv?raw';
import salesCsv from '../../examples/data/sales.csv?raw';
import customerSegmentValue from '../../examples/workflows/customer-segment-value.json';
import highValueOrders from '../../examples/workflows/high-value-orders.json';
import inventoryReorder from '../../examples/workflows/inventory-reorder.json';
import productPerformance from '../../examples/workflows/product-performance.json';
import regionalCategorySales from '../../examples/workflows/regional-category-sales.json';
import { parseWorkflow, type Workflow } from '../core/workflow';

export interface SampleTable {
  name: string;
  fileName: string;
  csv: string;
}

export interface CsvRegistrar {
  registerCsv(tableName: string, csv: string): Promise<void>;
}

export const SAMPLE_TABLES: readonly SampleTable[] = [
  { name: 'sales', fileName: 'sales.csv', csv: salesCsv },
  { name: 'inventory', fileName: 'inventory.csv', csv: inventoryCsv },
  { name: 'customers', fileName: 'customers.csv', csv: customersCsv },
];

export const SAMPLE_WORKFLOWS: readonly Workflow[] = [
  regionalCategorySales,
  customerSegmentValue,
  inventoryReorder,
  productPerformance,
  highValueOrders,
].map(parseWorkflow);

export function getSampleWorkflow(id: string): Workflow {
  const workflow = SAMPLE_WORKFLOWS.find((candidate) => candidate.id === id);
  if (!workflow) {
    throw new Error(`Unknown sample workflow: ${id}`);
  }
  return workflow;
}

export async function registerSampleTables(registrar: CsvRegistrar): Promise<void> {
  for (const table of SAMPLE_TABLES) {
    await registrar.registerCsv(table.name, table.csv);
  }
}
