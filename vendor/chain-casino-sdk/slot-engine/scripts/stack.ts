// The local stack: simulator node + harness from the casino SDK, the Lucky Reels frontend and a
// one-shot title deployment. Works from the monorepo and from the standalone SDK download.
import { packageManager } from '@chain/casino-sdk/scripts/run-in.ts';
import concurrently from 'concurrently';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { SIMULATOR_DIR } from '../e2e/local-title.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const pm = packageManager(packageRoot);

const frontend = await createServer({
  root: resolve(packageRoot, 'example/frontend'),
  server: { strictPort: true },
});
await frontend.listen();
frontend.printUrls();

const { result } = concurrently(
  [
    { name: 'node', command: `${pm} run local-node`, cwd: SIMULATOR_DIR, prefixColor: 'yellow' },
    { name: 'simulator', command: `${pm} run dev`, cwd: SIMULATOR_DIR, prefixColor: 'cyan' },
    { name: 'title', command: 'tsx example/start.ts', cwd: packageRoot, prefixColor: 'green' },
  ],
  { killOthers: ['failure'] },
);

result.then(
  () => process.exit(0),
  () => process.exit(1),
);
