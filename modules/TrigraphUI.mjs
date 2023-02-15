import { Trigraph } from "./Trigraph.mjs";

/**
* @class 3-partite graph visual data
* @author Mika Suominen
*/

class TrigraphUI extends Trigraph {

	/**
	* @constructor
	* @param {Object} params Parameters
	*/
	constructor(params=null) {
		params = Object.assign({
			detectorsf: null, // Detectors, counters for states
			showlevels: 12 // Number of levels to show on DOT
		}, params || {});

		super(params);

		this.data = { nodes: [ ], links: [] }; // Force Graph data
		this.dataN = new Map(); // Map coordinate to node
		this.dataL = new Map(); // Map coordinate pair to link

		this.D = []; // Detectors
		this.title = ''; // Graph title
		this.sel = null; // Selected vertex

		// Graph styles
		this.dotStyleGraph = 'ranksep=0.5 autosize=true bgcolor=transparent ordering=in outputorder=edgesfirst node [fixedsize=true fontname=Helvetica fontsize="14pt" fontcolor=grey35 style=filled]';
		this.dotStyleOperation = 'node [class=operation shape=circle width=0.14 height=0.14 penwidth=1 color=black fillcolor=black label=""]';
		this.dotStyleState = 'node [class=state shape=circle width=0.14 height=0.14 penwidth=1 color=black label="" fillcolor=white]';
		this.dotStyleCluster = 'color=grey fontcolor=grey';
		this.dotStyleClique = 'node [class=clique shape=square width=0.15 height=0.15 penwidth=1 color=black label="" colorscheme=orrd6 fillcolor=5]';
		this.dotStyleLocation = 'node [class=location shape=box width=0 height=0 margin="0.05,0" fixedsize=false penwidth=1 color=grey fillcolor=white]';
		this.dotStyleEdgeDirected = 'edge [class=link penwidth=1.5 color=grey arrowhead=normal arrowsize=0.5 style=solid weight=1]';
		this.dotStyleEdgeUndirected = 'edge [class=link penwidth=1.5 color=grey arrowhead=none style=solid weight=1]';
		this.dotStyleRelation = 'edge [class=link penwidth=1.5 color=grey arrowhead=none style=dashed weight=1]';
		this.dotStyleSelected = 'penwidth=2.5 color=darkorange';

		this.dataStyleNodeColor = 'lightgrey';
		this.dataStyleLinkColor = 'lightgrey';
	}

	/**
	* Reset initial state.
	* @param {Object} params Configuration parameters
	*/
	reset(params=null) {

		// Clear data
		this.data.nodes.length = 0;
		this.data.links.length = 0;
		this.dataN.clear();
		this.dataL.clear();

		this.D.length = 0;
		this.title = '';
		this.sel = null;

		super.reset(params);

		// Detectors
		if ( this.params.detectorsf ) {
			let ds = this.params.detectorsf.apply(this.params.api);

			// Check the returned value
			if ( !Array.isArray(ds) ) {
				throw new TypeError("DETECTORS did not return an array.");
			}

			if ( ds && ds.length ) {
				ds.forEach( d => {
					this.D.push( { coord: '' + this.params.coordf.apply(this.params.api,[d]), cnt: 0 } );
				});
			}
		}
	}

	/**
	* Return colour gradient
	* @param {number} grad Value from 0 to 1
	* @return {string} RGB colour
	*/
	colorGradient(grad) {
		const low = [ 32, 255, 255 ]; // RGB
		const mid = [ 255, 255, 0 ];
		const hi = [ 255, 32, 32 ];

    let c1 = grad < 0.5 ? low : mid;
    let c2 = grad < 0.5 ? mid : hi;
    let fade = grad < 0.5 ? 2 * grad : 2 * grad - 1;

		let c = c1.map( (x,i) => Math.floor( x + (c2[i] - x) * fade ));
    return 'rgb(' + c.join(",") + ')';
	}

	/**
	* Update latest count and density color.
	* @param {number} max Maximum value.
	*/
	dataUpdateDensity(max) {

		if ( max > 0 ) {

			// Calculate node colors
			this.data.nodes.forEach( n => {
				if ( n.latest > 0 ) {
					n.color = this.colorGradient( n.latest / max );
				} else {
					n.color = this.dataStyleNodeColor;
				}
			});

			// Calculate link colors
			this.data.links.forEach( l => {
				if ( l.source.latest > 0 && l.target.latest > 0 ) {
					l.color = this.colorGradient( ((l.source.latest+l.target.latest) / 2) / max );
				} else {
					l.color = this.dataStyleLinkColor;
				}
			});

		}

	}

