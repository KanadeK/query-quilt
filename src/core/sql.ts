import { WorkflowSchema, type Scalar, type Workflow, type WorkflowStep } from './workflow';

interface CteDefinition {
  name: string;
  body: string;
}

export interface CompiledStep {
  stepId: string;
  label: string;
  kind: WorkflowStep['kind'];
  relation: string;
  fragment: string;
  sql: string;
  inputCountSql: string;
  outputCountSql: string;
}

export interface CompiledWorkflow {
  sql: string;
  steps: CompiledStep[];
  resultRelation: string;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualified(alias: string, column: string): string {
  return `${quoteIdentifier(alias)}.${quoteIdentifier(column)}`;
}

export function sqlLiteral(value: Scalar): string {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('SQL numeric literals must be finite.');
    }
    return String(value);
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function escapeLike(value: string): string {
  return value
    .replaceAll('$', () => '$$')
    .replaceAll('%', '$%')
    .replaceAll('_', '$_');
}

function compileFilter(step: Extract<WorkflowStep, { kind: 'filter' }>): string {
  const column = quoteIdentifier(step.column);

  switch (step.operator) {
    case 'is_null':
      return `${column} IS NULL`;
    case 'is_not_null':
      return `${column} IS NOT NULL`;
    case 'contains':
      return `${column} LIKE ${sqlLiteral(`%${escapeLike(String(step.value))}%`)} ESCAPE '$'`;
    case 'starts_with':
      return `${column} LIKE ${sqlLiteral(`${escapeLike(String(step.value))}%`)} ESCAPE '$'`;
    default:
      if (step.value === undefined) {
        throw new Error(`Filter ${step.id} is missing a comparison value.`);
      }
      return `${column} ${step.operator} ${sqlLiteral(step.value)}`;
  }
}

function compileMeasure(measure: Extract<WorkflowStep, { kind: 'group' }>['measures'][number]) {
  const alias = quoteIdentifier(measure.alias);
  if (measure.aggregation === 'count') {
    const argument = measure.column ? quoteIdentifier(measure.column) : '*';
    return `COUNT(${argument}) AS ${alias}`;
  }
  if (!measure.column) {
    throw new Error(`${measure.aggregation} requires a source column.`);
  }
  const column = quoteIdentifier(measure.column);
  if (measure.aggregation === 'count_distinct') {
    return `COUNT(DISTINCT ${column}) AS ${alias}`;
  }
  return `${measure.aggregation.toUpperCase()}(${column}) AS ${alias}`;
}

function compileStepBody(step: WorkflowStep, inputRelation: string): string {
  switch (step.kind) {
    case 'filter':
      return `SELECT *\nFROM ${inputRelation}\nWHERE ${compileFilter(step)}`;
    case 'select':
      return `SELECT ${step.columns.map(quoteIdentifier).join(', ')}\nFROM ${inputRelation}`;
    case 'derive':
      return `SELECT *, (${step.expression}) AS ${quoteIdentifier(step.column)}\nFROM ${inputRelation}`;
    case 'join': {
      const rightColumns = step.rightColumns
        .map(({ column, alias }) => `${qualified('r', column)} AS ${quoteIdentifier(alias)}`)
        .join(', ');
      return [
        `SELECT ${quoteIdentifier('l')}.*, ${rightColumns}`,
        `FROM ${inputRelation} AS ${quoteIdentifier('l')}`,
        `${step.joinType.toUpperCase()} JOIN ${quoteIdentifier(step.rightTable)} AS ${quoteIdentifier('r')}`,
        `  ON ${qualified('l', step.leftColumn)} = ${qualified('r', step.rightColumn)}`,
      ].join('\n');
    }
    case 'group': {
      const dimensions = step.dimensions.map(quoteIdentifier);
      const selections = [...dimensions, ...step.measures.map(compileMeasure)];
      const lines = [`SELECT ${selections.join(', ')}`, `FROM ${inputRelation}`];
      if (dimensions.length > 0) {
        lines.push(`GROUP BY ${dimensions.join(', ')}`);
      }
      return lines.join('\n');
    }
    case 'sort':
      return [
        'SELECT *',
        `FROM ${inputRelation}`,
        `ORDER BY ${step.orders
          .map(({ column, direction }) => `${quoteIdentifier(column)} ${direction.toUpperCase()}`)
          .join(', ')}`,
      ].join('\n');
  }
}

function indent(value: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

function withClause(definitions: readonly CteDefinition[]): string {
  if (definitions.length === 0) {
    return '';
  }
  const ctes = definitions
    .map(({ name, body }) => `  ${quoteIdentifier(name)} AS (\n${indent(body, 4)}\n  )`)
    .join(',\n');
  return `WITH\n${ctes}\n`;
}

function selectQuery(definitions: readonly CteDefinition[], relation: string): string {
  return `${withClause(definitions)}SELECT * FROM ${relation};`;
}

function countQuery(definitions: readonly CteDefinition[], relation: string): string {
  return `${withClause(definitions)}SELECT COUNT(*) AS ${quoteIdentifier('row_count')} FROM ${relation};`;
}

export function compileWorkflow(input: Workflow): CompiledWorkflow {
  const workflow = WorkflowSchema.parse(input);
  const enabledSteps = workflow.steps.filter((step) => step.enabled);
  let relation = quoteIdentifier(workflow.sourceTable);
  let definitions: CteDefinition[] = [];
  const compiledSteps: CompiledStep[] = [];

  for (const [index, step] of enabledSteps.entries()) {
    const inputCountSql = countQuery(definitions, relation);
    const fragment = compileStepBody(step, relation);
    const cteName = `step_${index + 1}`;
    const outputRelation = quoteIdentifier(cteName);
    const nextDefinitions = [...definitions, { name: cteName, body: fragment }];

    compiledSteps.push({
      stepId: step.id,
      label: step.label,
      kind: step.kind,
      relation: outputRelation,
      fragment,
      sql: selectQuery(nextDefinitions, outputRelation),
      inputCountSql,
      outputCountSql: countQuery(nextDefinitions, outputRelation),
    });

    relation = outputRelation;
    definitions = nextDefinitions;
  }

  return {
    sql: selectQuery(definitions, relation),
    steps: compiledSteps,
    resultRelation: relation,
  };
}
