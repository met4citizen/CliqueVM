importScripts("https://cdn.jsdelivr.net/npm/@hpcc-js/wasm@2.8.0/dist/graphviz.umd.js");

// Graphviz DOT engine
let graphviz;

// Data model
const IDS = []; // Ids [prev loc max, oper max, state max, clique max, loc max] per step
const H = new Map(); // Id to array of parent ids
const LC = new Map(); // Loc to coord
const CL = new Map(); // Coord to array of locs
const M = new Map();  // Metric, loc to parent locs

// Graph styles
const dotStyleGraph = 'ranksep=0.5 autosize=true bgcolor=transparent ordering=in outputorder=edgesfirst node [fixedsize=true fontname=Helvetica fontsize="14pt" fontcolor=grey35 style=filled]';
const dotStyleOperation = 'node [class=operation shape=circle width=0.14 height=0.14 penwidth=1 color=black fillcolor=black label=""]';
const dotStyleState = 'node [class=state shape=circle width=0.14 height=0.14 penwidth=1 color=black label="" fillcolor=white]';
const dotStyleCluster = 'color=grey fontcolor=grey';
const dotStyleClique = 'node [class=clique shape=square width=0.15 height=0.15 penwidth=1 color=black label="" colorscheme=orrd6 fillcolor=5]';
const dotStyleLocation = 'node [class=location shape=box width=0 height=0 margin="0.05,0" fixedsize=false penwidth=1 color=grey fillcolor=white]';
const dotStyleEdgeDirected = 'edge [class=link penwidth=1.5 color=grey arrowhead=normal arrowsize=0.5 style=solid weight=1]';
const dotStyleEdgeUndirected = 'edge [class=link penwidth=1.5 color=grey arrowhead=none style=solid weight=1]';
const dotStyleRelation = 'edge [class=link penwidth=1.5 color=grey arrowhead=none style=dashed weight=1]';

const interval = 500; // Progress report interval in milliseconds
let timestamp = 0; // Timestamp of the last progress report
const fmem = [BigInt(0), BigInt(1)]; // Factorial memoization

// Initialize graphviz
(async () => {
  graphviz = await self["@hpcc-js/wasm"].Graphviz.load();
})();

// Event handler
self.onmessage = (msg) => {
  let d = msg.data;
  if ( !d.action ) throw new TypeError('No action specified.');
  if ( d.action === 'add') {
    add(d);
  } else if ( d.action === 'del' ) {
    del(d);
  } else if ( d.action === 'trace' ) {
    if ( IDS.length && postProgress(d,0,true) ) {
      trace(d);
    }
  } else if ( d.action === 'snap' ) {
    if ( IDS.length && postProgress(d,0,true) ) {
      snap(d);
    }
  } else {
    throw new TypeError('Unknown action.');
  }
}

// Post progress report
// Return false, if the job is no longer valid
function postProgress(d,p,force=false) {
  if ( force || (Date.now() - timestamp) > interval ) {
    // Check if the job was aborted
    if ( d.job && p>0 && p<1 ) {
      let xhr = new XMLHttpRequest();
      xhr.open("GET", d.job, /* async= */false);
      xhr.timeout = 500;
      try {
        xhr.send(null);
        if (xhr.status !== 200) {
          return false;
        }
      } catch (e) {
        return false; // The job is no longer valid
      }
    }

    // Progress message
    postMessage({
      status: 'in-progress',
      action: d.action,
      step: IDS.length,
      progress: p
    });
    timestamp = Date.now();
  }
  return true;
}

// Post data
function postReady(d,data) {

  // Data structure and vertices
  const msg = {
    status: 'ready',
    action: d.action,
    step: IDS.length
  };
  if ( d.job ) msg.job = d.job;
  if ( data ) msg.data = data;

  // Post
  postMessage(msg);

}

// Add new data to the model
function add(d) {

  // Detectors
  if ( d.data.detectors ) detectors = d.data.detectors;

  // Keep track of IDs
  IDS.push( [ ...d.data.ids ] );

  // Construct H
  for( let i=d.data.ids[0]+1; i<=d.data.ids[4]; i++ ) H.set(i,[]);
  d.data.hide.forEach( x => H.delete(x) );
  d.data.links.forEach( l => H.get(l[0]).push(l[1]) );

  // Construct CL, LC and M
  for( let i=0; i<d.data.coords.length; i++) {
    let loc = d.data.ids[3]+i+1;
    let coord = d.data.coords[i];
    let metric = d.data.metric[i];

    let cl = CL.get(coord);
    if (cl) {
      cl.push(loc)
    } else {
      CL.set(coord,[loc]);
    }
    LC.set(loc,coord);
    M.set(loc,metric);
  }

  return true;
}

// Return to the previous step
function del(d) {

  // Can't delete initial state, do reset instead
  if ( IDS.length <= 1 ) {
    throw new RangeError("Can't delete initial state.");
  }

  // Ids to delete
  let ids = IDS.pop();

  // Delete M, LC and CL
  for(let i=ids[4]; i>ids[3]; i--) {
    M.delete(i);
    let coord = LC.get(i);
    LC.delete(i);
    let loc = CL.get(coord);
    loc.pop();
    if ( loc.length === 0 ) CL.delete(coord);
    H.delete(i);
  }

  // Delete rest of the vertices and reset the current id
  for(let i=ids[3]; i>ids[0]; i--) H.delete(i);

  return true;
}

