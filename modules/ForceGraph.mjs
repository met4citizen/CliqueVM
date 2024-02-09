import _3dForceGraph from 'https://cdn.jsdelivr.net/npm/3d-force-graph@1.70.20/+esm';

/**
* @class Force Graph
* @author Mika Suominen
*/
class ForceGraph {

	/**
	* @constructor
	* @param {function} fn Callback event handler
	* @param {Object} edot DOM element for dot graph
	* @param {Object} eforce DOM element for force graph
	*/
	constructor(fn,edot,eforce) {
		this.fn = fn; // Callback function, fn('type',data)

		// Model
		this.LC = new Map(); // Loc to coord
		this.CL = new Map(); // Coord to array of locs
		this.M = new Map();  // Metric, loc to parent locs
		this.D = []; // Detectors

		this.d3dot = d3.select(edot); // d3 element
		this.d3force = d3.select(eforce); // d3 element
		this.timerIdle = null; // Force graph idle timer
		this.timeoutIdle = 6000; // Idle timeout in milliseconds

		this.view = null; // Current view
		this.optionsView = {}; // Current view options

		// Force graph data
		this.prevd = null;
		this.data = { nodes: [], links: [] };
		this.dataN = new Map(); // Map coordinate to node
		this.dataL = new Map(); // Map coordinate pair to link

		// Counters
		this.maxStepCnt = 0;
		this.maxCnt = 0;

		// Styles
		this.dataStyleNodeColor = 'lightgrey';
		this.dataStyleLinkColor = 'lightgrey';

		// Setup force graph
		this.g = _3dForceGraph({ rendererConfig: { antialias: true, precision: "lowp" }})
			( eforce )
			.forceEngine('d3')
			.numDimensions( 3 )
			.showNavInfo( true )
			.enablePointerInteraction( true )
			.backgroundColor( 'white' )
			.warmupTicks(5)
			.cooldownTime( 5000 )
			.linkDirectionalArrowLength(0)
			.nodeVisibility( n => !n.hide )
			.linkVisibility( l => !l.source.hide && !l.target.hide )
			.nodeOpacity( 0.9 )
			.linkOpacity( 0.8 )
			.nodeRelSize( 8 )
			.nodeVal( n => 2  )
			.nodeColor( n => n.color1 )
			.nodeLabel( n => `<span class="fg-label">${ n.id }</span>` )
			.linkWidth( l => 3 )
			.linkColor( l => l.color1 );
		this.g.controls().addEventListener( 'start', this.resume.bind(this) );
		this.g.controls().addEventListener( 'end', this.resumeTimeout.bind(this) );
		this.resize();

		this.g.d3Force("link").iterations( 15 );
		this.g.d3Force("center").strength( 1 );
		this.g.d3Force("charge").distanceMin( 20 );
		this.force(30,30);

	}

	/**
	* Reset graph.
	*/
	reset() {
		// Model data
		this.LC.clear();
		this.CL.clear();
		this.M.clear();
		this.D.length = 0;

		// Force graph data
		this.prevd = null;
		this.data = { nodes: [], links: [] };
		this.dataN.clear();
		this.dataL.clear();

		// Counters
		this.maxStepCnt = 0;
		this.maxCnt = 0;
	}


	/**
	* Get current view.
	* @param {string} [view='space'] View: 'space' or 'hits'
	* @param {Object} [options={}] View options.
	*/
	run(view=null,options=null) {
		this.view = view || this.view;
		this.optionsView = options || this.optionsView;

		if ( this.view === 'space' ) {
			if ( this.optionsView && this.optionsView.mode ) {
				if ( this.optionsView.mode === 1 ) {
					this.g
						.nodeColor( n => n.color1 )
						.linkColor( l => l.color1 );
				} else if ( this.optionsView.mode === 2 ) {
					this.g
						.nodeColor( n => n.color2 )
						.linkColor( l => l.color2 );
				}
			}
			this.g.graphData( this.data );
			this.resumeTimeout();
			this.fn( 'view-ready' );
		} else if ( this.view === 'hits' ) {
			this.hits( this.optionsView );
		}
	}

	/**
	* Pause rendering cycle.
	*/
	pause() {
	  this.g.pauseAnimation();
	}

