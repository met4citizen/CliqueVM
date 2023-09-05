import { parentPort } from "node:worker_threads";

// Data model
const G = new Map(); // Id to vertex { id, parent: [] }, if clique property 'clique'

// Event handler
parentPort.on("message", (d) => {
  if ( d.action === 'clique' ) { // Find cliques
    let { states, ...result } = d;
    result['cliques'] = BronKerbosch2( states.map(id=>G.get(id)) ).map(v=>v.map(y=>y.id) );
    parentPort.postMessage(result);
  } else if ( d.action === 'add' ) { // Add new vertices and establish ancestral connections
    for( let i=d.start; i<=d.end; i++ ) {
      let o = { id: i, parent: [] };
      if ( d.clique ) o['clique'] = true;
      G.set(i,o);
    }
    d.links.forEach( l => G.get(l[0]).parent.push(G.get(l[1])) );
  } else if ( d.action === 'del' ) { // Delete the last generation
    for(let i=d.end; i>=d.start; i--) G.delete(i);
  }
});

// Return true, if the two vertices are spacelike separated
function isSpacelike2( v1, v2 ) {

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
    if ( is.some(x => x.hasOwnProperty('clique') ) ) return false;
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
function BronKerbosch2(U) {
  const r = []; // The set of maximal cliques
  const N = new WeakMap(); // Neighbours

  U.forEach( u => N.set(u,[]) );
  for( let i=0; i<U.length-1; i++ ) {
    for( let j=i+1; j<U.length; j++ ) {
      if ( isSpacelike2( U[i],U[j] ) ) {
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
