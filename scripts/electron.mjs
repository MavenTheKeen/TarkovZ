// Starts Electron with ELECTRON_RUN_AS_NODE cleared. VS Code sets that variable
// in its terminals, which makes Electron run as plain Node and crash on start.
import { spawn } from 'node:child_process';
import electronPath from 'electron';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
