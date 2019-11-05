import Ember from 'ember';

const { RehydrateBuilder } = Ember.__loader.require('@glimmer/runtime');

RehydrateBuilder.prototype.__closeBlock = function __closeBlock() {
  var currentCursor = this.currentCursor;

  if (currentCursor === null) return;
  // openBlock is the last rehydrated open block
  var openBlockDepth = currentCursor.openBlockDepth;
  // this currently is the expected next open block depth
  this.blockDepth--;
  var candidate = currentCursor.candidate;

  // rehydrating
  if (candidate !== null) {

    if (isComment(candidate) && getCloseBlockDepth(candidate) === openBlockDepth) {
      currentCursor.candidate = this.remove(candidate);
      currentCursor.openBlockDepth--;
    } else {
      this.clearMismatch(candidate);
    }
    // if the openBlockDepth matches the blockDepth we just closed to
    // then restore rehydration
  }
  if (currentCursor.openBlockDepth === this.blockDepth) {
    currentCursor.openBlockDepth--;

    if (currentCursor.nextSibling !== null) {
      currentCursor.candidate = this.remove(currentCursor.nextSibling);
    }
  }
};

function isComment(node) {
  return node.nodeType === 8;
}

function getCloseBlockDepth(node) {
  let boundsDepth = node.nodeValue.match(/^%-b:(\d+)%$/);

  if (boundsDepth && boundsDepth[1]) {
    return Number(boundsDepth[1]);
  } else {
    return null;
  }
}


export default {
  initialize() {}
};
