importScripts("ModelAPI.js");

const model = new ModelAPI(); // Model
let is; // Initial state

// Event handler
self.onmessage = (msg) => {

  // Test results
  const results = {
    model: { pass: false },
    init: { pass: false },
    oper: { pass: false },
    coord: { pass: false },
    show: { pass: false },
    detectors: { pass: false },
    server: { pass: false }
  };

  // Run test set
  initModel(msg.data,results.model);
  if ( results.model.pass ) {
    testInit(msg.data,results.init);
    if ( results.init.pass ) {
      testOper(msg.data,results.oper);
      testCoord(msg.data,results.coord);
      testShow(msg.data,results.show);
      testDetectors(msg.data,results.detectors);
    }
  }

  // Report results
  results.server.pass = true;
  postMessage(results);

}

// Initialize the model
function initModel(testset,status) {
  try {
    // Create the functions
    ['init','oper','coord','show','detectors'].forEach( x => {
      if ( typeof testset[x] !== 'string' ) {
        throw new TypeError('ERROR: Missing function: '+x+'.');
      }
    });
    status.pass = true;
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}

// Test init
function testInit(testset,status) {
  try {
    ModelAPI.prototype['init'] = new Function(testset['init']);

    is = model.init();

    if ( !Array.isArray(is) ) {
      status.error = "ERROR: The returned value was not an array.";
    } else if ( is.length === 0 ) {
      status.error = "ERROR: The returned value was empty.";
    } else {
      status.pass = true;
    }
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}

// Test oper
function testOper(testset,status) {
  try {
    ModelAPI.prototype['oper'] = new Function("c",testset['oper']);
    let o = model.oper(is);

    if ( !Array.isArray(o) ) {
      status.error = "ERROR: The returned value was not an array.";
    } else if ( o.length ) {
      if ( o.some( x => !Array.isArray(x) ) ) {
        status.error = "ERROR: One of the operations was not an array.";
      } else {
        status.pass = true;
      }
    } else {
      status.pass = true;
    }
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}

// Test coord
function testCoord(testset,status) {
  try {
    ModelAPI.prototype['coord'] = new Function("s",testset['coord']);
    let s = model.coord(is[0]);

    if ( typeof s !== 'string' ) {
      status.error = "ERROR: The returned value was not a string.";
    } else {
      status.pass = true;
    }
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}

// Test show
function testShow(testset,status) {
  try {
    ModelAPI.prototype['show'] = new Function("s",testset['show']);
    let s = Boolean(model.show(is[0]));

    if ( typeof s !== 'boolean' ) {
      status.error = "ERROR: The returned value was not a boolean.";
    } else {
      status.pass = true;
    }
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}

// Test detectors
function testDetectors(testset,status) {
  try {
    ModelAPI.prototype['detectors'] = new Function(testset['detectors']);
    let ds = model.detectors();

    if ( !Array.isArray(ds) ) {
      status.error = "ERROR: The returned value was not an array.";
    } else {
      status.pass = true;
    }
  }
  catch(ex) {
    console.log(ex.stack);
    status.error = '' + ex;
  }
}