	/**
	* Resume rendering cycle.
	*/
	resume() {
	  if ( !this.d3force.classed('hidden') ) {
	    this.g.resumeAnimation();
	    if ( this.timerIdle ) {
				clearTimeout( this.timerIdle );
				this.timerIdle = null;
			}
	  }
	}

	/**
	* Resume rendering cycle with timeout.
	*/
	resumeTimeout() {
	  if ( !this.d3force.classed('hidden') ) {
	    this.resume();
	    this.timerIdle = setTimeout( this.pause.bind(this), this.timeoutIdle );
	  }
	}

	/**
	* Set graph force.
	* @param {number} force New force
	* @param {number} friction New friction
	*/
	force(force,friction) {
	  this.g.d3Force("link").distance( force );
	  this.g.d3Force("charge").strength( -10 * (force + 10) );
	  this.g.d3VelocityDecay( friction / 100 );
	  let d = this.g.graphData();
	  this.g.graphData(d);
	  this.resumeTimeout();
	}

	/**
	* Resize force graph.
	*/
	resize() {
	  let size = this.d3force.node().parentNode.getBoundingClientRect();
	  this.g.width(size.width);
	  this.g.height(size.height);
	  this.resumeTimeout();
	}

	/**
	* Process data.
	* @param {Object} d Data object.
	*/
	nextData(d) {

		// Detectors, if specified
		if ( d.detectors ) this.D = d.detectors;

		// Empty step counters
		this.maxStepCnt = 0;
		this.data.nodes.forEach( n => n.stepcnt = 0 );

		for( let i=0; i<d.coords.length; i++) {
			let loc = d.ids[3]+i+1;
			let hide = d.hide.includes(loc);
			let coord = d.coords[i];
			let metric = d.metric[i];
			let stats = d.stats[i]; // Number of operations, states, cliques to loc
			let n = stats[1] || 1;

			// Construct CL, LC and M
			let cl = this.CL.get(coord);
			if (cl) {
				cl.push(loc)
			} else {
				this.CL.set(coord,[loc]);
			}
			this.LC.set(loc,coord);
			this.M.set(loc,metric);

			// Add new nodes
			let node = this.dataN.get( coord );
			if ( node ) {
				node.stepcnt += n;
				node.cnt += n;
				node.hide = node.hide && hide;
			} else {
				node = {
					id: coord,
					stepcnt: n,
					color: this.dataStyleNodeColor,
					cnt: n,
					hide: hide
				};
				this.dataN.set( coord, node );
				this.data.nodes.push( node );
			}
			if ( node.stepcnt > this.maxStepCnt ) this.maxStepCnt = node.stepcnt;
			if ( node.cnt > this.maxCnt ) this.maxCnt = node.cnt;

			// Add new links based on parent coordinates
			let pcoords = [...new Set( metric.map( x => this.LC.get(x) ) ) ];
			pcoords.forEach( pcoord => {
				let key = coord + '--' + pcoord;
				let link = this.dataL.get( key );
				if ( link ) {
					link.cnt++;
				} else {
					let target = this.dataN.get( pcoord );
					link = {
						source: node,
						target: target,
						color: this.dataStyleLinkColor,
						cnt: 1
					};
					this.dataL.set( key, link );
					this.data.links.push( link );
				}
			});

		}

		// Update colors
		this.dataUpdateDensity();

		// Store for del
		this.prevd = d;

		// Show
		this.run();

	}

