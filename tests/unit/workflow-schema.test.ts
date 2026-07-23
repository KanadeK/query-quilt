import { describe, expect, it } from 'vitest';
import { WorkflowSchema, parseWorkflow } from '../../src/core/workflow';

const baseWorkflow = {
  id: 'regional-sales',
  name: 'Regional sales',
  sourceTable: 'sales',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  steps: [
    {
      id: 'north-only',
      kind: 'filter',
      label: 'Keep northern orders',
      enabled: true,
      column: 'region',
      operator: '=',
      value: 'North',
    },
  ],
} as const;

describe('WorkflowSchema', () => {
  it('parses a complete workflow', () => {
    const workflow = parseWorkflow(baseWorkflow);

    expect(workflow.id).toBe('regional-sales');
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0]?.kind).toBe('filter');
  });

  it('rejects duplicate step identifiers', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [baseWorkflow.steps[0], { ...baseWorkflow.steps[0] }],
    };

    expect(() => WorkflowSchema.parse(candidate)).toThrow(/unique/i);
  });

  it('rejects an unsafe derived-column expression', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [
        {
          id: 'unsafe',
          kind: 'derive',
          label: 'Unsafe expression',
          enabled: true,
          column: 'adjusted',
          expression: 'revenue; DROP TABLE sales',
        },
      ],
    };

    expect(() => WorkflowSchema.parse(candidate)).toThrow(/single SQL expression/i);
  });

  it('requires a filter value for comparison operators', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [
        {
          id: 'missing-value',
          kind: 'filter',
          label: 'Missing value',
          enabled: true,
          column: 'region',
          operator: '=',
        },
      ],
    };

    expect(() => WorkflowSchema.parse(candidate)).toThrow(/value/i);
  });

  it('allows null checks without a value', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [
        {
          id: 'missing-region',
          kind: 'filter',
          label: 'Missing region',
          enabled: true,
          column: 'region',
          operator: 'is_null',
        },
      ],
    };

    expect(WorkflowSchema.parse(candidate).steps[0]).toMatchObject({
      operator: 'is_null',
    });
  });

  it('requires a source column for non-count measures', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [
        {
          id: 'invalid-total',
          kind: 'group',
          label: 'Invalid total',
          enabled: true,
          dimensions: [],
          measures: [{ aggregation: 'sum', alias: 'total' }],
        },
      ],
    };

    expect(() => WorkflowSchema.parse(candidate)).toThrow(/source column/i);
  });

  it('requires string values for text filters', () => {
    const candidate = {
      ...baseWorkflow,
      steps: [
        {
          id: 'invalid-text-filter',
          kind: 'filter',
          label: 'Invalid text filter',
          enabled: true,
          column: 'region',
          operator: 'contains',
          value: 42,
        },
      ],
    };

    expect(() => WorkflowSchema.parse(candidate)).toThrow(/string value/i);
  });
});
