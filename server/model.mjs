import { Worker, parentPort, workerData } from "node:worker_threads";
import { ModelAPI } from './api.mjs';

// Start Clique workers
const threads = [];
let jobs = [];
let resolvers = [];
let rejectors = [];
let task = 0;
let job = 0;
for( let i=0; i<workerData.threads; i++ ) {
  threads[i] = new Worker('./clique.mjs');
  threads[i].on("message", (d) => {
    if ( d.task === task ) {
      if ( postProgress( { action: "clique", job: d.job }, (1 + job / jobs.length ) / 2 ) ) {
        resolvers[ d.job ]( d.cliques.map( x => x.map( y => V.get(y) ) ) );
        job++;
        if ( job < jobs.length ) {
          threads[i].postMessage( {
            action: 'clique',
            task: task,
            job: job,
            states: jobs[job].map( x => x.id )
          });
        }
      } else {
        rejectors[ d.job ]();
        task++;
      }
    }
  });
  threads[i].on("error", (e) => {
    console.error(e);
  });
}

// Globals
const model = new ModelAPI(); // Model
const ctrlAbort = new Int32Array(workerData.abort);

const V = new Map(); // Vertices, key: id, value: vertex
let id = 0; // Vertex id, current maximum id
const IDS = []; // Array of id distributions:
                // [prev loc max, oper max, state max, clique max, loc max]

let Lo = []; // Latest operations
let Ls = []; // Latest states
let Lc = []; // Latest maximal cliques
let Ll = []; // Latest spacetime locations

const interval = 1000; // Progress report interval in milliseconds
let timestamp = 0; // Timestamp of the last progress report
const fmem = [BigInt(0), BigInt(1)]; // Factorial memoization

// Event handler
parentPort.on("message", (d) => {
  if ( !d.action ) throw new TypeError('No action specified.');
  if ( d.action === 'setup' ) {
    if ( postProgress(d,0,true) ) {
      if ( setup(d) ) postProgress(d,1,true);
    }
  } else if ( d.action === 'next' ) {
    if ( postProgress(d,0,true) ) {
      if ( next(d) ) postProgress(d,1,true);
    }
  } else if ( d.action === 'prev' ) {
    if ( postProgress(d,0,true) ) {
      if ( prev(d) ) postProgress(d,1,true);
    }
  } else if ( d.action === 'close' ) {
    threads.forEach( x => x.terminate() );
    process.exit(0);
  } else {
    throw new TypeError('Unknown action.');
  }
});

function isAborted() {
  const value = Atomics.load(ctrlAbort,0);
  Atomics.store(ctrlAbort, 0, 0);
  Atomics.notify(ctrlAbort, 0);
  return (value !== 0);
}

// Post progress report
// Return false, if the job is no longer valid
function postProgress(d,p,force=false) {
  if ( force || ((Date.now() - timestamp) > interval) ) {

    // Progress message
    let msg = {
      status: 'in-progress',
      action: d.action,
      step: IDS.length,
      progress: p
    };
    timestamp = Date.now();
    parentPort.postMessage(msg);

    // Check if the job was aborted
    const aborted = isAborted();
    if ( d.job && p>=0 && p<1 && aborted ) return false;

  }
  return true;
}

// Post data
function postReady(d,props={}) {

  // Message
  const ids = IDS[IDS.length-1];
  const msg = {
    status: 'ready',
    action: d.action
  }
  if ( d.job ) msg.job = d.job;
  msg.data = Object.assign({
    step: IDS.length,
    ids: [ ...ids ],
    hide: [],
    links: [],
    coords: [],
    metric: [],
    stats: []
  }, props);

  // Hidden vertices
  let hide = msg.data.hide;
  for( let i=ids[0]+1; i<=ids[4]; i++ ) {
    let v = V.get(i);
    if ( !v.show ) hide.push(v.id);
  }

  // Links
  let links = msg.data.links;
  let coords = msg.data.coords;
  let metric = msg.data.metric;
  let stats = msg.data.stats;
  Lo.forEach( a => a.parent.forEach( b => {
    if ( a.show && b.show ) links.push( [a.id,b.id] );
  }) );
  Ls.forEach( a => a.parent.forEach( b => {
    if ( a.show && b.show ) links.push( [a.id,b.id] );
  }) );
  Lc.forEach( a => a.parent.forEach( b => {
    if ( a.show && b.show ) links.push( [a.id,b.id] );
  }) );
  Ll.forEach( a => {
    a.parent.forEach( b => {
      if ( a.show && b.show ) links.push( [a.id,b.id] );
    });
    coords.push( a.coord );
    stats.push( [...a.stat] );
    metric.push( [...a.metric] );
  });

  // Post
  parentPort.postMessage(msg);

}

