importScripts("https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2.8.0/dist/graphviz.umd.js");

// Event handler
self.onmessage = async (msg) => {
  if ( typeof msg.data !== 'string' ) throw new TypeError('Not a string.');
  const graphviz = await self["@hpcc-js/wasm"].Graphviz.load();
  const svg = graphviz.layout(msg.data,"svg","dot");
  postMessage( svg );
}
