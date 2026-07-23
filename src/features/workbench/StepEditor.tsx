import { Plus, Trash, X } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import type { WorkflowStep } from '../../core';
import type { TableInfo } from './model';

interface StepEditorProps {
  step: WorkflowStep;
  columns: readonly string[];
  tables: readonly TableInfo[];
  onSave: (step: WorkflowStep) => void;
  onCancel: () => void;
}

function optionValues(values: readonly string[], current?: string) {
  return current && !values.includes(current) ? [current, ...values] : values;
}

function splitColumns(value: string): string[] {
  return value.split(',').map((item) => item.trim());
}

export function StepEditor({ step, columns, tables, onSave, onCancel }: StepEditorProps) {
  const [draft, setDraft] = useState<WorkflowStep>(() => structuredClone(step));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave(draft);
  };

  return (
    <form className="step-editor" onSubmit={submit}>
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">Step editor</p>
          <h2>{draft.label}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Close editor">
          <X aria-hidden="true" />
        </button>
      </div>

      <label className="field">
        <span>Label</span>
        <input
          value={draft.label}
          maxLength={120}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
        />
      </label>

      {draft.kind === 'filter' && (
        <>
          <label className="field">
            <span>Column</span>
            <select
              value={draft.column}
              onChange={(event) => setDraft({ ...draft, column: event.target.value })}
            >
              {optionValues(columns, draft.column).map((column) => (
                <option key={column}>{column}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Operator</span>
            <select
              value={draft.operator}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  operator: event.target.value as typeof draft.operator,
                })
              }
            >
              <option value="=">equals</option>
              <option value="!=">does not equal</option>
              <option value=">">greater than</option>
              <option value=">=">at least</option>
              <option value="<">less than</option>
              <option value="<=">at most</option>
              <option value="contains">contains</option>
              <option value="starts_with">starts with</option>
              <option value="is_null">is null</option>
              <option value="is_not_null">is not null</option>
            </select>
          </label>
          {!['is_null', 'is_not_null'].includes(draft.operator) && (
            <div className="field-grid">
              <label className="field">
                <span>Value type</span>
                <select
                  value={
                    typeof draft.value === 'number'
                      ? 'number'
                      : typeof draft.value === 'boolean'
                        ? 'boolean'
                        : 'text'
                  }
                  onChange={(event) => {
                    const type = event.target.value;
                    setDraft({
                      ...draft,
                      value: type === 'number' ? 0 : type === 'boolean' ? true : '',
                    });
                  }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                </select>
              </label>
              <label className="field">
                <span>Value</span>
                {typeof draft.value === 'boolean' ? (
                  <select
                    value={String(draft.value)}
                    onChange={(event) =>
                      setDraft({ ...draft, value: event.target.value === 'true' })
                    }
                  >
                    <option value="true">True</option>
                    <option value="false">False</option>
                  </select>
                ) : (
                  <input
                    type={typeof draft.value === 'number' ? 'number' : 'text'}
                    value={draft.value === undefined || draft.value === null ? '' : draft.value}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        value:
                          typeof draft.value === 'number'
                            ? event.target.valueAsNumber
                            : event.target.value,
                      })
                    }
                  />
                )}
              </label>
            </div>
          )}
        </>
      )}

      {draft.kind === 'select' && (
        <label className="field">
          <span>Columns, comma separated</span>
          <textarea
            rows={4}
            value={draft.columns.join(', ')}
            onChange={(event) => setDraft({ ...draft, columns: splitColumns(event.target.value) })}
          />
        </label>
      )}

      {draft.kind === 'derive' && (
        <>
          <label className="field">
            <span>New column</span>
            <input
              value={draft.column}
              onChange={(event) => setDraft({ ...draft, column: event.target.value })}
            />
          </label>
          <label className="field">
            <span>SQL expression</span>
            <textarea
              className="code-input"
              rows={5}
              value={draft.expression}
              onChange={(event) => setDraft({ ...draft, expression: event.target.value })}
            />
          </label>
          <p className="field-help">
            One expression only. Statements, comments, subqueries, and DuckDB extensions are
            blocked.
          </p>
        </>
      )}

      {draft.kind === 'group' && (
        <>
          <label className="field">
            <span>Dimensions, comma separated</span>
            <input
              value={draft.dimensions.join(', ')}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  dimensions: event.target.value.trim() ? splitColumns(event.target.value) : [],
                })
              }
            />
          </label>
          <div className="repeater-heading">
            <span>Measures</span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setDraft({
                  ...draft,
                  measures: [
                    ...draft.measures,
                    { aggregation: 'count', alias: `measure_${draft.measures.length + 1}` },
                  ],
                })
              }
            >
              <Plus aria-hidden="true" /> Add
            </button>
          </div>
          {draft.measures.map((measure, index) => (
            <div className="repeater-row" key={`measure-${index}`}>
              <select
                aria-label={`Measure ${index + 1} aggregation`}
                value={measure.aggregation}
                onChange={(event) => {
                  const measures = [...draft.measures];
                  measures[index] = {
                    ...measure,
                    aggregation: event.target.value as typeof measure.aggregation,
                  };
                  setDraft({ ...draft, measures });
                }}
              >
                <option value="count">Count</option>
                <option value="count_distinct">Count distinct</option>
                <option value="sum">Sum</option>
                <option value="avg">Average</option>
                <option value="min">Minimum</option>
                <option value="max">Maximum</option>
              </select>
              <select
                aria-label={`Measure ${index + 1} source column`}
                value={measure.column ?? ''}
                onChange={(event) => {
                  const measures = [...draft.measures];
                  measures[index] = {
                    ...measure,
                    column: event.target.value || undefined,
                  };
                  setDraft({ ...draft, measures });
                }}
              >
                <option value="">All rows</option>
                {optionValues(columns, measure.column).map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
              <input
                aria-label={`Measure ${index + 1} alias`}
                value={measure.alias}
                onChange={(event) => {
                  const measures = [...draft.measures];
                  measures[index] = { ...measure, alias: event.target.value };
                  setDraft({ ...draft, measures });
                }}
              />
              <button
                type="button"
                className="icon-button quiet"
                onClick={() =>
                  setDraft({
                    ...draft,
                    measures: draft.measures.filter((_, measureIndex) => measureIndex !== index),
                  })
                }
                aria-label={`Remove measure ${index + 1}`}
              >
                <Trash aria-hidden="true" />
              </button>
            </div>
          ))}
        </>
      )}

      {draft.kind === 'join' && (
        <>
          <div className="field-grid">
            <label className="field">
              <span>Join type</span>
              <select
                value={draft.joinType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    joinType: event.target.value as typeof draft.joinType,
                  })
                }
              >
                <option value="left">Left</option>
                <option value="inner">Inner</option>
              </select>
            </label>
            <label className="field">
              <span>Right table</span>
              <select
                value={draft.rightTable}
                onChange={(event) => setDraft({ ...draft, rightTable: event.target.value })}
              >
                {optionValues(
                  tables.map((table) => table.name),
                  draft.rightTable,
                ).map((table) => (
                  <option key={table}>{table}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-grid">
            <label className="field">
              <span>Left key</span>
              <select
                value={draft.leftColumn}
                onChange={(event) => setDraft({ ...draft, leftColumn: event.target.value })}
              >
                {optionValues(columns, draft.leftColumn).map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Right key</span>
              <select
                value={draft.rightColumn}
                onChange={(event) => setDraft({ ...draft, rightColumn: event.target.value })}
              >
                {optionValues(
                  tables
                    .find((table) => table.name === draft.rightTable)
                    ?.columns.map((column) => column.name) ?? [],
                  draft.rightColumn,
                ).map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="repeater-heading">
            <span>Columns to append</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const column =
                  tables.find((table) => table.name === draft.rightTable)?.columns[0]?.name ??
                  draft.rightColumn;
                setDraft({
                  ...draft,
                  rightColumns: [
                    ...draft.rightColumns,
                    { column, alias: `${column}_${draft.rightColumns.length + 1}` },
                  ],
                });
              }}
            >
              <Plus aria-hidden="true" /> Add
            </button>
          </div>
          {draft.rightColumns.map((rightColumn, index) => (
            <div className="repeater-row compact-columns" key={`joined-column-${index}`}>
              <select
                aria-label={`Joined column ${index + 1}`}
                value={rightColumn.column}
                onChange={(event) => {
                  const rightColumns = [...draft.rightColumns];
                  rightColumns[index] = { ...rightColumn, column: event.target.value };
                  setDraft({ ...draft, rightColumns });
                }}
              >
                {optionValues(
                  tables
                    .find((table) => table.name === draft.rightTable)
                    ?.columns.map((column) => column.name) ?? [],
                  rightColumn.column,
                ).map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
              <input
                aria-label={`Joined column ${index + 1} alias`}
                value={rightColumn.alias}
                onChange={(event) => {
                  const rightColumns = [...draft.rightColumns];
                  rightColumns[index] = { ...rightColumn, alias: event.target.value };
                  setDraft({ ...draft, rightColumns });
                }}
              />
              <button
                type="button"
                className="icon-button quiet"
                onClick={() =>
                  setDraft({
                    ...draft,
                    rightColumns: draft.rightColumns.filter(
                      (_, columnIndex) => columnIndex !== index,
                    ),
                  })
                }
                aria-label={`Remove joined column ${index + 1}`}
              >
                <Trash aria-hidden="true" />
              </button>
            </div>
          ))}
        </>
      )}

      {draft.kind === 'sort' && (
        <>
          <div className="repeater-heading">
            <span>Sort order</span>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setDraft({
                  ...draft,
                  orders: [...draft.orders, { column: columns[0] ?? 'column_1', direction: 'asc' }],
                })
              }
            >
              <Plus aria-hidden="true" /> Add
            </button>
          </div>
          {draft.orders.map((order, index) => (
            <div className="repeater-row compact-columns" key={`sort-${index}`}>
              <select
                aria-label={`Sort ${index + 1} column`}
                value={order.column}
                onChange={(event) => {
                  const orders = [...draft.orders];
                  orders[index] = { ...order, column: event.target.value };
                  setDraft({ ...draft, orders });
                }}
              >
                {optionValues(columns, order.column).map((column) => (
                  <option key={column}>{column}</option>
                ))}
              </select>
              <select
                aria-label={`Sort ${index + 1} direction`}
                value={order.direction}
                onChange={(event) => {
                  const orders = [...draft.orders];
                  orders[index] = {
                    ...order,
                    direction: event.target.value as typeof order.direction,
                  };
                  setDraft({ ...draft, orders });
                }}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
              <button
                type="button"
                className="icon-button quiet"
                onClick={() =>
                  setDraft({
                    ...draft,
                    orders: draft.orders.filter((_, orderIndex) => orderIndex !== index),
                  })
                }
                aria-label={`Remove sort ${index + 1}`}
              >
                <Trash aria-hidden="true" />
              </button>
            </div>
          ))}
        </>
      )}

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
        <span>Include this step when the workflow runs</span>
      </label>

      <div className="editor-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button primary">
          Apply step
        </button>
      </div>
    </form>
  );
}
