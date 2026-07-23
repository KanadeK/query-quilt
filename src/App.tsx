import { AppErrorBoundary } from './features/workbench/AppErrorBoundary';
import { Workbench } from './features/workbench/Workbench';

export function App() {
  return (
    <AppErrorBoundary>
      <Workbench />
    </AppErrorBoundary>
  );
}
