import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCallback);

const host = '127.0.0.1';
const port = Number(process.env.RUNNER_PORT || 5174);
// Only the local app (dev server, preview server) may call the runner.
const allowedOrigins = new Set(['5173', '4173'].flatMap((appPort) => [`http://127.0.0.1:${appPort}`, `http://localhost:${appPort}`]));
const preferred = (process.env.RUNNER_ENGINE || 'auto').toLowerCase(); // auto | docker | host
const goCacheDir = path.join(os.tmpdir(), 'backend-atlas-go-cache');
const MAX_CASES = 12;
const OUTPUT_LIMIT = 8000;
let running = false;

function reply(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
  });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxBytes = 96_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    request.on('data', (chunk) => { size += chunk.length; if (size > maxBytes) { reject(new Error('Request is too large.')); request.destroy(); } else chunks.push(chunk); });
    request.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Request must contain valid JSON.')); } });
    request.on('error', reject);
  });
}

// ---- Engine detection -------------------------------------------------------
async function dockerInfo() {
  try { const { stdout } = await execFile('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 3000 }); return { available: true, version: stdout.trim() }; }
  catch { return { available: false }; }
}
async function hostGoInfo() {
  try { const { stdout } = await execFile('go', ['version'], { timeout: 4000 }); return { available: true, version: stdout.trim().replace(/^go version /, '') }; }
  catch { return { available: false }; }
}
async function detectEngine() {
  const [docker, hostGo] = await Promise.all([preferred === 'host' ? { available: false } : dockerInfo(), preferred === 'docker' ? { available: false } : hostGoInfo()]);
  if (docker.available && preferred !== 'host') return { engine: 'docker', label: 'Docker isolated Go', version: docker.version, isolated: true };
  if (hostGo.available) return { engine: 'host', label: 'Local Go toolchain', version: hostGo.version, isolated: false };
  return { engine: null, reason: 'Neither Go nor Docker was found. Install Go (https://go.dev/dl) and restart the runner, or start Docker Desktop.' };
}

// ---- Process helper ---------------------------------------------------------
function spawnCapture(command, args, { cwd, input = '', env, timeoutMs = 15_000, onSpawnError }) {
  return new Promise((resolve) => {
    let stdout = ''; let stderr = ''; let finished = false; let timedOut = false; let child; let timer;
    const done = (result) => { if (finished) return; finished = true; clearTimeout(timer); resolve(result); };
    try { child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch (error) { done({ error: onSpawnError ? onSpawnError(error) : error.message }); return; }
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); done({ error: `Execution timed out after ${Math.round(timeoutMs / 1000)} seconds.` }); }, timeoutMs);
    child.stdout.on('data', (chunk) => { if (stdout.length < OUTPUT_LIMIT) stdout += chunk.toString('utf8').slice(0, OUTPUT_LIMIT - stdout.length); });
    child.stderr.on('data', (chunk) => { if (stderr.length < OUTPUT_LIMIT) stderr += chunk.toString('utf8').slice(0, OUTPUT_LIMIT - stderr.length); });
    child.on('error', (error) => done({ error: onSpawnError ? onSpawnError(error) : error.message }));
    child.on('close', (code, signal) => { if (!timedOut) done({ stdout, stderr, exitCode: code, signal }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

// ---- Docker engine (isolated container per case) ----------------------------
function runCaseDocker(directory, input, caseNumber) {
  const cidFile = path.join(directory, `container-${caseNumber}.cid`);
  const args = [
    'run', '--rm', '-i', '--network', 'none', '--memory=256m', '--memory-swap=256m', '--cpus=0.75', '--pids-limit=64',
    '--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=64m', '--cap-drop=ALL', '--security-opt', 'no-new-privileges',
    '--cidfile', cidFile, '--user=65534:65534', '--workdir=/workspace', '--mount', `type=bind,src=${directory},dst=/workspace,readonly`,
    '--env', 'HOME=/tmp', '--env', 'GOCACHE=/tmp/go-cache', '--env', 'GOMODCACHE=/tmp/go-mod-cache', '--env', 'GOTOOLCHAIN=local', '--env', 'GOPROXY=off',
    'golang:1.24-alpine', 'go', 'run', '/workspace/main.go',
  ];
  return spawnCapture('docker', args, {
    input, timeoutMs: 25_000,
    onSpawnError: (error) => error.code === 'ENOENT' ? 'Docker was not found. Install Docker Desktop or Go, then restart the runner.' : `Could not start Docker: ${error.message}`,
  }).then(async (result) => {
    if (result.error?.includes('timed out')) {
      readFile(cidFile, 'utf8').then((id) => { const clean = id.trim(); if (/^[a-f0-9]{12,64}$/i.test(clean)) return execFile('docker', ['kill', clean], { timeout: 3000 }); }).catch(() => {});
    }
    return result;
  });
}

// ---- Host Go engine (compile once, run the binary per case) -----------------
const hostEnv = () => ({ ...process.env, GOCACHE: goCacheDir, GOTOOLCHAIN: 'local', GOPROXY: 'off', GOFLAGS: '-buildvcs=false', CGO_ENABLED: '0', GO111MODULE: 'off' });
async function buildHost(directory) {
  const binary = path.join(directory, process.platform === 'win32' ? 'prog.exe' : 'prog');
  const result = await spawnCapture('go', ['build', '-o', binary, 'main.go'], { cwd: directory, env: hostEnv(), timeoutMs: 60_000, onSpawnError: (error) => error.code === 'ENOENT' ? 'Go was not found on this machine.' : error.message });
  if (result.error) return { error: result.error };
  if (result.exitCode !== 0) return { compileError: result.stderr || result.stdout || 'The program did not compile.' };
  return { binary };
}
function runCaseHost(binary, directory, input) {
  return spawnCapture(binary, [], { cwd: directory, input, env: { PATH: process.env.PATH, HOME: directory, TMPDIR: directory }, timeoutMs: 10_000 });
}

// ---- HTTP -------------------------------------------------------------------
const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (request.method === 'OPTIONS') {
    if (!allowedOrigins.has(origin)) return reply(response, 403, { error: 'Origin is not allowed.' });
    response.writeHead(204, { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
    return response.end();
  }
  if (request.url === '/api/health' && request.method === 'GET') {
    const info = await detectEngine();
    return reply(response, 200, info.engine ? { available: true, engine: info.engine, runner: info.label, version: info.version, isolated: info.isolated } : { available: false, reason: info.reason }, origin);
  }
  if (request.url !== '/api/run/go' || request.method !== 'POST') return reply(response, 404, { error: 'Not found.' }, origin);
  if (!allowedOrigins.has(origin)) return reply(response, 403, { error: 'Open Backend Atlas on localhost to use the local runner.' });
  if (running) return reply(response, 429, { error: 'The local runner is busy. Try again shortly.' }, origin);
  const info = await detectEngine();
  if (!info.engine) return reply(response, 503, { error: info.reason }, origin);
  let body;
  try { body = await readJson(request); } catch (error) { return reply(response, 400, { error: error.message }, origin); }
  if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > 48_000) return reply(response, 400, { error: 'Go source is required and must be under 48 KB.' }, origin);
  const cases = Array.isArray(body.testCases) ? body.testCases : [];
  if (cases.length < 1 || cases.length > MAX_CASES) return reply(response, 400, { error: `Provide between 1 and ${MAX_CASES} runs.` }, origin);
  // `expected: null` means "just run it with this input" (no pass/fail).
  if (cases.some((item) => typeof item.input !== 'string' || (item.expected !== null && typeof item.expected !== 'string') || item.input.length > 20_000 || (item.expected || '').length > 20_000)) return reply(response, 400, { error: 'Each case needs an input and an expected output (or null) under 20 KB.' }, origin);
  running = true;
  let directory;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'backend-atlas-go-'));
    await writeFile(path.join(directory, 'main.go'), body.code, { encoding: 'utf8', mode: 0o444 });
    await chmod(directory, 0o755);
    let binary = null;
    if (info.engine === 'host') {
      await mkdir(goCacheDir, { recursive: true });
      const built = await buildHost(directory);
      if (built.error) return reply(response, 200, { engine: info.engine, results: cases.map(() => ({ error: built.error })) }, origin);
      if (built.compileError) return reply(response, 200, { engine: info.engine, compileError: built.compileError, results: cases.map(() => ({ stderr: built.compileError, exitCode: 2, compileError: true, actual: '', passed: false })) }, origin);
      binary = built.binary;
    }
    const results = [];
    for (const testCase of cases) {
      const result = info.engine === 'docker' ? await runCaseDocker(directory, testCase.input, results.length) : await runCaseHost(binary, directory, testCase.input);
      const actual = (result.stdout || '').trimEnd();
      const ok = !result.error && result.exitCode === 0;
      results.push({ ...result, actual, passed: testCase.expected === null ? null : ok && actual === testCase.expected.trimEnd() });
      if (result.error?.startsWith('Docker was not found')) break;
    }
    reply(response, 200, { engine: info.engine, results }, origin);
  } catch (error) {
    reply(response, 500, { error: `Runner error: ${error.message}` }, origin);
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
    running = false;
  }
});

server.listen(port, host, () => process.stdout.write(`Local Go runner listening on http://${host}:${port}\n`));
