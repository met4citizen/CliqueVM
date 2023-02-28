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
    detectors: { pass: false }
  };

  // Run test set
  initModel(msg.data,results.model);
  if ( results.model.pass ) {
    testInit(results.init);
    if ( results.init.pass ) {
      testOper(results.oper);
      testCoord(results.coord);
      testDetectors(results.detectors);
    }
  }

  // Report results
  postMessage(results);

}

// Initialize the model
function initModel(testset,status) {
  try {
    // Create the functions
    ['init','oper','coord','detectors'].forEach( x => {
      if ( typeof testset[x] !== 'string' ) {
        throw new TypeError('ERROR: Missing function: '+x+'.');
      }
      switch(x){
      case 'oper':
        ModelAPI.prototype[x] = new Function("c",testset[x]);
        break;
      case 'coord':
        ModelAPI.prototype[x] = new Function("s",testset[x]);
        break;
      case 'init':
      case 'detectors':
        ModelAPI.prototype[x] = new Function(testset[x]);
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
function testInit(status) {
  try {
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
function testOper(status) {
  try {
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
function testCoord(status) {
  try {
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

// Test detectors
function testDetectors(status) {
  try {
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
