import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';

const server = createServer();
const accepted = once(server, 'connection', { signal: AbortSignal.timeout(30000) });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const child = spawn('/usr/bin/x11vnc', ['-display', ':99', '-norc', '-q', '-nopw', '-nosel', '-input', 'KMB', '-noremote', '-noshm', '-once', '-rfbport', '0', '-connect_or_exit', `127.0.0.1:${address.port}`], { stdio: ['ignore', 'ignore', 'ignore'] });
const exited = once(child, 'exit');
let socket;
try {
  [socket] = await Promise.race([accepted, exited.then(() => { throw new Error('cloud.viewer_process_failed'); })]);
  server.close();
  process.stdin.pipe(socket); socket.pipe(process.stdout);
  process.stdin.once('end', () => socket.end());
  process.stdout.once('error', () => socket.destroy());
  await Promise.race([once(socket, 'close'), exited]);
} finally {
  socket?.destroy(); server.close();
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await exited;
}
