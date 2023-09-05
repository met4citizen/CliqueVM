import { ForceGraph } from './ForceGraph.mjs';

/**
* @class Clique Virtual Machine
* @author Mika Suominen
*/
class CliqueVM {

	/**
	* @constructor
	* @param {function} fn Callback function, fn('type',data)
	* @param {Object} edot DOM element for the dot graph
	* @param {Object} eforce DOM element for the force graph
	*/
	constructor(fn,edot,eforce) {
		this.fn = fn; // Callback function
		this.edot = edot; // DOM element for DOT graph
		this.fg = new ForceGraph( fn, edot, eforce ); // Force graph 3D

		this.model = null; // Current model
		this.view = null; // Current view
		this.optionsView = {}; // Current view options

		// Web workers
		this.wwmodel; // Model -> Data
		this.wwview; // Data -> DOT/SVG
		this.wwdot; // DOT -> SVG, Graphviz WASM

		// Job queues
		this.wwmodeljobs = []; // Queue of model jobs that can be aborted/cancelled
		this.wwviewjobs = []; // Queue of view jobs that can be aborted/cancelled
		this.wwdotjobcnt = 0; // Graphviz job can't be aborted, only terminated

	}

	/**
	* Reset initial state.
	* @param {Object} [model=null] Model.
	* @param {Object} [server=null] Web socket server URL.
	*/
	reset(model=null,server=null) {
		// The model
		this.model = model || this.model;
		if ( !this.model ) throw new InternalError('Model not yet deployed.');

		// Reset force graph
		this.fg.reset();

		// Terminate web workers and jobs
		this.abort(true,true);
		if ( this.wwview ) this.wwview.terminate();
		if ( this.wwmodel ) this.wwmodel.terminate();

		// New server
		this.server = server;

		// Start View worker
		this.wwview = new Worker('./lib/wwview.js');
		this.wwview.onmessage = (msg) => {
			const d = msg.data;
			if ( d.status === 'in-progress' ) {
				this.fn('view-progress',Math.round(d.progress*100));
			} else if ( d.status === 'ready' ) {

				// Remove the completed job
				if ( d.job ) {
					URL.revokeObjectURL(d.job);
					const ndx = this.wwviewjobs.indexOf( d.job );
					if ( ndx !== -1 ) this.wwviewjobs.splice(ndx,1);
				}

				// Process data, if any
				if ( d.data ) {
					if ( d.data.dot ) {
						this.processDot( d.data.dot );
					}
				}

			}
		}

		// Notify errors
		this.wwview.onerror = (error) => {
			error.preventDefault();
			this.fn('view-error',error);
		}

		// Start Model worker
		if ( this.server ) {
			if ( Array.isArray( this.server) ) {
				this.wwmodel = new Worker('./lib/wwproxyd.js');
			} else {
				this.wwmodel = new Worker('./lib/wwproxy.js');
			}
		} else {
			this.wwmodel = new Worker('./lib/wwmodel.js');
		}
		this.wwmodel.onmessage = (msg) => {
			const d = msg.data;
			if ( d.status === 'in-progress' ) {

				// Notify progress
				this.fn('step-progress',Math.round(d.progress*100));

			} else if ( d.status === 'ready' ) {

				// Remove the completed job
				if ( d.job ) {
					URL.revokeObjectURL(d.job);
					const ndx = this.wwmodeljobs.indexOf( d.job );
					if ( ndx !== -1 ) this.wwmodeljobs.splice(ndx,1);
				}

				// Keep view updated
				if ( d.action === 'prev' ) {
					this.wwview.postMessage( { action: 'del' } );
				} else {
					this.wwview.postMessage( { action: 'add', data: d.data } );
				}

				if ( this.view === 'trace' || this.view === 'snap' ) {
					this.run();
				}

				// Notify current status
				this.fn('info',{
					action: d.action,
					step: d.data.step,
					ids: d.data.ids
				});

				// Process data
				if ( d.action === 'prev' ) {
					this.fg.prevData(d.data);
				} else {
					this.fg.nextData(d.data);
				}

				this.fn('step-ready');

			}
		}

		// Notify errors
		this.wwmodel.onerror = (error) => {
			error.preventDefault();
			this.fn('step-error',error);
		}

		// Setup the model
		const msg = {
			action: 'setup',
			model: this.model
		};
		if ( server ) msg["server"] = server;
		this.wwmodel.postMessage( msg );
	}