// Trace view
function trace(d) {
  let mode = d.mode || 1;
  let levels = d.levels || ( mode === 1 ? 6 : ((mode === 2 ) ? 8 : 10) );

  let s = 'digraph {\n\n' + dotStyleGraph; // Graph

  // Parts
  let so = ''; // Operations
  let ss = ''; // States
  let sc = ''; // Cliques
  let sl = ''; // Locations
  let sclust = ''; // Clusters
  let se = ''; // Edges

  // Steps to show
  let stepmin = Math.max( 0, IDS.length - levels );
  let stepmax = Math.min( IDS.length - 1, stepmin + levels );

  if ( mode === 1 ) { // Full trace

    for( let step = stepmin; step <= stepmax; step++ ) {
      let ids = IDS[step];

      // Operations
      for( let oper = ids[0]+1; oper <= ids[1]; oper++ ) {
        if ( H.get(oper) ) {
          so += ' ' + oper;
          if ( step > stepmin ) {
            let p = H.get(oper);
            if ( p.length ) {
              se += ' ' + p.join(',') + '->' + oper;
            }
          }
        }
      }

      // Local clusters
      for( let loc = ids[3]+1; loc <= ids[4]; loc++ ) {
        let cliques = H.get(loc);
        if ( cliques ) {
          sclust += '\n\nsubgraph cluster_' + loc + ' { '+dotStyleCluster;

          let states = [...new Set( cliques.map( x => H.get(x) || [] ).flat() ) ];

          // States
          states.forEach( x => {
            ss += ' '+x;
            let p = H.get(x);
            if ( p.length ) {
              se += ' ' + p.join(',') + '->' + x;
            }
            sclust += ' '+x;
          });

          // Cliques
          let P = probs(cliques); // Probabilities
          cliques.forEach( (x,i) => {
            let fillcolor = round( P[i] * 5 )+1;
            sc += ' '+x+' [fillcolor='+fillcolor+']';
            let p = H.get(x);
            if ( p.length ) {
              se += ' ' + p.join(',') + '->' + x;
            }
            sclust += ' '+x;
          });
          sclust += ' }';
        }
      }
    }

  } else if ( mode === 2 ) { // Cliques

    for( let step = stepmin; step <= stepmax; step++ ) {
      let ids = IDS[step];

      for( let loc = ids[3]+1; loc <= ids[4]; loc++ ) {
        let cliques = H.get(loc);
        if ( cliques ) {
          sclust += '\n\nsubgraph cluster_' + loc + ' { '+dotStyleCluster;

          let P = probs(cliques); // Probabilities
          cliques.forEach( (x,i) => {
            let fillcolor = round( P[i] * 5 )+1;
            sc += ' '+x+' [fillcolor='+fillcolor+']';
            if ( step > stepmin ) {
              let p = H.get(x); // States
              p = [...new Set( p.map( x => H.get(x) || [] ).flat() ) ]; // Opers
              p = [...new Set( p.map( x => H.get(x) || [] ).flat() ) ]; // Cliques
              if ( p.length ) {
                se += ' ' + p.join(',') + '->' + x;
              }
            }
            sclust += ' '+x;
          });
          sclust += ' }';
        }
      }
    }

  } else if ( mode === 3 ) { // Locations
    for( let step = stepmin; step <= stepmax; step++ ) {
      let ids = IDS[step];

      for( let loc = ids[3]+1; loc <= ids[4]; loc++ ) {
        if ( H.get(loc) ) {
          let coord = LC.get(loc);
          let label = coord.replace(/"/g, '\\"');
          sl += ' ' + loc + '[label="' + label +'"]';
          if ( step > stepmin ) {
            let p = M.get(loc);
            if ( p.length ) {
              se += ' ' + p.join(',') + '->' + loc;
            }
          }
        }
      }
    }

  } else {
    throw new RangeError("Invalid trace mode.");
  }

  // Construct the final DOT
  if ( so.length ) s += '\n\n' + dotStyleOperation + so;
  if ( ss.length ) s += '\n\n' + dotStyleState + ss;
  if ( sc.length ) s += '\n\n' + dotStyleClique + sc;
  if ( sl.length ) s += '\n\n' + dotStyleLocation + sl;
  if ( sclust.length ) s += sclust;
  if ( se.length ) s += '\n\n' + dotStyleEdgeDirected + se;

  s += '\n\n}';

  // Dot ready
  postReady(d,{ dot: s });

  return true;
}

// Snap view
function snap(d) {
  let mode = d.mode || 1;

  // DOT structure
  let s = 'graph {\n\nlayout=fdp ' + dotStyleGraph;

  let ids = IDS[IDS.length-1];
  if ( mode === 1) { // Clusters with spacelike relations
    s += '\n\n' + dotStyleState + '\n\n' + dotStyleRelation;

    // Latest locations
    for(let loc=ids[3]+1; loc<=ids[4]; loc++) {
      let cliques = H.get(loc);
      if ( cliques ) {
        let coord = LC.get(loc);
        let states = [...new Set( cliques.map( x => H.get(x) || [] ).flat() ) ];

        let label = coord.replace(/"/g, '\\"');
        s += '\n\nsubgraph cluster_' + loc;
        s += ' {'+dotStyleCluster+' label="'+label+'"';

        // States
        states.forEach( x => s += ' '+x );

        // Cliques
        cliques.forEach( x => {
          let vs = H.get(x);
          for( let j=0; j<vs.length-1; j++) {
            for( let k=j+1; k<vs.length; k++) {
              s += ' ' + vs[j] + '--' + vs[k];
            }
          }
        });

        s += ' }';
      }

      // Progress report
      if ( !postProgress( d, (loc-ids[3]) / (ids[4]-ids[3]) ) ) return false;

    }

  } else if ( mode === 2 ) {
    s += '\n\n' + dotStyleClique + '\n\n' + dotStyleRelation;

    // Latest locations
    for(let loc=ids[3]+1; loc<=ids[4]; loc++) {
      let cliques = H.get(loc);
      if ( cliques ) {
        let coord = LC.get(loc);

        let label = coord.replace(/"/g, '\\"');
  			s += '\n\nsubgraph cluster_' + loc;
        s += ' {'+dotStyleCluster+' label="'+label+'"';

        // Cliques
        let P = probs(cliques); // Probabilities
        cliques.forEach( (x,i) => {
          // Add clique
          let states = H.get(x);
          let size = round(0.14 * states.length,2);
          let fillcolor = round( P[i] * 5 )+1;
          s += ' '+x+' [height='+size+' width='+size+' fillcolor='+fillcolor+']';
        });

        // Relations when cliques have common states (overlap)
        for( let i=0; i<cliques.length-1; i++ ) {
          let states1 = H.get(cliques[i]);
          for( let j=i+1; j<cliques.length; j++ ) {
            let states2 = H.get(cliques[j]);
            if ( states1.some( x => states2.includes(x) ) ) {
              s += ' ' + cliques[i] + '--' + cliques[j]; // Cliques share states
            }
          }
        }

        s+= ' }';
      }

      // Progress report
      if ( !postProgress( d, (loc-ids[3]) / (ids[4]-ids[3]) ) ) return false;
    }

  } else if ( mode === 3 ) {
    s += '\n\n' + dotStyleLocation + '\n\n' + dotStyleRelation + '\n\n';

    // Latest locations
    let metric = [];
    for(let loc=ids[3]+1; loc<=ids[4]; loc++) {
      if ( H.get(loc) ) {
        let coord = LC.get(loc);
        let label = coord.replace(/"/g, '\\"');
        s += ' ' + loc + '[label="' + label +'"]';
        metric.push( M.get(loc) );
      }
    }

    // Connect locations with immediate parent locations
    for( let i=0; i<metric.length-1; i++ ) {
      for( let j=i+1; j<metric.length; j++ ) {
        let is = metric[i].filter( x => metric[j].includes(x) ); // Intersection
        if ( is.length ) {
          s += ' "' + (ids[3]+i+1) +'"--"' + (ids[3]+j+1) + '"';
        }
      }

      // Progress report
      if ( !postProgress( d, (i+1) / metric.length ) ) return false;
    }

  } else {
    throw new RangeError("Invalid snap mode.");
  }

  s += '\n\n}';

  // Dot ready
  postReady(d,{ dot: s });

  return true;
}

// Return factorial of n
function factorial(n) {
  while( fmem.length <= n ) fmem.push( fmem[ fmem.length-1 ] * BigInt( fmem.length ) );
  return BigInt( fmem[n] );
}

// Calculate probabilities of local cliques
function probs(cliques) {
  let tot = BigInt(0);
  let X = cliques.map( x => {
    let states = H.get(x);
    let y = factorial( states.length );
    tot += y;
    return y;
  });
  return X.map( x => Number( x * 10000n / tot ) / 10000 );
}

// Round up by using exponential notation to avoid rounding errors.
function round(x,e=0,allowExp=false) {
  if ( allowExp && ( x > 10000 || ( x !== 0 && x < Number('1e-'+e)) ) ) {
    return x.toExponential(e);
  }
  return Number(Math.round(x+'e'+e) + 'e-' + e);
};

// Return RBG colour gradient for value 0-1
function colorGradient(grad) {
  const low = [ 32, 255, 255 ]; // RGB
  const mid = [ 255, 255, 0 ];
  const hi = [ 255, 32, 32 ];

  let c1 = grad < 0.5 ? low : mid;
  let c2 = grad < 0.5 ? mid : hi;
  let fade = grad < 0.5 ? 2 * grad : 2 * grad - 1;

  let c = c1.map( (x,i) => Math.floor( x + (c2[i] - x) * fade ));
  return 'rgb(' + c.join(",") + ')';
}
