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

    // ********
    // This conditional is the only difference between what is shipped in Ember
    // 3.4+ and this patch. The rest of the code is duplicated in order to be
    // able to add this guard.
    //
    // In the case of `<p><div>foo</div><p>` being sent by the FastBoot during
    // serialization, the browser "corrects" that invalid HTML into
    // `<p></p><div>foo</div><p></p>`. Unfortunately, this correction does
    // **not** move our serialization markers so we end up with
    // `currentCursor.nextSibling` being `null` when we do not expect it.
    //
    // This guard allows us to avoid throwing an error (`this.remove(null)`
    // errors). The next opcode that runs will detect that the
    // `currentCursor.candidate` is not what it expects and it will call `.clearMismatch`
    // removing the incorrect (browser corrected) DOM and leaving the app in a
    // functional state.
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
