const { spawn } = require('child_process');
const path = require('path');

const scriptPath = path.join(__dirname, 'dist', 'index.js');
const node = spawn('node', [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: true
});

node.stderr.on('data', (data) => {
    console.error('[NativeHost]', data.toString());
});
node.stdout.on('data', (data) => {
    console.log('[NativeHost]', data.toString());
});

node.on('close', (code) => {
    console.log(`NativeHost exited with code ${code}`);
});

// Keep stdin open by writing a dummy keepalive every 30 seconds
setInterval(() => {
    if (node.stdin.writable) {
        node.stdin.write('\n');
    }
}, 30000);

// Keep this script alive
setInterval(() => {}, 1e9);
console.log(`NativeHost started with PID ${node.pid}`);
console.log('Press Ctrl+C to stop');