function addLayer( start, end, clique=false ) {
  const links = [];
  for( let i=start; i<=end; i++ ) {
    V.get(i).parent.forEach( x => links.push( [i,x.id] ) );
  }

  // Update threads
  threads.forEach( x => {
    x.postMessage( {
      action: 'add',
      start: start,
      end: end,
      links: links,
      clique: clique
    });
  });
}

function delLayer(start,end) {
  // Update threads
  threads.forEach( x => {
    x.postMessage( {
      action: 'del',
      start: start,
      end: end
    });
  });
}


async function findCliques(d) {

  // Set new ids structure
  const ids = [id];

  // Label operations
  Lo.forEach( o => {
    o.id = ++id;
    V.set(id,o);
  });
  ids.push(id);

  // label states and build space
  const G = new Map();
  Ls.forEach( s => {
    s.id = ++id;
    if ( model.show(s.state) ) {
      s.show = true;
      s.parent.forEach( x => x.show = true );
    }
    V.set(id,s);
    let coord = model.coord(s.state);
    let g = G.get( coord );
    if (g) {
      g.push(s);
    } else {
      G.set(coord,[s]);
    }
  });
  ids.push(id);
  addLayer(ids[0]+1,ids[2]);

  // Find maximal cliques using the thread pool
  jobs = [...G.values()];
  task++;
  resolvers = new Array(jobs.length);
  rejectors = new Array(jobs.length);
  const promises = Array.from({ length: jobs.length }, (_,i) => {
    return new Promise((resolve,reject) => {
        resolvers[i] = resolve;
        rejectors[i] = reject;
      });
  });
  job = Math.min( jobs.length-1, threads.length-1 );
  for( let i=job; i>=0; i-- ) {
    threads[i].postMessage( {
      action: 'clique',
      task: task,
      job: i,
      states: jobs[i].map( x => x.id )
    });
  }

  // Wait for threads to finish
  let cliques;
  try {
    cliques = await Promise.all( promises );
  } catch(ex) {
    delLayer(ids[0]+1,ids[2]);
    return false;
  }

  Lc.length = 0;
  Ll.length = 0;
  let i = 0;
  for( let [coord,states] of G ) {

    const loc = { coord: coord, parent: [] };
    cliques[i].forEach( c => {
      const clique = { id: ++id, loc: loc, parent: [...c] };
      clique.show = clique.parent.some( x => x.show );
      V.set(id,clique);
      Lc.push( clique );
      loc.parent.push( clique );
    });

    // Calculate metric i.e. parent spacelike locations
    loc.stat = [];
    let p = [...new Set( loc.parent.map( x => x.parent ).flat() ) ]; // Cliques
    loc.stat.unshift(p.length);
    p = [...new Set( p.map( x => x.parent ).flat() ) ]; // States
    loc.stat.unshift(p.length);
    p = [...new Set( p.map( x => x.parent ).flat() ) ]; // Opers
    loc.stat.unshift(p.length);
    loc.metric = [...new Set( p.map( x => x.loc.id ) ) ]; // Parent spacetime locations
    Ll.push( loc );

    i++;
  }
  ids.push(id);
  addLayer(ids[2]+1,ids[3],true);

  // Label spacetime locations
  Ll.forEach( l => {
    l.id = ++id;
    l.show = l.parent.some( x => x.show );
    V.set(id,l);
  });
  ids.push(id);

  // Keep track of ids
  IDS.push(ids);

  return true;
}

