// Sobe o servidor (com recarga automática) e o Vite juntos, para desenvolver.
import { spawn } from 'node:child_process';

const processos = [
  spawn(process.execPath, ['--watch', 'src/servidor/index.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: true }),
];

const encerrar = () => {
  for (const p of processos) p.kill();
  process.exit();
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
for (const p of processos) p.on('exit', encerrar);
