/**
* @class Model API utility functions.
* @author Mika Suominen
*
* Combinatorial generators based on Andrew Carlson's lib generatorics.js
* licensed under the MIT license:
* http://www.opensource.org/licenses/mit-license.php
*/
class ModelAPI {

  /**
  * @constructor
  */
  constructor() {
    this._id = 0;
    this._opt = {};
    this._fmem = [BigInt(0), BigInt(1)]; // Factorial memoization
  }

  /**
  * Set option.
  * @param {string} key Key
  * @param {any} value Value.
  */
  set(key,value) {
    this._opt[key] = value;
  }

  /**
  * Get option.
  * @param {string} key Key
  * @return {any} Value.
  */
  get(key) {
    return this._opt[key];
  }

  /**
	* Generate new id.
	* @return {number} Id.
	*/
	id() {
		return this._id++;
	}

  /**
  * Log.
  * @param {Object[]} args
  */
  log(...args) {
    console.log(...args);
    if ( postMessage ) {
      postMessage({
        status: 'log',
        arguments: args
      });
    }
  }

  /**
  * Create a deep copy of the given object.
  * @param {Object} o Any object that can be serialized
  * @return {Object} Deep copy.
  */
  clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  /**
	* Factorial with BigInt and memoization.
	* @param {bigint} n
	* @return {bigint} n!
	*/
	factorial(n) {
    while( this._fmem.length <= n ) {
      this._fmem.push( this._fmem[ this._fmem.length-1 ] * BigInt( this._fmem.length ) );
    }
    return BigInt( this._fmem[n] );
	}

  /**
  * Generates all combinations of a set.
  *   comb([a,b,c],2) -> [a,b] [a,c] [b,c]
  * @generator
  * @param {Array|String} arr - The set of elements.
  * @param {Number} [size=arr.length] - Number of elements to choose from the set.
  * @yields {Array|String} yields each combination as an array
  */
  *comb(arr, size = arr.length) {
    let end = arr.length - 1;
    let data = [];
    yield* combUtil(0, 0);
    function* combUtil(start, index) {
      if (index === size) return yield data;
      for (let i = start; i <= end && end - i + 1 >= size - index; i++) {
        data[index] = arr[i];
        yield* combUtil(i + 1, index + 1);
      }
    }
  }

  /**
  * Generates all permutations of a set.
  *   perm([a,b,c],2) -> [a,b] [a,c] [b,a] [b,c] [c,a] [c,b]
  * @generator
  * @param {Array|String} arr The set of elements.
  * @param {Number} [size=arr.length] Number of elements to choose from the set.
  * @yields {Array|String} yields each permutation as an array
  */
  *perm(arr, size = arr.length) {
    let len = arr.length;
    if (size === len) return yield* this.heapsAlg(arr);
    let data = [];
    let indecesUsed = []; // Keep track of the indeces of the used elements
    yield* permUtil(0);
    function* permUtil(index) {
      if (index === size) return yield data;
      for (let i = 0; i < len; i++) {
        if (!indecesUsed[i]) {
          indecesUsed[i] = true;
          data[index] = arr[i];
          yield *permUtil(index + 1);
          indecesUsed[i] = false;
        }
      }
    }
  }

  /**
  * Generates the cartesian product of the sets.
  *  cart([a,b],[c,d,e]) -> [a,c] [a,d] [a,e] [b,c] [b,d] [b,e]
  * @generator
  * @param {...(Array|String)} sets Variable number of sets of n elements.
  * @yields {Array|String} yields each product as an array
  */
  *cart(...sets) {
    let data = [];
    yield* cartUtil(0);
    function* cartUtil(index) {
      if (index === sets.length) return yield data;
      for (let i = 0; i < sets[index].length; i++) {
        data[index] = sets[index][i];
        yield* cartUtil(index + 1);
      }
    }
  }

  /**
  * Shuffles the given array in place using the Fisher–Yates algorithm
  * @param {Array} arr Array
  * @return {Array} The shuffled array.
  */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
  * More efficient algorithm for permutations of ALL elements in an array.
  * @generator
  * @param {Array|String} arr Array
  * @yields {Array|String} Permutation of the array.
  */
  *heapsAlg(arr) {
    let size = arr.length;
    if (typeof arr === 'string') arr = arr.split('');
    yield* heapsUtil(0);
    function* heapsUtil(index) {
      if (index === size) return yield arr;
      for (let j = index; j < size; j++) {
        [arr[index], arr[j]] = [arr[j], arr[index]];
        yield* heapsUtil(index + 1);
        [arr[index], arr[j]] = [arr[j], arr[index]];
      }
    }
  }