// Setup the model based on function in parameter d.model
async function setup(d) {

  // Create a new model
  if ( !d.model ) {
    throw new TypeError('Missing model.');
  }

  // Create the functions
  ['init','oper','coord','show','detectors'].forEach( x => {
      if ( typeof d.model[x] !== 'string' ) {
        throw new TypeError('Missing function: '+x+'.');
      }
      switch(x){
      case 'oper':
        ModelAPI.prototype[x] = new Function("c",d.model[x]);
        break;
      case 'coord':
      case 'show':
        ModelAPI.prototype[x] = new Function("s",d.model[x]);
        break;
      case 'init':
      case 'detectors':
        ModelAPI.prototype[x] = new Function(d.model[x]);
      }
  });

  // Get the initial state
  const is = model.init();
  if ( !Array.isArray(is) ) {
    throw new TypeError("Initial state was not an array.");
  }
  if ( !is.length ) {
    throw new TypeError("Initial state was empty.");
  }

  // Reset variables
  id = 0;
  IDS.length = 0;
  V.clear();

  // Add the first operation with initial states and find groups
  Lo.length = 0;
  Ls.length = 0;
  const op = { parent: [] };
  Lo.push( op );
  is.forEach( s => Ls.push( { state: s, parent: [op] } ) );

  // Set ids and find cliques
  await findCliques(d);

  // Detectors
  let detectors = model.detectors();
  if ( !Array.isArray(detectors) ) {
    throw new TypeError("Detectors did not return an array.");
  }
  if ( detectors.some( x => typeof x !== 'string' ) ) {
    throw new TypeError("One of the detectors was not a string.");
  }

  // Report step ready. This is the first time, so include the detectors.
  postReady(d, { detectors: [...detectors] });

  // Setup can't be aborted so always return true
  return true;
}

// Filter the current set of cliques
function filter(d) {

  // Options
  const observer = d.observer || model._opt.observer || 0;
  const maxcliquesperloc = d.maxcliquesperloc || model._opt.maxcliquesperloc || 0;
  const cliquemin = IDS[IDS.length-1][2] + 1;

  if ( observer === 1 ) {

    // Quantum observer measures each location individually
    Lc.length = 0;
    for( let i=0; i<Ll.length; i++ ) {

      // Random clique based on the probability
      let P = probs( Ll[i].parent );
      let r = Math.random();
      let ndx;
      for( ndx=0; ndx<P.length-2; ndx++ ) {
        r -= P[ndx];
        if ( r<= 0 ) break;
      }

      // Add clique
      Lc.push( Ll[i].parent[ndx] );

      // Progress report
      if ( !postProgress( d, i / Ll.length / 4 ) ) return false;

    }

  } else if ( observer === 2 ) {

    // Classical observer measure the whole system
    Lctmp = Lc;
    Lc = [];
    while( Lctmp.length ) {

      // Random clique based on the probability distribution
      let P = probs( Lctmp );
      let r = Math.random();
      let ndx;
      for( ndx=0; ndx<P.length-2; ndx++ ) {
        r -= P[ndx];
        if ( r<= 0 ) break;
      }

      // Add clique
      let c = Lctmp[ndx];
      Lc.push( c );

      // Filter out the measured location and keep all spacelike cliques
      Lctmp = Lctmp.filter( x => isSpacelike(x,c) );

      // Progress report
      if ( !postProgress( d, Lc.length / (Lc.length+Lctmp.length) / 4 ) ) return false;

    }

  } else if ( maxcliquesperloc ) {

    // Limit the number of cliques per each location
    Lc.length = 0;
    for( let i=0; i<Ll.length; i++ ) {
      if ( Ll[i].parent.length > maxcliquesperloc ) {
        Ll[i].parent.sort((a,b)=> b.parent.length - a.parent.length );
        Ll[i].parent.length = maxcliquesperloc;
      }
      Lc.push( ...Ll[i].parent );

      // Progress report
      if ( !postProgress( d, i / Ll.length / 4 ) ) return false;
    }

  }

  return true;
}

