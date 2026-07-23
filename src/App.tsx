import { APP_META } from './version';

export function App() {
  return (
    <main>
      <h1>{APP_META.name}</h1>
      <p>Local, reversible data workflows backed by DuckDB SQL.</p>
    </main>
  );
}
