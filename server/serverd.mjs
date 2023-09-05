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
const port = parseInt(args("port")) || 8881;
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
  server.listen(port, () => console.info("CliqueVM WebSocket/SSL serverd running on port " + port + "." ));
} else {
  wss = new WebSocketServer({ port: port });
  console.info("CliqueVW WebSocket serverd running on port " + port + "." );
}

// New connections
wss.on('connection', (ws,req) => {
  console.info("New connection from " + req.connection.remoteAddress +"." );

  // Connection is alive
  ws.isAlive = true;

  // Tasks and job queue
  const tasks = new Map();
  const queue = [];


  // Start Clique workers
  const workers = new Array(threads);
  const statuses = new Array(threads);
  for( let i=0; i<threads; i++ ) {
    workers[i] = new Worker('./clique.mjs');
    workers[i].on("message", (d) => {
      const task = tasks.get(d.task);
      if ( task ) {
        task.data[d.pos] = d.cliques;
        task.count--;
        if ( task.count === 0 ) {
          ws.send( JSON.stringify(task) );
          tasks.delete( d.task );
        }
      }
      if ( queue.length ) {
        const o = queue.pop();
        workers[i].postMessage(o);
      } else {
        statuses[i] = 0;
      }
    });
    workers[i].on("error", (e) => {
      console.error(e);
    });
    statuses[i] = 0;
  }

  // Process WebSocket messages
  ws.on("message", (msg) => {
    try {
      const d = JSON.parse( msg );
      if ( d.action === 'abort' ) {

        // Remove all tasks and jobs
        tasks.clear();
        queue.length = 0;

      } else if ( d.action === 'task' ) {
        let { data, ...o } = d;
        o['count'] = data.length;
        o['data'] = new Array(data.length);

        // Establish the task
        tasks.set( d.task, o);

        // Add to the queue
        d.data.forEach( (x,i) => {
          queue.push( {
            action: 'clique',
            task: d.task,
            pos: i,
            states: x.slice()
          });
        });

        // Initiate waiting threads
        for( let i=0; i<threads; i++ ) {
          if ( queue.length && statuses[i] === 0 ) {
            const o = queue.pop();
            workers[i].postMessage(o);
            statuses[i] = 1;
          }
        }
      } else {
        for( let i=0; i<threads; i++ ) {
          workers[i].postMessage( d );
        }
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
    for( let i=0; i<threads; i++ ) {
      workers[i].terminate();
    }
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
