
/**
* @class 3-partite graph data structure (operations, states and cliques)
* @author Mika Suominen
*/
class Trigraph {

	/**
	* @typedef {Object} Operation
	* @property {number} id Identifier
	* @property {number} level Level
	* @property {Clique[]} parent Set of parent vertices
	* @property {State[]} child Set of child vertices
	*/

	/**
	* @typedef {Object} State
	* @property {number} id Identifier
	* @property {number} level Level
	* @property {Any} state State
	* @property {Location} location Location
	* @property {Operation[]} parent Set of parent vertices
	* @property {Clique[]} child Set of child vertices
	*/

	/**
	* @typedef {Object} Clique
	* @property {number} id Identifier
	* @property {number} level Level
	* @property {number} p Probability
	* @property {State[]} parent Set of parent vertices
	* @property {Operation[]} child Set of child vertices
	*/

	/**
	* @typedef {Object} Location Equivalent class of states
	* @property {string} coordinate Coordinate
	* @property {State[]} states Set of equivalent states
	* @property {Location[]} parent Set of parent vertices
	* @property {Location[]} child Set of child vertices
	*/

	/**
	* @constructor
	* @param {Object} params Parameters
	*/
	constructor(params=null) {
		this.V = new Map(); // Vertices, key: vertex id
		this.L = new Map(); // Vertices, key: level

		this.T = new Map(); // Locations, key: step
		this.S = new Map(); // Locations, key: coordinate

		this.id = 0; // Current maximum id
		this.level = 0; // Current level

		this.params = Object.assign({ // Configuration
				api: null, // Function context (this)
				initf: null, // Initial state function
				operf: null, // Operator function
				eqf: null, // Equivalence compare function
				coordf: null // Coordinate of the given state function
			}, params || {});

		this.factCache = [BigInt(0), BigInt(1)]; // Factorial memoization
	}

	/**
	* Reset initial state.
	* @param {Object} params Configuration parameters
	*/
	reset(params=null) {

		this.V.clear();
		this.L.clear();

		this.T.clear();
		this.S.clear();

		this.id = 0;
		this.level = 0;

		this.params = Object.assign(this.params, params || {});

		this.next(); // Initial state
	}

	/**
	* Get step.
	* @param {number} [level=null] Level, if null use current step
	* @return {number} Time
	*/
	getStep(level=null) {
		level = level || this.level;
		return this.round( level / 3);
	};

	/**
	* Round up by using exponential notation to avoid rounding errors.
	* @param {number} x Number
	* @param {number} [e=0] Number of digits
	* @param {boolean} [allowExp=false] Allow scientific notation
	* @return {number} Number
	*/
	round(x,e=0,allowExp=false) {
		if ( allowExp && ( x > 10000 || ( x !== 0 && x < Number('1e-'+e)) ) ) {
			return x.toExponential(e);
		}
		return Number(Math.round(x+'e'+e) + 'e-' + e);
	};

	/**
	* Factorial with BigInt and memoization.
	* @param {bigint} n
	* @return {bigint} n!
	*/
	fact(n) {
		while( this.factCache.length <= n ) {
			this.factCache.push(
				this.factCache[ this.factCache.length-1 ] *
				BigInt( this.factCache.length )
			);
		}
		return BigInt( this.factCache[n] );
	}


