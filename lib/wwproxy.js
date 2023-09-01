
// Server
let ws = null;

// Event handler
self.onmessage = (msg) => {
  let d = msg.data;
  if ( d.action === 'setup' ) {
    if ( ws ) {
      ws.close();
      ws = null;
    }
    if ( d.server ) {
      ws = new WebSocket( d.server );
      ws.onerror = (err) => {
        throw new Error('Web socket server error: ' + err);
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          postMessage(m);
        }
        catch(ex) {
          throw new TypeError('JSON parse failed: ' + ex.message);
        }
      };
      ws.onopen = (e) => {
        ws.send(JSON.stringify(d));
      };
    }
  } else {
    if ( ws ) {
      ws.send(JSON.stringify(d));
    }
  }
}
