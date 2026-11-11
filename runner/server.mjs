import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
const execFile = promisify(execFileCallback);

const host = '127.0.0.1';
const port = Number(process.env.RUNNER_PORT || 5174);
const allowedOrigins = new Set(['http://127.0.0.1:5173','http://localhost:5173']);
let running = false;

function reply(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    ...(origin && allowedOrigins.has(origin) ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {}),
  });
  response.end(JSON.stringify(payload));
}

function readJson(request, maxBytes = 48_000) {
  return new Promise((resolve,reject) => {
    let size = 0; const chunks = [];
    request.on('data',(chunk) => { size += chunk.length; if (size > maxBytes) { reject(new Error('Request is too large.')); request.destroy(); } else chunks.push(chunk); });
    request.on('end',() => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Request must contain valid JSON.')); } });
    request.on('error',reject);
  });
}

function runCase(directory, input, caseNumber) {
  return new Promise((resolve) => {
    const cidFile=path.join(directory,`container-${caseNumber}.cid`);
    const args = [
      'run','--rm','-i','--network','none','--memory=256m','--memory-swap=256m','--cpus=0.75','--pids-limit=64',
      '--read-only','--tmpfs','/tmp:rw,nosuid,nodev,size=64m','--cap-drop=ALL','--security-opt','no-new-privileges',
      '--cidfile',cidFile,'--user=65534:65534','--workdir=/workspace','--mount',`type=bind,src=${directory},dst=/workspace,readonly`,
      '--env','HOME=/tmp','--env','GOCACHE=/tmp/go-cache','--env','GOMODCACHE=/tmp/go-mod-cache','--env','GOTOOLCHAIN=local','--env','GOPROXY=off',
      'golang:1.24-alpine','go','run','/workspace/main.go',
    ];
    let child; let stdout=''; let stderr=''; let finished=false; let timedOut=false;
    let timer;
    const complete = (result) => { if (finished) return; finished=true; clearTimeout(timer); resolve(result); };
    try { child = spawn('docker',args,{stdio:['pipe','pipe','pipe'],windowsHide:true}); }
    catch (error) { complete({error:`Could not start Docker: ${error.message}`}); return; }
    timer=setTimeout(() => {
      timedOut=true;
      child.kill('SIGKILL');
      readFile(cidFile,'utf8').then((id)=>{const clean=id.trim();if(/^[a-f0-9]{12,64}$/i.test(clean))return execFile('docker',['kill',clean],{timeout:3000});}).catch(()=>{});
      complete({error:'Execution timed out after 25 seconds.'});
    },25_000);
    child.stdout.on('data',(chunk) => { if (stdout.length < 8000) stdout += chunk.toString('utf8').slice(0,8000-stdout.length); });
    child.stderr.on('data',(chunk) => { if (stderr.length < 8000) stderr += chunk.toString('utf8').slice(0,8000-stderr.length); });
    child.on('error',(error) => complete({error:error.code === 'ENOENT' ? 'Docker was not found. Install Docker Desktop, start it, then run npm run runner.' : `Could not start Docker: ${error.message}`}));
    child.on('close',(code,signal) => {
      if (timedOut) return;
      complete({stdout,stderr,exitCode:code,signal});
    });
    child.stdin.end(input);
  });
}

const server=http.createServer(async (request,response) => {
  const origin=request.headers.origin;
  if (request.method === 'OPTIONS') {
    if (!allowedOrigins.has(origin)) return reply(response,403,{error:'Origin is not allowed.'});
    response.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}); return response.end();
  }
  if (request.url === '/api/health' && request.method === 'GET') {
    try { const {stdout}=await execFile('docker',['info','--format','{{.ServerVersion}}'],{timeout:3000}); return reply(response,200,{available:true,runner:'Docker isolated Go',version:stdout.trim()},origin); }
    catch { return reply(response,200,{available:false,runner:'Docker isolated Go',reason:'Docker Desktop is not reachable.'},origin); }
  }
  if (request.url !== '/api/run/go' || request.method !== 'POST') return reply(response,404,{error:'Not found.'},origin);
  if (!allowedOrigins.has(origin)) return reply(response,403,{error:'Open Backend Atlas on localhost:5173 to use the local runner.'});
  if (running) return reply(response,429,{error:'The local runner is busy. Try again shortly.'},origin);
  try { await execFile('docker',['info','--format','{{.ServerVersion}}'],{timeout:3000}); }
  catch { return reply(response,503,{error:'Docker Desktop is not reachable by the local runner. Start Docker Desktop and check that your local user can access its Docker socket.'},origin); }
  let body;
  try { body=await readJson(request); } catch (error) { return reply(response,400,{error:error.message},origin); }
  if (typeof body.code !== 'string' || body.code.length > 32_000) return reply(response,400,{error:'Go source is required and must be under 32 KB.'},origin);
  if (!Array.isArray(body.testCases) || body.testCases.length < 1 || body.testCases.length > 5) return reply(response,400,{error:'Add between 1 and 5 test cases before running.'},origin);
  if (body.testCases.some((item) => typeof item.input !== 'string' || typeof item.expected !== 'string' || item.input.length > 2_000 || item.expected.length > 2_000)) return reply(response,400,{error:'Each test case must contain input and expected output under 2 KB.'},origin);
  running=true;
  let directory;
  try {
    directory=await mkdtemp(path.join(os.tmpdir(),'backend-atlas-go-'));
    await writeFile(path.join(directory,'main.go'),body.code,{encoding:'utf8',mode:0o444});
    await chmod(directory,0o755);
    const results=[];
    for (const testCase of body.testCases) {
      const result=await runCase(directory,testCase.input,results.length);
      const actual=(result.stdout || '').trimEnd();
      results.push({...result,actual,passed:!result.error && result.exitCode === 0 && actual === testCase.expected.trimEnd()});
      if (result.error && result.error.startsWith('Docker was not found')) break;
    }
    reply(response,200,{results},origin);
  } catch (error) {
    reply(response,500,{error:`Runner error: ${error.message}`},origin);
  } finally {
    if (directory) await rm(directory,{recursive:true,force:true}).catch(()=>{});
    running=false;
  }
});

server.listen(port,host,() => process.stdout.write(`Local Go runner listening on http://${host}:${port}\n`));
