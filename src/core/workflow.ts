import { z } from 'zod';

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const forbiddenExpressionPattern =
  /;|--|\/\*|\*\/|\b(?:alter|attach|call|copy|create|delete|detach|drop|export|import|insert|install|load|pragma|select|update)\b/i;

export const IdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(identifierPattern, 'Use a SQL identifier containing letters, numbers, and underscores.');

const StepIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(slugPattern, 'Step identifiers must use lowercase words separated by hyphens.');

const ScalarSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);

const BaseStepSchema = z.object({
  id: StepIdSchema,
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
});

const FilterStepSchema = BaseStepSchema.extend({
  kind: z.literal('filter'),
  column: IdentifierSchema,
  operator: z.enum([
    '=',
    '!=',
    '>',
    '>=',
    '<',
    '<=',
    'contains',
    'starts_with',
    'is_null',
    'is_not_null',
  ]),
  value: ScalarSchema.optional(),
}).superRefine((step, context) => {
  const isNullCheck = step.operator === 'is_null' || step.operator === 'is_not_null';
  if (!isNullCheck && (step.value === undefined || step.value === null)) {
    context.addIssue({
      code: 'custom',
      message: 'A comparison filter requires a value.',
      path: ['value'],
    });
  }

  const isTextOperator = step.operator === 'contains' || step.operator === 'starts_with';
  if (isTextOperator && typeof step.value !== 'string') {
    context.addIssue({
      code: 'custom',
      message: 'Text filters require a string value.',
      path: ['value'],
    });
  }
});

const SelectStepSchema = BaseStepSchema.extend({
  kind: z.literal('select'),
  columns: z.array(IdentifierSchema).min(1).max(200),
});

const DeriveStepSchema = BaseStepSchema.extend({
  kind: z.literal('derive'),
  column: IdentifierSchema,
  expression: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(
      (expression) => !forbiddenExpressionPattern.test(expression),
      'A derived column must be a single SQL expression without statements, comments, or subqueries.',
    ),
});

const MeasureSchema = z
  .object({
    aggregation: z.enum(['count', 'count_distinct', 'sum', 'avg', 'min', 'max']),
    column: IdentifierSchema.optional(),
    alias: IdentifierSchema,
  })
  .superRefine((measure, context) => {
    if (measure.aggregation !== 'count' && !measure.column) {
      context.addIssue({
        code: 'custom',
        message: `${measure.aggregation} requires a source column.`,
        path: ['column'],
      });
    }
  });

const GroupStepSchema = BaseStepSchema.extend({
  kind: z.literal('group'),
  dimensions: z.array(IdentifierSchema).max(20),
  measures: z.array(MeasureSchema).min(1).max(40),
});

const JoinStepSchema = BaseStepSchema.extend({
  kind: z.literal('join'),
  rightTable: IdentifierSchema,
  joinType: z.enum(['inner', 'left']),
  leftColumn: IdentifierSchema,
  rightColumn: IdentifierSchema,
  rightColumns: z
    .array(
      z.object({
        column: IdentifierSchema,
        alias: IdentifierSchema,
      }),
    )
    .min(1)
    .max(100),
});

const SortStepSchema = BaseStepSchema.extend({
  kind: z.literal('sort'),
  orders: z
    .array(
      z.object({
        column: IdentifierSchema,
        direction: z.enum(['asc', 'desc']),
      }),
    )
    .min(1)
    .max(20),
});

export const WorkflowStepSchema = z.discriminatedUnion('kind', [
  FilterStepSchema,
  SelectStepSchema,
  DeriveStepSchema,
  GroupStepSchema,
  JoinStepSchema,
  SortStepSchema,
]);

export const WorkflowSchema = z
  .object({
    id: z.string().min(1).max(80).regex(slugPattern),
    name: z.string().trim().min(1).max(120),
    sourceTable: IdentifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    steps: z.array(WorkflowStepSchema).max(100),
  })
  .superRefine((workflow, context) => {
    const identifiers = new Set<string>();
    for (const [index, step] of workflow.steps.entries()) {
      if (identifiers.has(step.id)) {
        context.addIssue({
          code: 'custom',
          message: 'Step identifiers must be unique within a workflow.',
          path: ['steps', index, 'id'],
        });
      }
      identifiers.add(step.id);
    }
  });

export type Workflow = z.infer<typeof WorkflowSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Scalar = z.infer<typeof ScalarSchema>;

export function parseWorkflow(input: unknown): Workflow {
  return WorkflowSchema.parse(input);
}