	/**
	* Run next step.
	* @param {number} [mode=0] Observer mode, 0=none, 1=random, 2=max
	* @return {number} Number of new states.
	*/
	next(mode=0) {
		let step = this.getStep();
		const N = [[],[],[]]; // New operations, states, cliques

		if ( step === 0 ) {

			// Create the first operation and initial states
			step++;
			const v = { id: ++this.id, parent: [], child: [] };
			N[0].push(v);
			const is = this.params.initf.apply(this.params.api) || [];

			// Check input state(s) type
			if ( !Array.isArray(is) ) {
				throw new TypeError("INITIAL STATE was not an array.");
			}
			if ( is.length === 0 ) {
				throw new TypeError("INITIAL STATE was empty.");
			}

			is.forEach( s => {
				const u = { id: ++this.id, state: s, parent: [v], child: [] };
				v.child.push(u);
				N[1].push(u);
			});

		} else if ( this.level % 3 === 0 ) {

			// Start from the latest set of cliques
			let C = this.L.get(this.level);

			// If observer mode, select only a subset of cliques
			if ( mode ) {

				// Iterate all the cliques
				let X = [...C];
				C = [];

				while( X.length ) {

					let Y = []; // Cliques in the selected location
					if ( mode === 1 ) {

						// Select location via random state
						let S = [...new Set( X.map(x => x.parent ).flat() ) ]; // States
						let loc = S[ Math.floor( Math.random() * S.length) ].location;

						// Find cliques
						Y = X.filter( x => x.parent[0].location === loc );

					} else if (mode === 2) {

						// Select always the max-sized location
						let L = new WeakMap(); // Weak map of locations
						X.forEach( (x,i) => {
							let k = x.parent[0].location;
							let l = L.get( k );
							if ( l ) {
								l.push(x);
							} else {
								l = [x];
								L.set(k,l);
							}
							if ( l.length > Y.length ) Y = l;
						});

					}

					// Calculate new probabilities
					let tot = Y.reduce( (a,b) => a + this.fact( b.parent.length ), BigInt(0));
					let P = Y.map( y => ({ c: y, p: Number( this.fact(y.parent.length) * 10000n / tot ) / 10000 }) );

					// Random clique based on the probability distribution
					let r = Math.random();
					let c = P[0].y; // Fallback if rounding errors
					for(let x of P) {
						r -= x.p;
						if ( r <= 0 ) {
							c = x.c;
							break;
						}
					}
					C.push(c);

					// Filter out the measured location and keep all spacelike cliques
					X = X.filter( x => this.isSpacelike(x,c) );
				}
			}

			// Next generation for the selected cliques
			C.forEach( c => {
				const cs = c.parent.map( p => p.state ); // Current states
				const nos = this.params.operf.apply(this.params.api, [cs]) || []; // Next States

				// Check operations
				if ( !Array.isArray(nos) ) {
					throw new TypeError("OPERATOR: The output was not an array.");
				}

				nos.forEach( o => { // Operation

					// Check states
					if ( !Array.isArray(o) ) {
						throw new TypeError("OPERATOR: One of the operations was not an array.");
					}
					if ( o.length === 0 ) {
						throw new TypeError("OPERATOR: One of the operations was empty.");
					}

					const v = { id: ++this.id, parent: [c], child: [] };
					c.child.push(v);
					N[0].push(v);
					o.forEach( s => { // State
						const u = { id: ++this.id, state: s, parent: [v], child: [] };
						v.child.push(u);
						N[1].push(u);
					});
				});
			});

			step++;

		}

		// Calculate cliques
		const T = [];
		let S = [...N[1]];

		if ( S.length ) this.T.set(step,T);

		while( S.length ) {

			// Get the group of equivalent states
			let s = S.pop();
			const G = [s];
			for(let i=S.length-1; i>=0; i--) {
				if ( this.params.eqf.apply(this.params.api, [s.state,S[i].state]) ) {
					G.push(S[i]);
					S.splice(i,1);
				}
			}

			// Create a new location
			const coord = '' + this.params.coordf.apply(this.params.api,[s.state]);
			let vs = this.bfs( G, true, 3 ).next().value || [];
			let ls = [ ...new Set( vs.map( v => v.location ) ) ];
			const location = { states: G, coordinate: coord, parent: ls, child: [] };
			G.forEach( v => v.location = location );
			ls.forEach( c => c.child.push(location) );

			// Add the new location to space and step
			let space = this.S.get(coord);
			space ? space.push(location) : this.S.set(coord,[location]);
			T.push(location);

			// Find maximal cliques
			let MC = this.BronKerbosch(G);

			// Calculate the number of all possible permutations
			let tot = MC.reduce( (a,b) => a + this.fact( b.length ), BigInt(0));

			// Create new maximal clique
			MC.forEach( c => {
				let p = Number( this.fact(c.length) * 10000n / tot ) / 10000;
				let u = { id: ++this.id, p: p, parent: [...c], child: [] };
				c.forEach( v => v.child.push(u) );
				N[2].push(u);
			});
		}

		// Add the next generation of vertices and levels
		N.forEach( n => {
			if ( n.length ) {
				this.level++;
				n.forEach( v => {
					v.level = this.level;
					this.V.set(v.id,v);
				})
				this.L.set(this.level,n);
			}
		});

		// Return the number of new cliques
		return N[2].length;
	}