	/**
	* Process space data delete
	* @param {Object} d Data object.
	*/
	prevData(d) {

		// Delete latest space
		for( let i=this.prevd.coords.length-1; i>=0; i--) {
			let loc = this.prevd.ids[3]+i+1;
			let coord = this.prevd.coords[i];
			let metric = this.prevd.metric[i];
			let stats = this.prevd.stats[i]; // Number of operations, states, cliques to loc
			let n = stats[1] || 1;

			// Delete links based on parent coordinates
			let pcoords = [...new Set( metric.map( x => this.LC.get(x) ) ) ];
			pcoords.forEach( pcoord => {
				let key = coord+'--'+pcoord;
				let link = this.dataL.get( key );
				link.cnt--;
				if ( link.cnt === 0 ) {
					this.data.links.splice( this.data.links.indexOf(link), 1 );
					this.dataL.delete( key );
				}
			});

			// Delete nodes
			let node = this.dataN.get( coord );
			node.cnt -= n;
			if ( node.cnt === 0 ) {
				this.data.nodes.splice( this.data.nodes.indexOf(node), 1 );
				this.dataN.delete( coord );
			}

			// Delete maps
			let cl = this.CL.get(coord);
			cl.pop();
			if (cl.length === 0) this.CL.delete(coord);
			this.LC.delete(loc);
			this.M.delete(loc);

		}

		// Re-calculate counts
		this.maxStepCnt = 0;
		this.maxCnt = 0;
		this.data.nodes.forEach( n => {
			n.stepcnt = 0;
			if ( n.cnt > this.maxCnt) this.maxCnt = n.cnt;
		});
		for( let i=0; i<d.coords.length; i++ ) {
			let coord = d.coords[i];
			let metric = d.metric[i];
			let stats = d.stats[i]; // Number of operations, states, cliques to loc
			let n = stats[1] || 1; // Count operations
			let node = this.dataN.get( coord );
			if ( node ) {
				node.stepcnt += n;
				if ( node.stepcnt > this.maxStepCnt ) this.maxStepCnt = node.stepcnt;
			}
		}

		// Update colors
		this.dataUpdateDensity( );

		// Store for del
		this.prevd = d;

		// Show changes
		this.run();

	}

	/**
	* Detector hits bar chart.
	* @param {Object} [options={}] Options.
	*/
	hits(options) {

	  if ( !options.mode || ( options.mode !== 1 && options.mode !== 2) ) {
	    throw new Error('ERROR: Unknown detector mode.');
	  }

	  // Count detector hits
	  const data = [];
	  for( let i=0; i<this.D.length; i++ ) {
			let coord = this.D[i];
			let cnt = 0;
			let node = this.dataN.get(coord);
			if ( node ) {
				if ( options.mode === 1 ) {
					cnt = node.stepcnt;
				} else if ( options.mode === 2 ) {
					cnt = node.cnt;
				}
			}
	    data.push({coord: coord, cnt: cnt});
	  }

	  let svg = d3.create("svg");
	  let w = options.width || 800;
	  let h = options.height || 400;

	  svg
	    .attr("width", w)
	    .attr("height", h)
	    .attr("viewBox", "0 0 " + w + " " + h);

	  // Margins (top,right,bottom,left)
	  let m = {t:20,r:50,b:25,l:100};

	  let xScale = d3.scaleBand().range ([0, w-(m.r+m.l)]).padding(0.4);
	  let yScale = d3.scaleLinear().range ([h-(m.t+m.b), 0]);

	  let g = svg.append("g").attr("transform", "translate("+m.l+","+m.t+")");

	  xScale.domain( data.map( x => x.coord ) );
	  yScale.domain([0, Math.max(...data.map( x => x.cnt),10)]);

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
	   .data(data)
	   .enter().append("rect")
	   .attr("class", "bar")
	   .attr("x", function(d) { return xScale(d.coord); })
	   .attr("y", function(d) { return yScale(d.cnt); })
	   .attr("width", xScale.bandwidth())
	   .attr("height", function(d) { return h - (m.t+m.b) - yScale(d.cnt); });

	  // SVG ready
		this.d3dot.node().innerHTML = '';
		this.d3dot.append(() => svg.node());
		this.fn( 'view-ready' );

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
	*/
	dataUpdateDensity() {

		// Calculate node colors
		this.data.nodes.forEach( n => {
			n.color1 = n.stepcnt ? this.colorGradient( n.stepcnt / this.maxStepCnt ) : this.dataStyleNodeColor;
			n.color2 = this.colorGradient( n.cnt / this.maxCnt );
		});

		// Calculate link colors
		this.data.links.forEach( l => {
			if ( l.source.stepcnt > 0 && l.target.stepcnt > 0 ) {
				l.color1 = this.colorGradient( ((l.source.stepcnt+l.target.stepcnt) / 2) / this.maxStepCnt );
			} else {
				l.color1 = this.dataStyleLinkColor;
			}
			l.color2 = this.colorGradient( ((l.source.cnt+l.target.cnt) / 2) / this.maxCnt );
		});

	}


}

export { ForceGraph };
