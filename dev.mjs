import { spawn } from 'node:child_process';

const commands=[['dev:web',['run','dev:web']],['runner',['run','runner']]];
const children=commands.map(([name,args]) => {
  const child=spawn('npm',args,{stdio:'inherit',env:{...process.env,FORCE_COLOR:'1'}});
  child.on('exit',(code) => {
    if (code && code !== 0) {
      process.stderr.write(`${name} exited with code ${code}\n`);
      for (const other of children) if (other !== child) other.kill('SIGTERM');
      process.exitCode=code;
    }
  });
  return child;
});
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => { for (const child of children) child.kill(signal); });
