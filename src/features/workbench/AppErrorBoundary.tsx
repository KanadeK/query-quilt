import { WarningCircle } from '@phosphor-icons/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Query Quilt interface failure', error, info.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="fatal-error" role="alert">
        <WarningCircle weight="fill" aria-hidden="true" />
        <p className="eyebrow">Local interface error</p>
        <h1>The workbench stopped safely</h1>
        <p>{this.state.error.message}</p>
        <button className="button" type="button" onClick={() => window.location.reload()}>
          Reload local workspace
        </button>
      </main>
    );
  }
}
