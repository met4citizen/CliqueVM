import { cm6 } from './cm6.min.mjs';

/**
* @class Model Manager
* @author Mika Suominen
*/
class ModelManager {

	/**
	* @constructor
	* @param {string[]} names Function/element names.
	*/
	constructor(names) {
		this.names = names;

		// Setup CodeMirror6
		this.cm6view = this.names.map( x => {
			let s = cm6.createEditorState( "" );
			return cm6.createEditorView( s, document.getElementById(x) );
		});

		// Default
		this.defaultmodel = [
			"return [[0,0,0],[0,0,0]];",
			"let s=[],t=[];\nfor( let p of c ) {\n  let [a,b]=this.clone([p,p]);\n  let i = Math.floor(Math.random()*3);\n  if (a[i]<3) a[i]++;\n  if (b[i]>-3) b[i]--;\n  s.push(a);\n  t.push(b);\n}\nreturn [s,t];",
			"return s.join(',');",
			"return true;",
			"return Array.from({length:7},(_,i)=>i-3+',0,0');"
		];

	}

	load() {
	  this.names.forEach( (x,i) => {
	    let e = d3.select("#"+x+".code");
	    let v = localStorage.getItem(x+'v2') || this.defaultmodel[i];
	    this.cm6view[i].dispatch( {changes: {from: 0, to: this.cm6view[i].state.doc.length, insert: v }} );
	  });
	}

	save() {
	  this.names.forEach( (x,i) => {
	    let v = this.cm6view[i].state.doc.toString();
	    localStorage.setItem(x+'v2',v);
	  });
	}

	get() {
	  let o = {};
	  this.names.forEach( (x,i) => {
	    o[x] = '"use strict";\n'+this.cm6view[i].state.doc.toString();
	  });
	  return o;
	}

	export() {
	  let o = {};
	  this.names.forEach( (x,i) => {
	    o[x] = this.cm6view[i].state.doc.toString();
	  });
	  return JSON.stringify(o);
	}

	import(json) {
	  try {
	    let o = JSON.parse(json);
	    this.names.forEach( (x,i) => {
	      if ( o[x] && typeof o[x] === 'string' ) {
	        this.cm6view[i].dispatch( {changes: {from: 0, to: this.cm6view[i].state.doc.length, insert: o[x] }} );
	      }
	    });
	  }
	  catch(ex) {
	    console.log(ex);
	    alert(ex);
	  }
	  d3.selectAll('.code').dispatch("input");
	  d3.select("#deploy").classed('highlight',true);
	}

	/**
	* Run test.
	* @param {function} callback Callback function for results.
	*/
	test(callback) {

		let worker = new Worker('./lib/wwtester.js');

		let timer = setTimeout( function(w,fn) {
			w.terminate();
			fn({
		    model: {
					pass: false,
					error: 'ERROR: Processing took too long.\nPossible infinite loop.'
				},
		    init: { pass: false },
		    oper: { pass: false },
		    coord: { pass: false },
				show: { pass: false },
		    detectors: { pass: false }
		  });
		}.bind(null,worker,callback), 5000);

		worker.onmessage = (e) => {
			clearTimeout( timer );
			if ( e.data && e.data.status !== 'log' && e.data.status !== 'in-progress' ) {
				callback(e.data);
			}
    };

    worker.onerror = (e) => {
      clearTimeout( timer );
      callback({
		    model: {
					pass: false,
					error: 'ERROR: Processing took too long.\nPossible infinite loop.'
				},
		    init: { pass: false },
		    oper: { pass: false },
		    coord: { pass: false },
				show: { pass: false },
		    detectors: { pass: false }
		  });
    };

		// Start the test
		let testset = this.get();
		worker.postMessage(testset);
	}


}

export { ModelManager };