  /**
	* Bron-Kerbosch algorithm with pivoting for finding maximal cliques.
	*
	* ALGORITHM BK(R, P, X) IS
	*    IF P and X are both empty THEN
	*        report R as a maximal clique
	*    choose a pivot vertex u in P ⋃ X
	*    FOR each vertex v in P \ N(u) DO
	*        BK(R ⋃ {v}, P ⋂ N(v), X ⋂ N(v))
	*        P := P \ {v}
	*        X := X ⋃ {v}
	*
	* @param {any[]} V Set of vertices
  * @param {WeakMap} N Neighbourhood for each vertex
	* @return {any[]} Maximal cliques
	*/
  BronKerbosch(V,N) {
    const MC = []; // Maximal cliques
    const stack = [ [[],[...V],[]] ];
    while( stack.length ) {
      let [R,P,X] = stack.pop();
      if ( !P.length && !X.length ) MC.push(R); // Report R as a maximal clique
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
    return MC;
  }

  /**
  * String rewriter.
  * @param {string} s String to rewrite
  * @param {string[][]} rules Rewriting rules [["A","B"],["A","C"],...]
  * @param {boolean} [combine=true] True if non-overlapping string are combined
  * @return {string[]|string[][]} Combined overlapping strings | grouped strings
  */
  rewriteStr(s,rules,combine=true) {

    if ( typeof s !== 'string' ) throw new TypeError("Not a string.");
    if ( !Array.isArray(rules) ) throw new TypeError("Not an array of rules.");

    // Find hits
    const hits = [];
    const N = new WeakMap(); // Neighbourhoods
    for( let i=0; i<rules.length; i++ ) {
      let r = new RegExp(rules[i][0], 'gi');
      for( let m of s.matchAll(r)) {
        const hit = { i: i, s: m.index, e: (m.index + rules[i][0].length - 1) };
        hits.push( hit );
        N.set(hit,[]);
      }
    }
    if ( hits.length === 0 ) return [];

    // Build neighbourhoods
    for( let c of this.comb(hits,2)) {
      if ( c[0].e < c[1].s || c[1].e < c[0].s ) {
        N.get(c[0]).push(c[1]);
        N.get(c[1]).push(c[0]);
      }
    }
    hits.sort( (a,b) => N.get(b).length - N.get(a).length );

    // Find maximal cliques MC
    const MC = this.BronKerbosch(hits,N);

    // Overlapping strings
    let r = [];
    MC.forEach( mc => {
      if ( combine ) {
        let y = s.split('');
        mc.forEach( x => y.splice( x.s, x.e-x.s+1, ...rules[x.i][1].split('') ) );
        r.push( y.join('') );
      } else {
        let g = [];
        mc.forEach( x => {
          let y = s.split('');
          y.splice( x.s, x.e-x.s+1, ...rules[x.i][1].split('') );
          g.push( y.join('') );
        });
        r.push( g );
      }
    });

    return r;
  }

  /**
  * Calculate clique probabilities based on permutations.
  * @param {any[][]} cs Cliques i.e. array of array of states
  * @param {number} [observers=1] Number of observers
  * @return {number[]} Probabilities for each clique
  */
  probsPerm(cs, observers=1) {
    let tot = BigInt(0);
    let X = cs.map( x => {
      let y = this.factorial( x.length + observers );
      tot += y;
      return y;
    });
    return X.map( x => Number( x * 10000n / tot ) / 10000 );
  }

  /**
  * Calculate clique probabilities based on combinations.
  * @param {any[][]} cs Cliques i.e. array of array of states
  * @param {number} [observers=1] Number of observers
  * @return {number[]} Probabilities for each clique
  */
  probsComb(cs, observers=1) {
    let tot = cs.reduce( (a,b) => a+(b.length + observers), 0);
    return cs.map( x => (x.length + observers) / tot );
  }

  /**
  * Calculate classical probabilities.
  * @param {any[][]} cs Cliques i.e. array of array of states
  * @param {number} [observers=1] Number of observers
  * @return {number[]} Probabilities for each clique
  */
  probsClassic(cs, observers=1) {

    // Map from states to cliques
    const m = new Map();
    cs.forEach( (c,cndx) => {
      c.forEach( s => m.has(s) ? m.get(s).push(cndx) : m.set(s, [cndx] ) );
    });

    // Add observers
    for( let i=0; i<observers; i++ ) {
      m.set({ },[...Array(cs.length).keys()]);
    }

    // Jobs
    const jobs = [];
    for( let [s,cndxs] of m ) {
      const o = { s: s, cndxs: cndxs, m: m, a: 1 / m.size };
      jobs.push(o);
    }

    // Probabilities
    const ps = Array(cs.length).fill(0);
    while(jobs.length) {
      const job = jobs.shift();
      if ( job.cndxs.length === 1 ) {
        ps[job.cndxs[0]] += job.a;
      } else {

        // Next set of states
        const m2 = new Map();
        for( let [s,cndxs] of job.m ) {
          if ( s !== job.s ) {
            const is = job.cndxs.filter(cndx => cndxs.includes(cndx));
            if ( is.length ) {
              m2.has(s) ? m2.get(s).push(...is) : m2.set(s, [...is] );
            }
          }
        }

        // Create new jobs
        for( let [s,cndxs] of m2 ) {
          const o = { s: s, cndxs: cndxs, m: m2, a: job.a / m2.size };
          jobs.push(o);
        }

      }
    }

    return ps;
  }

  /**
  * Calculate clique probabilities based on the Born rule.
  * @param {any[][]} as Probability amplitudes.
  * @return {number[]} Probabilities for each clique
  */
  probsBorn(as) {
    // Born rule
    let r = Math.sqrt( as.reduce( (a,b) => a + b*b,0 ));
    return as.map( x => {
      let a = x / r;
      return a * a;
    });
  }

  /**
  * Calculate probabilities based on clique energies (Gibbs Random Field).
  * @param {number[]} es Energies for each clique
  * @return {number[]} Probabilities for each clique
  */
  probsGibbs(es) {
    const ps = es.map( x => Math.exp(x) );
    const tot = ps.reduce( (a,b) => a + b, 0);
    return ps.map( x => x / tot );
  }

}
