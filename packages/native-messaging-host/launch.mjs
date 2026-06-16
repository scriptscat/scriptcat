import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, 'dist', 'index.js');

const node = spawn('node', [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: false
});

node.stderr.on('data', (data) => {
    process.stderr.write(`[NH] ${data}`);
});
node.stdout.on('data', (data) => {
    process.stdout.write(`[NH] ${data}`);
});
node.on('close', (code) => {
    console.log(`NativeHost exited with code ${code}`);
});

// Keep stdin alive with periodic writes
setInterval(() => {
    if (node.stdin.writable) {
        node.stdin.write('\n');
    }
}, 30000);

// Keep this script alive
setInterval(() => {}, 1e9);
console.log(`NativeHost PID: ${node.pid}`);