	/**
	* Resize force graph.
	*/
	resize() {
		this.fg.resize();
	}

	/**
	* Set graph force.
	* @param {number} force New force
	* @param {number} friction New friction
	*/
	force(force,friction) {
		this.fg.force(force,friction);
	}

	/**
	* Abort all jobs.
	* @param {boolean} [view=true] If true, abort view jobs
	* @param {boolean} [model=true] If true, abort model jobs
	*/
	abort(view=true,model=true) {

		let isJobs = false;

	  // Abort/cancel view jobs
		if ( view ) {
			isJobs = isJobs || this.wwviewjobs.length || this.wwdotjobcnt;
			this.wwviewjobs.forEach( job => URL.revokeObjectURL(job) );
			this.wwviewjobs.length = 0;

			// Graphviz can't be aborted, so terminate it
			if ( this.wwdotjobcnt ) {
				this.wwdot.terminate();
				this.wwdotjobcnt = 0;
				this.wwdot = undefined;
			}
		}

		// Abort/cancel model jobs
		if ( model ) {
			isJobs = isJobs || this.wwmodeljobs.length;
			this.wwmodeljobs.forEach( job => {
				URL.revokeObjectURL(job)
			});
		  this.wwmodeljobs.length = 0;
			if ( this.wwmodel && this.server ) {
				this.wwmodel.postMessage( { action: "abort" } );
			}
		}

		// Notify if we aborted/cancelled jobs
		if ( isJobs ) this.fn('abort');
	}

	/**
	* Get current view.
	* @param {string} view View: 'trace','snap','space' or 'hits'
	* @param {Object} optionsView View options.
	*/
	run(view=null,optionsView=null) {
		this.view = view || this.view;
		this.optionsView = optionsView || this.optionsView;

		this.fg.run(this.view, this.optionsView);

		if ( this.view === 'trace' || this.view === 'snap' ) {
			if ( this.wwview ) {
				const msg = Object.assign( this.optionsView, { action: this.view } );
				this.abort(true,false); // Abort existing view jobs, if any
			  const job = URL.createObjectURL(new Blob()); // New job
			  this.wwviewjobs.push(job);
			  msg.job = job;
			  this.wwview.postMessage( msg );
			}
		}
	}

	/**
	* Get the next step of the current view with step options.
	* @param {Object} [optionsStep={}] Options.
	*/
	runNext(optionsStep={}) {
		if ( this.wwmodel ) {
			const msg = Object.assign( optionsStep, { action: 'next' } );
		  const job = URL.createObjectURL(new Blob()); // New job
		  this.wwmodeljobs.push(job);
		  msg.job = job;
		  this.wwmodel.postMessage( msg );
		}
	}

	/**
	* Get the previous step of the current view.
	*/
	runPrev() {
		if ( this.wwmodel ) {
			const msg = { action: 'prev' };
			const job = URL.createObjectURL(new Blob()); // New job
			this.wwmodeljobs.push(job);
			msg.job = job;
			this.wwmodel.postMessage( msg );
		}
	}

	/**
	* Process DOT.
	* @param {string} dot DOT language string.
	*/
	processDot(dot) {

	  // Always terminate existing work
	  if ( this.wwdotjobcnt ) {
	    this.wwdot.terminate();
	    this.wwdotjobcnt = 0;
	    this.wwdot = undefined;
	  }

	  // Create a new worker, if the first time or terminated
	  if ( !this.wwdot ) {

	    this.wwdot = new Worker('./lib/wwdot.js');

			// Notify SVG data
	    this.wwdot.onmessage = (msg) => {
	      this.wwdotjobcnt--;
				this.edot.innerHTML = msg.data;
				this.fn('view-ready');
				if ( this.view === 'trace' ) {
					this.edot.scrollTop = this.edot.scrollHeight;
				}
	    }

			// Notify errors
	    this.wwdot.onerror = (error) => {
				error.preventDefault();
	      this.fn('dot-error',error);
	    }

	  }

	  // Post task task
	  this.wwdotjobcnt++;
	  this.wwdot.postMessage(dot);
	}

}

export { CliqueVM };
