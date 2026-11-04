// Playwright web server: builds the e2e and production bundles one after the other (parallel
// Vite builds can crash on Windows), then serves both: e2e on 4173, production on 4174.
import { spawn, spawnSync } from 'node:child_process';

const run = (cmd: string) => {
  const r = spawnSync(cmd, { shell: true, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npx vite build --mode e2e --outDir dist-e2e');
run('npx vite build --outDir dist-prodcheck');
const servers = [
  spawn('npx vite preview --outDir dist-prodcheck --port 4174 --strictPort', {
    shell: true,
    stdio: 'inherit',
  }),
  spawn('npx vite preview --outDir dist-e2e --port 4173 --strictPort', {
    shell: true,
    stdio: 'inherit',
  }),
];
// Kill each preview's whole process tree (on Windows `kill()` only ends the shell wrapper and
// leaves the Vite server holding the port).
const stop = () => {
  for (const s of servers) {
    if (process.platform === 'win32' && s.pid)
      spawnSync('taskkill', ['/pid', String(s.pid), '/T', '/F']);
    else s.kill();
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', () => {
  if (process.platform === 'win32')
    for (const s of servers) if (s.pid) spawnSync('taskkill', ['/pid', String(s.pid), '/T', '/F']);
});