	/**
	* Run prev step.
	* @return {boolean} False = no more
	*/
	prev() {
		if ( this.level <= 3) return false;
		const step = this.getStep();

		// Delete locations from space and step
		let T = this.T.get(step) || [];
		T.forEach( c => {
			let space = this.S.get(c.coordinate);
			space.splice( space.indexOf(c), 1);
			if ( space.length === 0 ) this.S.delete(c.coordinate);
		});
		this.T.delete(step);

		// Delete levels up to previous cliques
		do {
			const X = this.L.get(this.level);

			X.forEach( v => {
				v.child.length = 0;
				v.parent.length = 0;
				this.V.delete(v.id);
				this.id--;
			});
			X.length = 0;
			this.L.delete(this.level);

			this.level--;
		} while( this.level % 3 );

		// Clean-up current level
		T = this.T.get( this.getStep() ) || [];
		T.forEach( c => c.child.length = 0 );
		let L = this.L.get( this.level ) || [];
		L.forEach( v => v.child.length = 0 );

		return (this.level > 3);
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
	* @param {Vertex[]} V Local group
	* @return {Vertex[][]} Maximal cliques
	*/
	BronKerbosch(V) {
		const r = []; // The set of maximal cliques
		const N = new WeakMap(); // Neighbours

		V.forEach( x => {
			N.set(x, V.filter(y => x !== y && this.isSpacelike(x,y) ) );
		});
		V.sort( (a,b) => N.get(b).length - N.get(a).length ); // Higher deg first

		const stack = [];
		stack.push([[],[...V],[]]);

		while( stack.length ) {
			let [R,P,X] = stack.pop();

			if ( P.length === 0 && X.length === 0 ) {
				r.push(R); // Report R as a maximal clique
			}

			let u = [ ...P, ...X][0]; // Choose a pivot vertex
			let nu = N.get(u) || [];
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

	/**
	* Check if two vertices are spacelike i.e. all the lowest common ancestors
	* are operations.
	* @param {Vertex} v1
	* @param {Vertex} v2
	* @return {boolean} True if spacelike.
	*/
	isSpacelike( v1, v2 ) {
		// If empty, not spacelike
		if ( !v1 || !v2 || v1===v2 ) return false;
		let s1 = [ v1 ];
		let s2 = [ v2 ];

		// If some LCA is a token, not spacelike
		while( s1.length && s2.length ) {
			s1 = [ ...new Set( s1.map(x => x.parent).flat() ) ];
			s2 = [ ...new Set( s2.map(x => x.parent).flat() ) ];

			// Get intersection and differences
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
			if ( is.length && is.some(x => (x.level % 3) === 0 ) ) return false;
		}

		return true;
	}


	/**
	* BFS generator function.
	* @generator
	* @param {Vertex[]} vs Root vertices
	* @param {boolean} [reverse=false] True=backwards, False=forwards
	* @param {number} [skip=1] Number of generations to skip, default skip root
	* @yields {Vertex[]} Next leafs
	*/
	*bfs( vs, reverse=false, skip=1 ) {
		let s = vs, u = [];
		while( s.length ) {
			if ( skip > 0 ) {
				skip--;
			} else {
				let or = yield s; // Yield the process; client can filter
				if (or) s = or;
			}
			const l = [];
			for( const x of s) {
				l.push( ...(reverse ? x.parent : x.child) );
			}
			u = [ ...new Set( [ ...u, ...s ] ) ]; // Set Union
			s = [ ...new Set(l) ].filter( x => !u.includes(x) ); // Set Difference
		}
	}

}

export { Trigraph };
