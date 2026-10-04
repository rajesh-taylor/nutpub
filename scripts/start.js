// One command starts everything: the test mint, the web server and (if TUNNEL is set) the Cloudflare tunnel.
// Each one is restarted if it dies; Ctrl-C stops them all. Logs go to data/logs/ and to this terminal.
//   npm start
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createWriteStream } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(`${ROOT}.env`)) process.loadEnvFile(`${ROOT}.env`);

const env = process.env;
const PORT = Number(env.PORT || 8787);
const MINT_PORT = Number(env.MINT_PORT || 3340);
const DATA = `${ROOT}data`;
const MINT_DIR = `${DATA}/mint`;
const LOGS = `${DATA}/logs`;
mkdirSync(LOGS, { recursive: true });
// With a tunnel, the mint's public URL is its hostname on the tunnel.
if (env.TUNNEL && env.MINT_HOST && !env.MINT_URL) env.MINT_URL = `https://${env.MINT_HOST}`;
const MINT_URL = (env.MINT_URL || `http://127.0.0.1:${MINT_PORT}`).replace(/\/+$/, '');

const say = (msg) => console.log(`${new Date().toTimeString().slice(0, 8)} [start] ${msg}`);
const fail = (msg) => { console.error(`[start] ${msg}`); process.exit(1); };

// Nothing else may hold our ports, and no other connector may run this tunnel
// (two connectors on one tunnel share the traffic between them: half the requests would go astray).
const listening = (port) => {
  try { return execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).toString().trim(); } catch { return ''; }
};
for (const port of [PORT, MINT_PORT]) {
  const pid = listening(port);
  if (pid) fail(`port ${port} is already in use (pid ${pid}). Is the NutPub already running?`);
}
if (env.TUNNEL) {
  let others = '';
  try { others = execFileSync('pgrep', ['-fl', `cloudflared.* ${env.TUNNEL}$`]).toString().trim(); } catch {}
  if (others) fail(`another cloudflared is running the "${env.TUNNEL}" tunnel:\n${others}\nStop it first (kill <pid>).`);
}

// ---- The test mint: set it up on the first start, then keep its stored config in step with mint/config.toml.
function mintConfig() {
  mkdirSync(MINT_DIR, { recursive: true });
  if (!existsSync(`${MINT_DIR}/seed.hex`)) {
    writeFileSync(`${MINT_DIR}/seed.hex`, randomBytes(64).toString('hex'), { mode: 0o600 });
  }
  const toml = readFileSync(`${ROOT}mint/config.toml`, 'utf8')
    .replaceAll('{{MINT_URL}}', MINT_URL)
    .replaceAll('{{MINT_PORT}}', String(MINT_PORT))
    .replaceAll('{{MINT_DIR}}', MINT_DIR);
  writeFileSync(`${MINT_DIR}/config.toml`, toml);
  const fresh = !existsSync(`${MINT_DIR}/cdk-mintd.sqlite`);
  const args = fresh
    ? ['-w', MINT_DIR, 'config', 'init', '--new-mint', '--file', `${MINT_DIR}/config.toml`]
    : ['-w', MINT_DIR, 'config', 'apply', '--file', `${MINT_DIR}/config.toml`];
  execFileSync('cdk-mintd', args, { stdio: 'ignore' });
  if (fresh) say(`new test mint set up in data/mint (${MINT_URL})`);
}

// ---- The tunnel: one named tunnel, two hostnames (the site and the mint).
function tunnelConfig() {
  const file = `${DATA}/cloudflared.yml`;
  writeFileSync(file, [
    `tunnel: ${env.TUNNEL}`,
    'ingress:',
    `  - hostname: ${env.SITE_HOST}`,
    `    service: http://127.0.0.1:${PORT}`,
    `  - hostname: ${env.MINT_HOST}`,
    `    service: http://127.0.0.1:${MINT_PORT}`,
    '  - service: http_status:404',
    '',
  ].join('\n'));
  return file;
}

// ---- Run a child, log it, restart it if it dies (unless we're stopping).
const children = new Set();
let stopping = false;
function run(name, cmd, args, { echo = true } = {}) {
  const log = createWriteStream(`${LOGS}/${name}.log`, { flags: 'a' });
  let restarts = 0;
  const start = () => {
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    const out = (buf) => {
      log.write(buf);
      if (echo) for (const line of buf.toString().split('\n')) if (line) console.log(`[${name}] ${line}`);
    };
    child.stdout.on('data', out);
    child.stderr.on('data', out);
    child.on('exit', (code, signal) => {
      children.delete(child);
      if (stopping) return;
      restarts += 1;
      const wait = Math.min(1000 * restarts, 10_000);
      say(`${name} stopped (${signal || code}); restarting in ${wait / 1000} s`);
      setTimeout(start, wait);
    });
  };
  start();
}

async function waitFor(url, what, seconds = 30) {
  for (let i = 0; i < seconds * 2; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${what} did not answer at ${url} within ${seconds} s (see data/logs/)`);
}

function stop() {
  if (stopping) return;
  stopping = true;
  say('stopping…');
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

mintConfig();
run('mint', 'cdk-mintd', ['-w', MINT_DIR], { echo: false });
await waitFor(`http://127.0.0.1:${MINT_PORT}/v1/info`, 'the test mint');
say(`test mint up on :${MINT_PORT} (log: data/logs/mint.log)`);

run('server', process.execPath, ['server/index.js']);
await waitFor(`http://127.0.0.1:${PORT}/api/health`, 'the server');

if (env.TUNNEL) {
  run('tunnel', 'cloudflared', ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--config', tunnelConfig(), 'run', env.TUNNEL],
    { echo: false });
  say(`tunnel "${env.TUNNEL}": https://${env.SITE_HOST} and https://${env.MINT_HOST} (log: data/logs/tunnel.log)`);
}
say(`ready: http://localhost:${PORT}${env.TUNNEL ? `  ·  https://${env.SITE_HOST}` : ''}  ·  Ctrl-C stops everything`);
