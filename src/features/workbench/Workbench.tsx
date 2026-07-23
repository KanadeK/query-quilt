import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowUp,
  BracketsCurly,
  ChartBar,
  CheckCircle,
  Copy,
  Database,
  FileCsv,
  FileSql,
  FloppyDisk,
  GithubLogo,
  Image,
  LockKey,
  PencilSimple,
  Play,
  Plus,
  ShieldCheck,
  Trash,
  UploadSimple,
  WarningCircle,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rowsToCsv, serializeWorkflow } from '../../core/exports';
import { stableStringify } from '../../core/history';
import { compileWorkflow } from '../../core/sql';
import type { Workflow, WorkflowStep } from '../../core/workflow';
import { APP_META } from '../../version';
import { ChartView, type ChartViewHandle } from './ChartView';
import {
  availableColumns,
  createStep,
  displayCell,
  fileSlug,
  STEP_KIND_OPTIONS,
  type StepKind,
} from './model';
import { StepEditor } from './StepEditor';
import { useWorkbench } from './useWorkbench';

function downloadBlob(fileName: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(fileName: string, url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
}

function stamped(workflow: Workflow): Workflow {
  return { ...workflow, updatedAt: new Date().toISOString() };
}

function workflowSignature(workflow: Workflow): string {
  return stableStringify({
    id: workflow.id,
    name: workflow.name,
    sourceTable: workflow.sourceTable,
    steps: workflow.steps,
  });
}

export function Workbench() {
  const workbench = useWorkbench();
  const {
    workflow,
    execution,
    tables,
    sampleWorkflows,
    savedWorkflows,
    engineState,
    busyLabel,
    notice,
    notify,
  } = workbench;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    workflow.steps[0]?.id ?? null,
  );
  const [addKind, setAddKind] = useState<StepKind>('filter');
  const [resultView, setResultView] = useState<'table' | 'chart'>('table');
  const [pendingChartExport, setPendingChartExport] = useState(false);
  const chartRef = useRef<ChartViewHandle>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.matches('input, textarea, select') ||
        target?.isContentEditable ||
        !(event.ctrlKey || event.metaKey)
      ) {
        return;
      }
      if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        workbench.undo();
      } else if (
        event.key.toLowerCase() === 'y' ||
        (event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        workbench.redo();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [workbench]);

  const compiled = useMemo(() => compileWorkflow(workflow), [workflow]);
  const columns = useMemo(
    () => availableColumns(workflow, tables, execution),
    [execution, tables, workflow],
  );
  const selectedStep = workflow.steps.find((step) => step.id === selectedStepId) ?? null;
  const executionByStep = new Map(execution?.steps.map((step) => [step.stepId, step]) ?? []);
  const compiledByStep = new Map(compiled.steps.map((step) => [step.stepId, step]));
  const safeName = fileSlug(workflow.name);
  const selectedSampleId =
    sampleWorkflows.find((sample) => workflowSignature(sample) === workflowSignature(workflow))
      ?.id ?? '';

  const replaceSteps = (steps: WorkflowStep[], message: string, selectId?: string | null) => {
    if (
      workbench.commitWorkflow(stamped({ ...workflow, steps }), message) &&
      selectId !== undefined
    ) {
      setSelectedStepId(selectId);
    }
  };

  const updateStep = (nextStep: WorkflowStep) => {
    replaceSteps(
      workflow.steps.map((step) => (step.id === nextStep.id ? nextStep : step)),
      `${nextStep.label} updated.`,
      nextStep.id,
    );
  };

  const addStep = () => {
    const step = createStep(addKind, workflow, tables, columns);
    replaceSteps([...workflow.steps, step], `${step.label} added.`, step.id);
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= workflow.steps.length) {
      return;
    }
    const steps = [...workflow.steps];
    const [step] = steps.splice(index, 1);
    if (!step) {
      return;
    }
    steps.splice(destination, 0, step);
    replaceSteps(steps, `${step.label} moved.`, step.id);
  };

  const exportSql = () => downloadBlob(`${safeName}.sql`, compiled.sql, 'text/sql;charset=utf-8');
  const exportWorkflow = () =>
    downloadBlob(
      `${safeName}.workflow.json`,
      serializeWorkflow(workflow),
      'application/json;charset=utf-8',
    );
  const exportCsv = () => {
    if (!execution) {
      return;
    }
    downloadBlob(
      `${safeName}.results.csv`,
      rowsToCsv(
        execution.rows,
        execution.columns.map((column) => column.name),
      ),
      'text/csv;charset=utf-8',
    );
  };
  const downloadChart = useCallback(() => {
    const url = chartRef.current?.toPng();
    if (!url) {
      notify({
        tone: 'error',
        message: 'Open a numeric result chart before exporting an image.',
      });
      return;
    }
    downloadDataUrl(`${safeName}.chart.png`, url);
  }, [notify, safeName]);

  const exportChart = () => {
    if (resultView !== 'chart') {
      setPendingChartExport(true);
      setResultView('chart');
      return;
    }
    downloadChart();
  };

  useEffect(() => {
    if (!pendingChartExport || resultView !== 'chart') {
      return;
    }
    const frame = requestAnimationFrame(() => {
      downloadChart();
      setPendingChartExport(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [downloadChart, pendingChartExport, resultView]);

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(compiled.sql);
      workbench.notify({ tone: 'success', message: 'Equivalent SQL copied.' });
    } catch {
      workbench.notify({
        tone: 'error',
        message: 'Clipboard access was denied. Use Export SQL instead.',
      });
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            QQ
          </div>
          <div>
            <div className="brand-line">
              <span>{APP_META.name}</span>
              <span className="version-chip">v{APP_META.version}</span>
            </div>
            <p>Reversible local data workflows</p>
          </div>
        </div>

        <div className="topbar-status" aria-label="Runtime status">
          <span className={`status-dot ${engineState}`} aria-hidden="true" />
          <span>
            {engineState === 'ready'
              ? 'DuckDB local'
              : engineState === 'loading'
                ? 'Starting DuckDB'
                : 'DuckDB unavailable'}
          </span>
          <span className="privacy-chip">
            <LockKey aria-hidden="true" /> No upload
          </span>
        </div>

        <nav className="top-actions" aria-label="Project actions">
          <button
            className="icon-button"
            type="button"
            onClick={workbench.undo}
            disabled={!workbench.canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo workflow change"
          >
            <ArrowCounterClockwise aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={workbench.redo}
            disabled={!workbench.canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo workflow change"
          >
            <ArrowClockwise aria-hidden="true" />
          </button>
          <button className="button secondary" type="button" onClick={() => void workbench.save()}>
            <FloppyDisk aria-hidden="true" /> Save
          </button>
          <a
            className="icon-button"
            href="https://github.com/KanadeK/query-quilt"
            target="_blank"
            rel="noreferrer"
            aria-label="Open the Query Quilt GitHub repository"
            title="GitHub repository"
          >
            <GithubLogo aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main className="workbench">
        <section className="workflow-bar" aria-label="Workflow controls">
          <label className="field workflow-name">
            <span>Workflow name</span>
            <input
              key={`${workflow.id}:${workflow.name}`}
              defaultValue={workflow.name}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name !== workflow.name) {
                  workbench.commitWorkflow(stamped({ ...workflow, name }), 'Workflow renamed.');
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <label className="field">
            <span>Sample workflow</span>
            <select
              value={selectedSampleId}
              onChange={(event) => {
                const sample = sampleWorkflows.find(
                  (candidate) => candidate.id === event.target.value,
                );
                if (sample) {
                  setSelectedStepId(sample.steps[0]?.id ?? null);
                  workbench.selectWorkflow(sample, `${sample.name} sample loaded.`);
                }
              }}
            >
              <option value="">Custom workflow</option>
              {sampleWorkflows.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Saved in browser</span>
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) {
                  void workbench.loadSaved(event.target.value);
                }
              }}
            >
              <option value="">Choose saved workflow</option>
              {savedWorkflows.map((saved) => (
                <option key={saved.id} value={saved.id}>
                  {saved.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button run-button"
            type="button"
            onClick={() => void workbench.run()}
            disabled={engineState !== 'ready' || Boolean(busyLabel)}
          >
            <Play weight="fill" aria-hidden="true" />
            {busyLabel || 'Run workflow'}
          </button>
        </section>

        <div className="workbench-grid">
          <aside className="panel datasets-panel" aria-labelledby="datasets-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">01 / Sources</p>
                <h2 id="datasets-title">Local datasets</h2>
              </div>
              <Database aria-hidden="true" />
            </div>
            <p className="panel-note">
              CSV and Parquet stay in this tab. Refreshing clears imported tables.
            </p>
            <label className="button import-button">
              <UploadSimple aria-hidden="true" />
              Import dataset
              <input
                type="file"
                accept=".csv,.parquet,text/csv,application/vnd.apache.parquet"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void workbench.importDataset(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>
            <label className="text-button import-workflow">
              <BracketsCurly aria-hidden="true" />
              Import workflow JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void workbench.importWorkflow(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>

            <div className="table-list">
              {tables.map((table) => (
                <details key={table.name} open={table.name === workflow.sourceTable}>
                  <summary>
                    <span>
                      <Database aria-hidden="true" /> {table.name}
                    </span>
                    <span className="count-chip">{table.columns.length}</span>
                  </summary>
                  <div className="column-list">
                    {table.columns.map((column) => (
                      <div key={column.name}>
                        <code>{column.name}</code>
                        <span>{column.type}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-button source-button"
                    disabled={table.name === workflow.sourceTable}
                    onClick={() =>
                      workbench.commitWorkflow(
                        stamped({ ...workflow, sourceTable: table.name }),
                        `${table.name} set as the source table.`,
                      )
                    }
                  >
                    {table.name === workflow.sourceTable ? 'Current source' : 'Use as source'}
                  </button>
                </details>
              ))}
            </div>

            <div className="privacy-note">
              <ShieldCheck weight="fill" aria-hidden="true" />
              <div>
                <strong>Private by construction</strong>
                <span>No analytics, upload endpoint, or remote database.</span>
              </div>
            </div>
          </aside>

          <section className="panel steps-panel" aria-labelledby="steps-title">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">02 / Transform</p>
                <h2 id="steps-title">Reversible step chain</h2>
              </div>
              <span className="count-chip">{workflow.steps.length} steps</span>
            </div>

            <div className="add-step-row">
              <select
                aria-label="New step type"
                value={addKind}
                onChange={(event) => setAddKind(event.target.value as StepKind)}
              >
                {STEP_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button className="button secondary" type="button" onClick={addStep}>
                <Plus aria-hidden="true" /> Add step
              </button>
            </div>

            <ol className="step-list">
              {workflow.steps.map((step, index) => {
                const stepRun = executionByStep.get(step.id);
                const stepSql = compiledByStep.get(step.id);
                return (
                  <li
                    key={step.id}
                    className={`step-card ${selectedStepId === step.id ? 'selected' : ''} ${
                      step.enabled ? '' : 'disabled'
                    }`}
                  >
                    <button
                      type="button"
                      className="step-main"
                      onClick={() => setSelectedStepId(step.id)}
                      aria-label={`Edit ${step.label}`}
                    >
                      <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                      <span className="step-copy">
                        <span className="step-kind">{step.kind}</span>
                        <strong>{step.label}</strong>
                      </span>
                      <span className="row-flow">
                        {stepRun
                          ? `${stepRun.inputRows.toLocaleString()} → ${stepRun.outputRows.toLocaleString()}`
                          : step.enabled
                            ? 'not run'
                            : 'skipped'}
                      </span>
                    </button>
                    <div className="step-actions">
                      <label className="mini-toggle" title="Enable step">
                        <input
                          type="checkbox"
                          checked={step.enabled}
                          aria-label={`Enable ${step.label}`}
                          onChange={(event) =>
                            updateStep({ ...step, enabled: event.target.checked })
                          }
                        />
                        <span />
                      </label>
                      <button
                        type="button"
                        className="icon-button quiet"
                        onClick={() => moveStep(index, -1)}
                        disabled={index === 0}
                        aria-label={`Move ${step.label} up`}
                      >
                        <ArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button quiet"
                        onClick={() => moveStep(index, 1)}
                        disabled={index === workflow.steps.length - 1}
                        aria-label={`Move ${step.label} down`}
                      >
                        <ArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button quiet"
                        onClick={() => setSelectedStepId(step.id)}
                        aria-label={`Edit ${step.label}`}
                      >
                        <PencilSimple aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button quiet danger"
                        onClick={() =>
                          replaceSteps(
                            workflow.steps.filter((candidate) => candidate.id !== step.id),
                            `${step.label} removed.`,
                            workflow.steps[index + 1]?.id ?? workflow.steps[index - 1]?.id ?? null,
                          )
                        }
                        aria-label={`Delete ${step.label}`}
                      >
                        <Trash aria-hidden="true" />
                      </button>
                    </div>
                    <details className="step-sql">
                      <summary>Step SQL</summary>
                      <pre>
                        <code>
                          {stepSql?.fragment ??
                            'This disabled step is excluded from generated SQL.'}
                        </code>
                      </pre>
                    </details>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className="panel inspector-panel" aria-label="Step and SQL inspector">
            {selectedStep ? (
              <StepEditor
                key={`${workflow.updatedAt}:${selectedStep.id}`}
                step={selectedStep}
                columns={columns}
                tables={tables}
                onSave={updateStep}
                onCancel={() => setSelectedStepId(null)}
              />
            ) : (
              <div className="empty-inspector">
                <PencilSimple aria-hidden="true" />
                <h2>Select a step to edit it</h2>
                <p>Every applied edit enters the undo history and runs against local DuckDB.</p>
              </div>
            )}

            <details className="sql-inspector" open={!selectedStep}>
              <summary>
                <span>
                  <FileSql aria-hidden="true" /> Equivalent SQL
                </span>
                <button
                  type="button"
                  className="icon-button quiet"
                  onClick={(event) => {
                    event.preventDefault();
                    void copySql();
                  }}
                  aria-label="Copy equivalent SQL"
                >
                  <Copy aria-hidden="true" />
                </button>
              </summary>
              <pre>
                <code>{compiled.sql}</code>
              </pre>
            </details>
          </aside>
        </div>

        <section className="panel results-panel" aria-labelledby="results-title">
          <div className="results-header">
            <div>
              <p className="eyebrow">03 / Inspect and export</p>
              <h2 id="results-title">Query result</h2>
            </div>
            <div className="result-metrics">
              <span>
                <strong>{execution?.rows.length.toLocaleString() ?? '0'}</strong> rows
              </span>
              <span>
                <strong>{execution?.columns.length ?? 0}</strong> columns
              </span>
              <span title={execution?.resultHash ?? undefined}>
                hash <code>{execution?.resultHash.slice(0, 8) ?? 'pending'}</code>
              </span>
            </div>
            <div className="view-switch" role="group" aria-label="Result view">
              <button
                type="button"
                className={resultView === 'table' ? 'active' : ''}
                onClick={() => setResultView('table')}
              >
                <FileCsv aria-hidden="true" /> Table
              </button>
              <button
                type="button"
                className={resultView === 'chart' ? 'active' : ''}
                onClick={() => setResultView('chart')}
              >
                <ChartBar aria-hidden="true" /> Chart
              </button>
            </div>
            <div className="export-actions" aria-label="Export results">
              <button type="button" className="text-button" onClick={exportSql}>
                <FileSql aria-hidden="true" /> SQL
              </button>
              <button type="button" className="text-button" onClick={exportWorkflow}>
                <BracketsCurly aria-hidden="true" /> Workflow
              </button>
              <button
                type="button"
                className="text-button"
                onClick={exportCsv}
                disabled={!execution}
              >
                <FileCsv aria-hidden="true" /> CSV
              </button>
              <button
                type="button"
                className="text-button"
                onClick={exportChart}
                disabled={!execution}
              >
                <Image aria-hidden="true" /> PNG
              </button>
            </div>
          </div>

          <div className={resultView === 'table' ? 'result-view active' : 'result-view'}>
            {execution ? (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {execution.columns.map((column) => (
                          <th key={column.name} scope="col">
                            <span>{column.name}</span>
                            <small>{column.type}</small>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {execution.rows.slice(0, 250).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {execution.columns.map((column) => (
                            <td key={column.name}>{displayCell(row[column.name])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {execution.rows.length > 250 && (
                  <p className="truncation-note">
                    Showing the first 250 rows. CSV export includes all{' '}
                    {execution.rows.length.toLocaleString()} rows.
                  </p>
                )}
              </>
            ) : (
              <div className="empty-result">
                <Database aria-hidden="true" />
                <span>Run the current workflow to inspect its rows.</span>
              </div>
            )}
          </div>
          <div className={resultView === 'chart' ? 'result-view active' : 'result-view'}>
            {resultView === 'chart' && <ChartView ref={chartRef} execution={execution} />}
          </div>
        </section>
      </main>

      <footer className={`statusbar ${notice.tone}`} aria-live="polite">
        <span>
          {notice.tone === 'error' ? (
            <WarningCircle weight="fill" aria-hidden="true" />
          ) : (
            <CheckCircle weight="fill" aria-hidden="true" />
          )}
          {notice.message}
        </span>
        <span className="runtime-note">DuckDB-WASM · IndexedDB · offline-ready</span>
      </footer>
    </div>
  );
}
