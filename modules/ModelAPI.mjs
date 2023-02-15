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
  }

  /**
	* Generate new id.
	* @return {number} Id.
	*/
	id() {
		return this._id++;
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
  * @generator
  * @param {Array} arr Array
  * @yields {Array} The shuffled array.
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

}

export { ModelAPI };
