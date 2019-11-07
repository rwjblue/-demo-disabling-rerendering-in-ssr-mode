import Ember from 'ember';

const { RehydrateBuilder } = Ember.__loader.require('@glimmer/runtime');

RehydrateBuilder.prototype.clearMismatch = function(candidate) {
  let current = candidate;
  let currentCursor = this.currentCursor;
  if (currentCursor !== null) {
    let openBlockDepth = currentCursor.openBlockDepth;
    if (openBlockDepth >= currentCursor.startingBlockDepth) {
      while (current) {
        if (isCloseBlock(current)) {
          let closeBlockDepth = getBlockDepth(current);
          if (openBlockDepth >= closeBlockDepth) {
            // cleared up until the close but we haven't closed the current
            // block unless we are above
            currentCursor.openBlockDepth = closeBlockDepth;
            break;
          }
        }
        current = this.remove(current);
      }
    } else {
      while (current !== null) {
        current = this.remove(current);
      }
    }
    // current cursor parentNode should be openCandidate if element
    // or openCandidate.parentNode if comment
    currentCursor.nextSibling = current;
    // disable rehydration until we popElement or closeBlock for openBlockDepth
    currentCursor.candidate = null;
  }
};

RehydrateBuilder.prototype.__closeBlock = function __closeBlock() {
  let { currentCursor } = this;
  if (currentCursor === null) return;

  // openBlock is the last rehydrated open block
  let openBlockDepth = currentCursor.openBlockDepth;

  // this currently is the expected next open block depth
  this.blockDepth--;

  let { candidate } = currentCursor;

  let isRehydrating = false;

  if (candidate !== null) {
    isRehydrating = true;

    if (isCloseBlock(candidate) && getBlockDepth(candidate) === openBlockDepth) {
      currentCursor.candidate = this.remove(candidate);
      currentCursor.openBlockDepth--;
    } else {
      // close the block and clear mismatch in parent container
      // we will be either at the end of the element
      // or at the end of our containing block
      this.clearMismatch(candidate);
      isRehydrating = false;
    }
  }

  if (!isRehydrating) {
    // check if nextSibling matches our expected close block
    // if so, we remove the close block comment and
    // restore rehydration after clearMismatch disabled
    let nextSibling = currentCursor.nextSibling;
    if (
      nextSibling !== null &&
      isCloseBlock(nextSibling) &&
      getBlockDepth(nextSibling) === openBlockDepth
    ) {
      // restore rehydration state
      let candidate = this.remove(nextSibling);
      if (candidate === null) {
        // there is nothing more in the current element
        currentCursor.candidate = currentCursor.nextSibling = null;
      } else {
        currentCursor.candidate = candidate;
        currentCursor.nextSibling = candidate.nextSibling;
      }
      currentCursor.openBlockDepth--;
    }
  }
};

function isCloseBlock(node) {
  return node.nodeType === 8 && node.nodeValue.lastIndexOf('%-b:', 0) === 0;
}

function getBlockDepth(node) {
  return parseInt(node.nodeValue.slice(4), 10);
}

export default {
  initialize() {}
};