	/**
	* Run next step.
	* @param {number} [mode=0] Observer mode, 0=none
	* @return {number} Number of new states.
	*/
	next(mode=0) {
		let r = super.next(mode);
		if ( r ) {

			// Reset latest counters
			this.data.nodes.forEach( n => n.latest = 0 );

			let step = this.getStep();
			const T = this.T.get( step );
			let latestMax = 0;
			T.forEach( loc => {

				// Add new nodes
				let node = this.dataN.get( loc.coordinate );
				if ( node ) {
					node.latest += loc.states.length;
					node.cnt++;
				} else {
					node = {
						id: loc.coordinate,
						latest: loc.states.length,
						color: this.dataStyleNodeColor,
						cnt: 1
					};
					this.dataN.set( loc.coordinate, node );
					this.data.nodes.push( node );
				}
				if ( node.latest > latestMax ) latestMax = node.latest;

				// Add new links
				loc.parent.forEach( p => {
					let key = p.coordinate+'-'+loc.coordinate;
					let link = this.dataL.get( key );
					if ( link ) {
						link.cnt++;
					} else {
						let source = this.dataN.get( p.coordinate );
						link = {
							source: source,
							target: node,
							color: this.dataStyleLinkColor,
							cnt: 1
						};
						this.dataL.set( key, link );
						this.data.links.push( link );
					}
				});

			});

			// Update colors
			this.dataUpdateDensity( latestMax );

		}
		return r;
	}

	/**
	* Run prev step.
	* @return {boolean} False = no more
	*/
	prev() {
		if ( this.level <= 3) return false;

		// Reset latest counters
		this.data.nodes.forEach( n => n.latest = 0 );

		let T = this.T.get( this.getStep() ) || [];
		T.forEach( loc => {

			// Remove links
			loc.parent.forEach( p => {
				let key = p.coordinate+'-'+loc.coordinate;
				let link = this.dataL.get( key );
				if ( link.cnt > 1 ) {
					link.cnt--;
				} else {
					this.data.links.splice( this.data.links.indexOf(link), 1 );
					this.dataL.delete( key );
				}
			});

			// Remove nodes
			let node = this.dataN.get( loc.coordinate );
			if ( node.cnt > 1 ) {
				node.cnt--;
			} else {
				this.data.nodes.splice( this.data.nodes.indexOf(node), 1 );
				this.dataN.delete( loc.coordinate );
			}

		});

		let r = super.prev();

		let latestMax = 0;
		T = this.T.get( this.getStep() ) || [];
		T.forEach( loc => {
			// Calculate latest
			let node = this.dataN.get( loc.coordinate );
			node.latest += loc.states.length;
			if ( node.latest > latestMax ) latestMax = node.latest;
		});

		// Update colors
		this.dataUpdateDensity( latestMax );

		return r;
	}

