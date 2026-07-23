import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DuckDbEngine,
  getSampleWorkflow,
  readDatasetFile,
  registerSampleTables,
  SAMPLE_WORKFLOWS,
  WorkflowStore,
  type WorkflowExecution,
} from '../../adapters';
import {
  canRedo,
  canUndo,
  createHistory,
  parseWorkflow,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
  type Workflow,
} from '../../core';
import type { TableInfo } from './model';

export type EngineState = 'loading' | 'ready' | 'error';

export interface WorkbenchNotice {
  tone: 'info' | 'success' | 'error';
  message: string;
}

function cloneWorkflow(workflow: Workflow): Workflow {
  return structuredClone(workflow);
}

const INITIAL_WORKFLOW = cloneWorkflow(getSampleWorkflow('regional-category-sales'));

export function useWorkbench() {
  const engineRef = useRef<DuckDbEngine | null>(null);
  const storeRef = useRef<WorkflowStore | null>(null);
  const runSequence = useRef(0);
  const [engineState, setEngineState] = useState<EngineState>('loading');
  const [history, setHistory] = useState<History<Workflow>>(() => createHistory(INITIAL_WORKFLOW));
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [savedWorkflows, setSavedWorkflows] = useState<Workflow[]>([]);
  const [busyLabel, setBusyLabel] = useState('Starting local DuckDB');
  const [notice, setNotice] = useState<WorkbenchNotice>({
    tone: 'info',
    message: 'Preparing the local sample workspace.',
  });

  const readTables = useCallback(async (engine: DuckDbEngine) => {
    const names = await engine.listTables();
    return Promise.all(
      names.map(async (name) => ({
        name,
        columns: await engine.tableColumns(name),
      })),
    );
  }, []);

  const executeWith = useCallback(async (engine: DuckDbEngine, workflow: Workflow) => {
    const sequence = ++runSequence.current;
    setBusyLabel('Running workflow');
    setNotice({ tone: 'info', message: `Executing ${workflow.steps.length} reversible steps.` });
    setExecution(null);
    try {
      const nextExecution = await engine.execute(workflow);
      if (sequence !== runSequence.current) {
        return;
      }
      setExecution(nextExecution);
      setNotice({
        tone: 'success',
        message: `${nextExecution.rows.length.toLocaleString()} rows ready in ${nextExecution.durationMs.toFixed(0)} ms.`,
      });
    } catch (error) {
      if (sequence !== runSequence.current) {
        return;
      }
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The workflow could not be executed.',
      });
    } finally {
      if (sequence === runSequence.current) {
        setBusyLabel('');
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    const engine = new DuckDbEngine();
    const store = new WorkflowStore();
    engineRef.current = engine;
    storeRef.current = store;

    void (async () => {
      try {
        await engine.initialize();
        if (!active) {
          return;
        }
        await registerSampleTables(engine);
        if (!active) {
          return;
        }
        const [nextTables, stored] = await Promise.all([readTables(engine), store.list()]);
        if (!active) {
          return;
        }
        setTables(nextTables);
        setSavedWorkflows(stored);
        setEngineState('ready');
        await executeWith(engine, INITIAL_WORKFLOW);
      } catch (error) {
        if (!active) {
          return;
        }
        setEngineState('error');
        setBusyLabel('');
        setNotice({
          tone: 'error',
          message:
            error instanceof Error ? error.message : 'DuckDB-WASM could not start in this browser.',
        });
      }
    })();

    return () => {
      active = false;
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
      if (storeRef.current === store) {
        storeRef.current = null;
      }
      void engine.dispose();
      void store.close();
    };
  }, [executeWith, readTables]);

  const run = useCallback(
    async (workflow = history.present) => {
      const engine = engineRef.current;
      if (!engine || engineState !== 'ready') {
        setNotice({ tone: 'error', message: 'The local DuckDB engine is not ready yet.' });
        return;
      }
      await executeWith(engine, workflow);
    },
    [engineState, executeWith, history.present],
  );

  const commitWorkflow = useCallback(
    (candidate: unknown, message = 'Workflow updated.') => {
      try {
        const next = parseWorkflow(candidate);
        setHistory((current) => pushHistory(current, next));
        setNotice({ tone: 'info', message });
        const engine = engineRef.current;
        if (engine && engineState === 'ready') {
          void executeWith(engine, next);
        }
        return true;
      } catch (error) {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : 'The workflow update is invalid.',
        });
        return false;
      }
    },
    [engineState, executeWith],
  );

  const selectWorkflow = useCallback(
    (workflow: Workflow, message: string) => {
      const next = cloneWorkflow(workflow);
      setHistory(createHistory(next));
      const engine = engineRef.current;
      if (engine && engineState === 'ready') {
        void executeWith(engine, next);
      }
      setNotice({ tone: 'info', message });
    },
    [engineState, executeWith],
  );

  const undo = useCallback(() => {
    const next = undoHistory(history);
    if (next === history) {
      return;
    }
    setHistory(next);
    const engine = engineRef.current;
    if (engine && engineState === 'ready') {
      void executeWith(engine, next.present);
    }
  }, [engineState, executeWith, history]);

  const redo = useCallback(() => {
    const next = redoHistory(history);
    if (next === history) {
      return;
    }
    setHistory(next);
    const engine = engineRef.current;
    if (engine && engineState === 'ready') {
      void executeWith(engine, next.present);
    }
  }, [engineState, executeWith, history]);

  const importDataset = useCallback(
    async (file: File) => {
      const engine = engineRef.current;
      if (!engine || engineState !== 'ready') {
        setNotice({ tone: 'error', message: 'Wait for the local database before importing.' });
        return;
      }
      setBusyLabel(`Importing ${file.name}`);
      try {
        const dataset = await readDatasetFile(file);
        await engine.registerDataset(dataset);
        setTables(await readTables(engine));
        setNotice({
          tone: 'success',
          message: `${dataset.originalName} is available locally as ${dataset.tableName}.`,
        });
      } catch (error) {
        setNotice({
          tone: 'error',
          message: error instanceof Error ? error.message : `Unable to import ${file.name}.`,
        });
      } finally {
        setBusyLabel('');
      }
    },
    [engineState, readTables],
  );

  const importWorkflow = useCallback(
    async (file: File) => {
      try {
        const workflow = parseWorkflow(JSON.parse(await file.text()));
        selectWorkflow(workflow, `${file.name} loaded and validated.`);
      } catch (error) {
        setNotice({
          tone: 'error',
          message:
            error instanceof Error ? error.message : `${file.name} is not valid workflow JSON.`,
        });
      }
    },
    [selectWorkflow],
  );

  const save = useCallback(async () => {
    const store = storeRef.current;
    if (!store) {
      setNotice({ tone: 'error', message: 'Browser storage is not ready.' });
      return;
    }
    try {
      const saved = await store.save(history.present);
      setSavedWorkflows(await store.list());
      setNotice({ tone: 'success', message: `${saved.name} saved in this browser.` });
    } catch (error) {
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : 'The workflow could not be saved.',
      });
    }
  }, [history.present]);

  const loadSaved = useCallback(
    async (id: string) => {
      const store = storeRef.current;
      const workflow = await store?.get(id);
      if (!workflow) {
        setNotice({ tone: 'error', message: 'That saved workflow is no longer available.' });
        return;
      }
      selectWorkflow(workflow, `${workflow.name} restored from browser storage.`);
    },
    [selectWorkflow],
  );

  return {
    workflow: history.present,
    execution,
    tables,
    savedWorkflows,
    sampleWorkflows: SAMPLE_WORKFLOWS,
    engineState,
    busyLabel,
    notice,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    commitWorkflow,
    selectWorkflow,
    run,
    undo,
    redo,
    importDataset,
    importWorkflow,
    save,
    loadSaved,
    notify: setNotice,
  };
}
