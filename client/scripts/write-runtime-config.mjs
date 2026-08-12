import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicConfigPath = path.join(rootDir, 'public', 'runtime-config.js');
const distConfigPath = path.join(rootDir, 'dist', 'runtime-config.js');

const apiBaseUrl = process.env.RUNTIME_API_BASE_URL || process.env.VITE_API_BASE_URL || '/api';
const socketUrl =
  process.env.RUNTIME_SOCKET_URL ||
  process.env.VITE_SOCKET_URL ||
  deriveSocketUrl(apiBaseUrl);
const socketPath =
  process.env.RUNTIME_SOCKET_PATH ||
  process.env.VITE_SOCKET_PATH ||
  '/socket.io';

const fileContent = `window.__ZAEM_RUNTIME_CONFIG__ = {
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)},
  socketUrl: ${JSON.stringify(socketUrl)},
  socketPath: ${JSON.stringify(socketPath)},
};
`;

fs.writeFileSync(publicConfigPath, fileContent, 'utf8');

if (fs.existsSync(path.join(rootDir, 'dist'))) {
  fs.writeFileSync(distConfigPath, fileContent, 'utf8');
}

console.log(`Runtime config written: api=${apiBaseUrl}, socket=${socketUrl}, path=${socketPath}`);

function deriveSocketUrl(apiUrl) {
  try {
    const parsed = new URL(apiUrl);
    return parsed.origin;
  } catch {
    return '/';
  }
}