	/**
	* DOT for the multiway graph.
	* @param {Number} [sel=null] Selected vertex
	* @param {Number} [mode=0] Mode: 0=full, 1=cliques, 2=locations
	* @return {String} DOT
	*/
	dotMultiway(sel=null,mode=0) {
		// Check status
		if ( !this.getStep() ) return null;

		// Selection
		this.sel = sel;

		// Title
		switch(mode) {
			case 0: this.title = 'Multithread trace, multiway evolution graph \\(H\\)'; break;
			case 1: this.title = 'Multiway trace, maximal cliques \\(H_C\\)'; break;
			case 2: this.title = 'Multiway Graph, spacetime \\(H_L\\)'; break;
			default:
				this.title = 'Unknown mode';
				return null;
		}

		// Time period
		let nlevels = this.params.showlevels * (mode + 1);
		let lbegin = Math.max(this.level - nlevels, 1);
		let lend = this.level;
		this.title += ', \\(t=[' + this.getStep(lbegin) + ',' + this.getStep(lend) + ']\\)';

		// DOT structure
		let s = [
			'digraph {\n\n' + this.dotStyleGraph,
			(mode === 0) ? this.dotStyleOperation : undefined,
			(mode === 0) ? this.dotStyleState : undefined,
			(mode !== 2) ? this.dotStyleClique : undefined,
			(mode === 2) ? this.dotStyleLocation : undefined,
			(mode !== 2) ? '' : undefined, // Clusters
			this.dotStyleEdgeDirected,
			sel ? sel + ' [xlabel=' + sel + ' ' + this.dotStyleSelected + ']' : undefined,
			'}'
		];

		for(let l=lbegin; l<=lend; l++) {

			// Map to DOT structure based on mode an type
			let type = l % 3;
			let i = (mode === 2) ? [4,1,2][type] : [3,1,2][type]; // DOT index

			if ( mode === 0 ) {
				const X = this.L.get(l);
				X.forEach( v => {
					s[i] += ' ' + v.id;
					if ( i===3 ) s[i] += ' [fillcolor=' + (this.round(v.p*5)+1) + ']';
					if ( v.child.length ) {
						s[6] += ' ' + v.id + '->' + v.child.map( x => x.id ).join(',');
					}
				});
			} else if ( mode === 1 && type === 0 ) {
				const X = this.L.get(l);
				X.forEach( v => {
					s[i] += ' ' + v.id + ' [fillcolor=' + (this.round(v.p*5)+1) + ']';
					let vs = this.bfs( v.child, false, 2 ).next().value || [];
					if ( vs.length ) s[6] += ' '+v.id+'->'+vs.map( c => c.id ).join(',');
				});
			}

			// Locations and clusters
			if ( type === 0 ) {
				const step = this.getStep(l);
				const T = this.T.get(step);
				if ( mode === 2 ) {
					T.forEach( loc => {
						let coord = loc.coordinate.replace(/"/g, '\\"');
						let id = '"' + step + '-' + coord + '"';
						s[i] += ' ' + id + ' [label="' + coord + '"]';
						let ids = loc.child.map( x => {
							return '"'+(step+1)+'-'+x.coordinate.replace(/"/g, '\\"')+'"';
						});
						if ( ids.length ) s[6] += ' ' + id + '->' + ids.join(',');
					});
				} else {
					T.forEach( (loc,j) => {
						if ( s[5].length ) s[5] += '\n\n';
						s[5] += 'subgraph cluster_'+step+'_'+j+' {'+this.dotStyleCluster;
						if ( mode===0 ) loc.states.forEach( v => s[5] += ' ' + v.id );
						let cliques = this.bfs( loc.states ).next().value || [];
						if ( cliques.length ) cliques.forEach( v => s[5] += ' ' + v.id );
						s[5] += '}';
					});
				}
			}
		}

		return s.filter(x => x && x.length).join('\n\n');
	}


	/**
	* DOT for the branchial graph.
	* @param {Number} [sel=null] Selected vertex
	* @param {Number} [mode=0] Mode: 0=states, 1=cliques
	* @return {String} DOT
	*/
	dotHypersurface(sel=null,mode=0) {
		// Check status
		if ( !this.getStep() ) return null;

		// Selection
		this.sel = sel;

		// Title
		switch(mode) {
			case 0: this.title = 'State snapshot of \\(H\\)'; break;
			case 1: this.title = 'Clique snapshot of \\(H\\)'; break;
			case 2: this.title = 'Location snapshot of \\(H\\)'; break;
			default:
				this.title = 'Unknown mode';
				return null;
		}

		// DOT structure
		let s = [
			'graph {\n\nlayout=fdp ' + this.dotStyleGraph,
			(mode === 0) ? this.dotStyleState + '\n\n' + this.dotStyleRelation : undefined,
			(mode === 1) ? this.dotStyleClique + '\n\n' + this.dotStyleRelation : undefined,
			(mode === 2) ? this.dotStyleLocation + '\n\n' + this.dotStyleRelation : undefined,
			'', // Clusters
			sel ? sel + ' [xlabel=' + sel + ' ' + this.dotStyleSelected + ']' : undefined,
			'}'
		];

		// Time
		const step = this.getStep();
		this.title += ', \\(t=' + step + '\\)';
		const T = this.T.get(step);
		let ndx = mode + 1;

		if ( mode === 0 || mode === 1 ) {
			T.forEach( (loc,i) => {
				let coord = loc.coordinate.replace(/"/g, '\\"');

				if ( s[4].length ) s[4] += '\n\n';
				s[4] += 'subgraph cluster_'+i+' {'+this.dotStyleCluster+' label="'+coord+'"';;
				if ( mode === 0 ) {

					loc.states.forEach( v => s[4] += ' ' + v.id );

					// Relations
					for(let j=0; j<loc.states.length-1; j++) {
						let r = [];
						for(let k=j+1; k<loc.states.length; k++) {
							if ( this.isSpacelike(loc.states[j],loc.states[k]) ) {
								r.push(loc.states[k].id);
							}
						}
						if ( r.length ) {
							s[4] += ' ' + loc.states[j].id + '--' + r.join(',');
						}
					}
				} else if ( mode === 1 ){
					let cliques = this.bfs( loc.states ).next().value || [];
					cliques.forEach( v => {
						let size = this.round(0.14 * v.parent.length,2);
						let fillcolor = this.round(v.p*5)+1;
						s[4] += ' '+v.id+' [height='+size+' width='+size+' fillcolor='+fillcolor+']';
					});

					// Relations
					for(let j=0; j<cliques.length-1; j++) {
						let r = [];
						for(let k=j+1; k<cliques.length; k++) {
							if ( cliques[j].parent.some( x => cliques[k].parent.includes(x) ) ) {
								r.push( cliques[k].id );
							}
						}
						if ( r.length ) {
							s[4] += ' ' + cliques[j].id + '--' + r.join(',');
						}
					}
				}
				s[4] += '}';

			});
		} else if ( mode === 2 ) {
			for( let i=0; i<T.length; i++ ) {
				let coord = T[i].coordinate.replace(/"/g, '\\"');
				let id = '"' + coord + '"';
				s[ndx] += ' ' + id;
				let r = [];
				for( let j=i+1; j<T.length; j++) {
					if ( T[i].parent.some( x => T[j].parent.includes(x) ) ) {
						r.push( '"' + T[j].coordinate.replace(/"/g, '\\"') + '"' );
					}
				}
				if ( r.length ) {
					s[ndx] += ' "' + coord + '"--' + r.join(',');
				}
			}
		}

		return s.filter(x => x && x.length).join('\n\n');
	}


	/**
	* DOT for the branchial graph.
	* @param {Number} [sel=null] Selected vertex
	* @return {Object} Data
	*/
	dataSpace(sel=null) {
		// Check status
		if ( !this.getStep() ) return null;

		return this.data;
	}


	/**
	* Bar chart.
	* @param {Number} [mode=0] Mode: 0=sum per level, 1=cumulative
	* @param {Number} [w=1000] Window weight
	* @param {Number} [h=600] Window height
	* @return {object} SVG D3 element
	*/
	svgHits(mode=0,w=800,h=400) {
		// Check status
		if ( !this.getStep() || !this.params.detectorsf ) return null;

		// Title
		switch(mode) {
			case 0: this.title = 'Detector hits, per step'; break;
			case 1: this.title = 'Detector hits, cumulative'; break;
			default:
				this.title = 'Unknown mode';
				return null;
		}

		// Retrieve counters
		const step = this.getStep();
		this.D.forEach( d => {
			if ( mode === 0 ) {
				d.cnt = 0;
				this.T.get( step ).forEach( loc => {
					if ( loc.coordinate === d.coord ) d.cnt++;
				});
			} else {
				let space = this.S.get( d.coord );
				d.cnt = space ? space.length : 0;
			}
		});

		let svg = d3.create("svg");

		svg
			.attr("width", w)
			.attr("height", h)
			.attr("viewBox", "0 0 " + w + " " + h);

		// Margins (top,right,bottom,left)
		let m = {t:20,r:50,b:25,l:100};

		let xScale = d3.scaleBand().range ([0, w-(m.r+m.l)]).padding(0.4);
  	let yScale = d3.scaleLinear().range ([h-(m.t+m.b), 0]);

		let g = svg.append("g").attr("transform", "translate("+m.l+","+m.t+")");

		xScale.domain(this.D.map( d => d.coord ));
    yScale.domain([0, Math.max(...this.D.map(x=>x.cnt),10)]);

		g.append("g")
			.attr("class", "xaxis")
    	.attr("transform", "translate(0," + (h-(m.t+m.b)) + ")")
      .call(d3.axisBottom(xScale));

		g.append("g")
			.attr("class", "yaxis")
			.call(d3.axisLeft(yScale).tickFormat(function(d){
				return d;
	    })
     .ticks(10));

	  g.selectAll(".bar")
     .data(this.D)
     .enter().append("rect")
     .attr("class", "bar")
     .attr("x", function(d) { return xScale(d.coord); })
     .attr("y", function(d) { return yScale(d.cnt); })
     .attr("width", xScale.bandwidth())
     .attr("height", function(d) { return h - (m.t+m.b) - yScale(d.cnt); });

		return svg;
	}



	/**
	* Get status.
	* @return {Object[]} Status object
	*/
	status() {
		let ss = [];
		let s = '';

		s += '<h1>' + this.title + '</h1>';
		if ( this.sel ) {
			let v = this.V.get(this.sel);
			if ( v ) {
				switch( v.level % 3 ) {
					case 0:
						s += 'The selected clique \\(' + this.sel + '\\) ';
						s += 'at location ' + this.params.coordf.apply(this.params.api,[v.parent[0].state]) + ' ';
						s += 'has probability \\(p=' + this.round(v.p,2) + '\\).';
						break;
					case 1:
						s += 'The selected operation is \\(' + this.sel + '\\).';
						break;
					case 2:
						s += 'The selected state \\(' + this.sel + '\\) ';
						s += 'has state ' + JSON.stringify(v.state) + '.'
						break;
				}
			}
		}

		ss.push( { id: "d0", text: s } );

		return ss;
	}

}

export { TrigraphUI };
