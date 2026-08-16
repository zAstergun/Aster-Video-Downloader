const { spawn } = require('child_process');
const path = require('path');

const exePath = path.join(__dirname, 'run.bat');
console.log('Spawning:', exePath);

const p = spawn('cmd.exe', ['/c', exePath, 'chrome-extension://ebdnanhfcfokkbblcjlckhgihjpkkece/'], { stdio: ['pipe', 'pipe', 'pipe'] });

p.stdout.on('data', (d) => {
  console.log('STDOUT:', d.toString('hex'), d.toString());
});

p.stderr.on('data', (d) => {
  console.error('STDERR:', d.toString());
});

p.on('close', (code) => {
  console.log('Process exited with code:', code);
});

// Send a valid native messaging message
const msg = JSON.stringify({ command: "ping" });
const header = Buffer.alloc(4);
header.writeUInt32LE(msg.length, 0);

p.stdin.write(header);
p.stdin.write(msg);
