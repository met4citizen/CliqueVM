import { createServer } from 'https';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import process from 'node:process';
import { cpus } from 'node:os';
import { Worker } from 'node:worker_threads';

// Parameters
function args(key) {
  if ( process.argv.includes('--'+key) ) return true;
  const value = process.argv.find( x => x.startsWith('--'+key+'=') );
  return value ? value.substring(key.length+3) : null;
}
const threads = parseInt(args("threads")) || cpus().length;
if ( threads < 1 || threads > cpus().length ) {
  console.error("Thread count should be between 1 and the number of CPU cores (" + cpus().length + ").");
  process.exit(1);
}
const port = parseInt(args("port")) || 8888;
const cert = args("cert") || null;
const key = args("key") || null;
const isSSL = (cert && key);


// Start HTTPS/WebSocket servers
let wss;
if ( isSSL ) {
  let server = createServer({
    cert: readFileSync(cert, 'utf8'),
    key: readFileSync(key, 'utf8')
  });
  wss = new WebSocketServer({ server });
  server.on('error', (err) => console.error(err) );
  server.listen(port, () => console.info("CliqueVM WebSocket/SSL server running on port " + port + "." ));
} else {
  wss = new WebSocketServer({ port: port });
  console.info("CliqueVW WebSocket server running on port " + port + "." );
}

// New connections
wss.on('connection', (ws,req) => {
  console.info("New connection from " + req.connection.remoteAddress +"." );

  // Connection is alive
  ws.isAlive = true;

  // Abort control using shared buffer
  const abort = new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT);
  const ctrlAbort = new Int32Array(abort);

  // Start Model worker
  const worker = new Worker('./model.mjs', {
    workerData: {
      abort: abort,
      threads: threads
    }
  });
  worker.on("message", (data) => {
    ws.send( JSON.stringify(data) );
  });
  worker.on("error", (e) => {
    console.error(e);
  });

  // Process WebSocket messages
  ws.on("message", (data) => {
    try {
      const m = JSON.parse( data );
      if ( m.action === 'abort' ) {
        Atomics.store(ctrlAbort, 0, 1);
        Atomics.notify(ctrlAbort, 0);
      } else {
        worker.postMessage( m );
      }
    }
    catch(ex) {
      console.error('JSON parse failed: ' + ex);
    }
  });
  ws.on('error', (err) => {
    console.error(err);
    ws.close();
  });
  ws.on('close', (e) => {
    worker.postMessage({ action: 'close' });
  });
  ws.on('pong', (e) => {
    ws.isAlive = true;
  });

});

// Heartbeat
const heartbeat = setInterval(function ping() {
  wss.clients.forEach( (ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Close server
wss.on('close', () => {
  clearInterval(heartbeat);
});
