import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDistributionRoot = path.join(repositoryRoot, 'dist');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webmanifest', 'application/manifest+json'],
]);

function validatePort(port) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Static server port must be an integer between 0 and 65535.');
  }
}

function resolveRequestPath(requestUrl, distributionRoot, fallbackPath) {
  const pathname = decodeURIComponent(new URL(requestUrl, 'http://127.0.0.1').pathname);
  const relative = pathname.replace(/^\/+/, '');
  const requested = path.resolve(distributionRoot, relative);
  if (requested !== distributionRoot && !requested.startsWith(`${distributionRoot}${path.sep}`)) {
    return null;
  }
  if (existsSync(requested)) {
    if (statSync(requested).isFile()) {
      return requested;
    }
    const directoryIndex = path.join(requested, 'index.html');
    if (existsSync(directoryIndex) && statSync(directoryIndex).isFile()) {
      return directoryIndex;
    }
  }
  return fallbackPath;
}

export async function startStaticServer(root, port = 4180, fallback = 'index.html') {
  validatePort(port);
  const distributionRoot = path.resolve(root);
  const fallbackPath = path.resolve(distributionRoot, fallback);
  if (
    (fallbackPath !== distributionRoot &&
      !fallbackPath.startsWith(`${distributionRoot}${path.sep}`)) ||
    !existsSync(fallbackPath) ||
    !statSync(fallbackPath).isFile()
  ) {
    throw new Error(`${distributionRoot} does not contain the fallback ${fallback}.`);
  }

  const server = createServer((request, response) => {
    const filePath = resolveRequestPath(request.url ?? '/', distributionRoot, fallbackPath);
    if (!filePath) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Invalid path.');
      return;
    }

    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type':
        contentTypes.get(path.extname(filePath).toLowerCase()) ?? 'application/octet-stream',
    });
    createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return server;
}

export async function startDistributionServer(port = 4180) {
  if (!existsSync(path.join(defaultDistributionRoot, 'index.html'))) {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  }
  return startStaticServer(defaultDistributionRoot, port);
}

export async function stopDistributionServer(server) {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPath === fileURLToPath(import.meta.url)) {
  const portArgument = process.argv.indexOf('--port');
  const port = Number(portArgument >= 0 ? process.argv[portArgument + 1] : 4180);
  const server = await startDistributionServer(port);
  console.log(`Query Quilt test server listening at http://127.0.0.1:${port}`);

  const stop = () => {
    void stopDistributionServer(server);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