// Calculate the next generation
async function next(d) {

  // Options
  let maxstatesperclique = d.maxstatesperclique || model._opt.maxstatesperclique || 0;

  // Check the model exists
  if ( !IDS.length ) {
    throw new RangeError('Setup the model first.');
  }

  // Filter cliques
  if ( !filter(d) ) {
    reconstruct(); // Aborted, reconstruct current step
    return false;
  };

  // Process each clique and establish new operators and states
  Lo.length = 0;
  Ls.length = 0;
  Lc.forEach( (c,i) => {

    // Call operator to get new states
    let states = c.parent.map( s => s.state );
    if ( maxstatesperclique && states.length > maxstatesperclique ) {
      model.shuffle(states);
      states.length = maxstatesperclique;
    }
    let nos = model.oper(states);
    if ( !Array.isArray(nos) ) {
      throw new TypeError("Operator didn't return an array.");
    }

    // Process new operations with states
    nos.forEach( o => {

      // Check states
      if ( !Array.isArray(o) ) {
        throw new TypeError("One of the new operations was not an array.");
      }
      if ( !o.length ) {
        throw new TypeError("One of the new operations had no states.");
      }

      // Add the new operation and states
      const op = { parent: [c] };
      Lo.push( op );
      o.forEach( s => Ls.push( { state: s, parent: [op] } ) );

    });

    // Progress report
    if ( !postProgress( d, ( 1 + i / Lc.length ) / 4 ) ) {
      reconstruct(); // Aborted, reconstruct current step
      return false;
    };

  });

  // Find maximal cliques for each group
  if ( !(await findCliques(d)) ) {
    reconstruct(); // Aborted, reconstruct current step
    return false;
  };

  // Report step ready
  postReady(d);

  return true;
}

// Reconstruct current data model
function reconstruct() {
  const ids = IDS[IDS.length-1];

  // Delete extra vertices, if any
  while( id > ids[4] ) {
    V.delete( id );
    id--;
  }

  // Clear data model
  Ll.length = 0;
  Lc.length = 0;
  Ls.length = 0;
  Lo.length = 0;

  // Reconstruct
  for( let i=ids[0]+1; i<=ids[1]; i++ ) {
    let v = V.get(i);
    Lo.push( v );
  }
  for( let i=ids[1]+1; i<=ids[2]; i++ ) {
    let v = V.get(i);
    Ls.push( v );
  }
  for( let i=ids[2]+1; i<=ids[3]; i++ ) {
    let v = V.get(i);
    Lc.push( v );
  }
  for( let i=ids[3]+1; i<=ids[4]; i++ ) {
    let v = V.get(i);
    Ll.push( v );
  }

}

// Return to the previous step
function prev(d) {

  // Check the model exists
  if ( !IDS.length ) {
    throw new RangeError('Reset the model first.');
  }
  if ( IDS.length === 1 ) {
    throw new RangeError("Can't erase the initial state.");
  }

  // Delete current step
  const ids = IDS.pop();

  // Update threads
  delLayer(ids[0]+1,ids[3]);

  // Reconstruct current data model
  reconstruct();

  // Report step ready
  postReady(d);

  // Prev can't be aborted so always return true
  return true;
}


// Return the factorial of n
function factorial(n) {
  while( fmem.length <= n ) fmem.push( fmem[ fmem.length-1 ] * BigInt( fmem.length ) );
  return BigInt( fmem[n] );
}

// Calculate probabilities of local cliques
function probs(cliques) {
  let tot = BigInt(0);
  let X = cliques.map( x => {
    let y = factorial( x.parent.length );
    tot += y;
    return y;
  });
  return X.map( x => Number( x * 10000n / tot ) / 10000 );
}

// Return true, if the two vertices are spacelike separated
function isSpacelike( v1, v2 ) {

  // If empty, not spacelike
  if ( !v1 || !v2 || v1===v2 ) return false;
  let s1 = [ v1 ], s2 = [ v2 ];

  // If some LCA is a token, not spacelike
  while( s1.length && s2.length ) {
    s1 = [ ...new Set( s1.map(x => x.parent).flat() ) ];
    s2 = [ ...new Set( s2.map(x => x.parent).flat() ) ];

    // Calculate intersection and differences
    let is;
    [s1,is,s2] = s1.reduce( (a,b) => {
      let idx = a[2].indexOf(b);
      if ( idx === -1 ) {
        a[0].push(b);
      } else {
        a[1].push(b);
        a[2].splice(idx,1);
      }
      return a;
    }, [[],[],s2] );

    // If some intersection is an clique, then not spacelike
    if ( is.some(x => x.hasOwnProperty('loc') ) ) return false;
  }

  // Spacelike
  return true;
}
