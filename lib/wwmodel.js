importScripts("ModelAPI.js");

// Globals
const model = new ModelAPI(); // Model

const V = new Map(); // Vertices, key: id, value: vertex
let id = 0; // Vertex id, current maximum id
const IDS = []; // Array of id distributions:
                // [prev loc max, oper max, state max, clique max, loc max]

let Lo = []; // Latest operations
let Ls = []; // Latest states
let Lc = []; // Latest maximal cliques
let Ll = []; // Latest spacetime locations

const interval = 500; // Progress report interval in milliseconds
let timestamp = 0; // Timestamp of the last progress report
const fmem = [BigInt(0), BigInt(1)]; // Factorial memoization

// Event handler
self.onmessage = (msg) => {
  let d = msg.data;
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
  } else {
    throw new TypeError('Unknown action.');
  }
}

function isAborted(d) {
  let xhr = new XMLHttpRequest();
  xhr.open("GET", d.job, /* async= */false);
  xhr.timeout = 500;
  try {
    xhr.send(null);
    if (xhr.status !== 200) {
      return true;
    }
  } catch (e) {
    return true; // The job is no longer valid
  }
  return false;
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
    postMessage(msg);

    // Check if the job was aborted
    if ( d.job && p>0 && p<1 && isAborted(d) ) return false;
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
  postMessage(msg);

}


function findCliques(d) {

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

  // Find maximal cliques for each coordinate location
  Lc.length = 0;
  Ll.length = 0;
  let i = 0;
  for( let [coord,states] of G ) {
    const MC = BronKerbosch(states);
    const loc = { coord: coord, parent: [] };
    MC.forEach( c => {
      const clique = { id: ++id, loc: loc, parent: [...c] };
      clique.show = clique.parent.some( x => x.show );
      V.set(id,clique);
      Lc.push( clique );
      loc.parent.push( clique );
    });

    // Calculate probabilities
    if ( model.probs ) {
      loc.probs = model.probs(coord, MC);
    }

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

    // Progress report
    i++;
    if ( !postProgress( d, (1 + (i / G.size) ) / 2 ) ) return false;
  }
  ids.push(id);

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
function setup(d) {

  // Create a new model
  if ( !d.model ) {
    throw new TypeError('Missing model.');
  }

  // Create the functions
  ['init','oper','coord','probs','show','detectors'].forEach( x => {
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
        break;
      case 'probs':
        ModelAPI.prototype[x] = new Function("coord","cs",d.model[x]);
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
  findCliques(d);

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
      let P = Ll[i].probs || model.probsPerm( Ll[i].parent.map( x => x.parent ) );
      let r = Math.random();
      let ndx;
      for( ndx=0; ndx<P.length-2; ndx++ ) {
        r -= P[ndx];
        if ( r<= 0 ) break;
      }

      // Add clique
      Lc.push( Ll[i].parent[ndx] );

      // Progress report
      if ( !postProgress( d, (i+1) / Ll.length / 4 ) ) return false;

    }

  } else if ( observer === 2 ) {

    // Classical observer measure the whole system
    Lctmp = Lc;
    Lc = [];
    while( Lctmp.length ) {

      // Random clique based on the probability distribution
      let P;
      if ( model.probs ) {
        P = model.probs(null, Lctmp.map( x => x.parent ) );
      }
      if ( P === undefined || P === null ) {
        P = model.probsPerm( Lctmp.map( x => x.parent ) );
      }
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
      if ( !postProgress( d, (i+1) / Ll.length / 4 ) ) return false;
    }

  }

  return true;
}

// Calculate the next generation
function next(d) {

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
    if ( !postProgress( d, ( 1 + (i+1) / Lc.length ) / 4 ) ) {
      reconstruct(); // Aborted, reconstruct current step
      return false;
    };

  });

  // Find maximal cliques for each group
  if ( !findCliques(d) ) {
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
  IDS.pop();

  // Reconstruct current data model
  reconstruct();

  // Report step ready
  postReady(d);

  // Prev can't be aborted so always return true
  return true;
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

// Bron-Kerbosch algorithm with pivoting for finding maximal cliques
// for the given local group.
//
// ALGORITHM BK(R, P, X) IS
//    IF P and X are both empty THEN
//        report R as a maximal clique
//    choose a pivot vertex u in P ⋃ X
//    FOR each vertex v in P \ N(u) DO
//        BK(R ⋃ {v}, P ⋂ N(v), X ⋂ N(v))
//        P := P \ {v}
//        X := X ⋃ {v}
//
function BronKerbosch(U) {
  const r = []; // The set of maximal cliques
  const N = new WeakMap(); // Neighbours

  U.forEach( u => N.set(u,[]) );
  for( let i=0; i<U.length-1; i++ ) {
    for( let j=i+1; j<U.length; j++ ) {
      if ( isSpacelike( U[i],U[j] ) ) {
        N.get(U[i]).push(U[j]);
        N.get(U[j]).push(U[i]);
      }
    }
  }
  U.sort( (a,b) => N.get(b).length - N.get(a).length ); // Higher deg first

  const stack = [];
  stack.push([[],[...U],[]]);
  while( stack.length ) {
    let [R,P,X] = stack.pop();

    if ( !P.length && !X.length ) r.push(R); // Report R as a maximal clique

    let u = [ ...P, ...X][0]; // Choose a pivot vertex
    let nu = N.get(u);
    let pdiffnu = P.filter( x => !nu.includes(x) );

    while( pdiffnu.length ) {
      let v = pdiffnu.splice(0,1)[0];
      let nv = N.get(v);
      stack.push([
        [...new Set([...R,v])],
        P.filter( x => nv.includes(x) ),
        X.filter( x => nv.includes(x) )
      ]);
      P.splice( P.indexOf(v) ,1);
      X = [ ...new Set([ ...X,v ]) ];
    }
  }
  return r;
}
