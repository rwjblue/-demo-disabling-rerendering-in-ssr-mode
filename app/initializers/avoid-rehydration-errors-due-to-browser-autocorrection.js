import Ember from 'ember';

const { RehydrateBuilder, NewElementBuilder } = Ember.__loader.require('@glimmer/runtime');

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/element-builder.ts#L420-L497
class RemoteBlockTracker {
  first = null;
  last = null;
  destroyables = null;
  nesting = 0;

  constructor(parent) {
    this.parent = parent;
  }

  destroy() {
    let { destroyables } = this;

    if (destroyables && destroyables.length) {
      for (let i = 0; i < destroyables.length; i++) {
        destroyables[i].destroy();
      }
    }

    clear(this);
  }

  parentElement() {
    return this.parent;
  }

  firstNode() {
    return this.first && this.first.firstNode();
  }

  lastNode() {
    return this.last && this.last.lastNode();
  }

  openElement(element) {
    this.didAppendNode(element);
    this.nesting++;
  }

  closeElement() {
    this.nesting--;
  }

  didAppendNode(node) {
    if (this.nesting !== 0) return;

    if (!this.first) {
      this.first = new First(node);
    }

    this.last = new Last(node);
  }

  didAppendBounds(bounds) {
    if (this.nesting !== 0) return;

    if (!this.first) {
      this.first = bounds;
    }

    this.last = bounds;
  }

  newDestroyable(d) {
    this.destroyables = this.destroyables || [];
    this.destroyables.push(d);
  }

  finalize(stack) {
    if (this.first === null) {
      stack.appendComment('');
    }
  }
}

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/element-builder.ts#L23
class First {
  constructor(node) {
    this.node = node;
  }

  firstNode() {
    return this.node;
  }
}

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/element-builder.ts#L39
class Last {
  constructor(node) {
    this.node = node;
  }

  lastNode() {
    return this.node;
  }
}

// https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/rehydrate-builder.ts#L15
class RehydratingCursor {
  candidate = null;
  injectedOmittedNode = false;

  constructor(element, nextSibling, startingBlockDepth) {
    this.element = element;
    this.nextSibling = nextSibling;
    this.openBlockDepth = startingBlockDepth - 1;
  }
}

/** start code from the changes in https://github.com/glimmerjs/glimmer-vm/pull/988/files */

Object.defineProperty(RehydrateBuilder.prototype, 'candidate', {
  get() {
    if (this.currentCursor) {
      return this.currentCursor.candidate;
    }

    return null;
  },

  set(node) {
    let currentCursor = this.currentCursor;

    currentCursor.candidate = node;
  }
});

RehydrateBuilder.prototype.disableRehydration = function(nextSibling) {
  let currentCursor = this.currentCursor;

  // rehydration will be disabled until we either:
  // * hit popElement (and return to using the parent elements cursor)
  // * hit closeBlock and the next sibling is a close block comment
  //   matching the expected openBlockDepth
  currentCursor.candidate = null;
  currentCursor.nextSibling = nextSibling;
};

RehydrateBuilder.prototype.enableRehydration = function(candidate) {
  let currentCursor = this.currentCursor;

  currentCursor.candidate = candidate;
  currentCursor.nextSibling = null;
};


RehydrateBuilder.prototype.pushElement = function(element, nextSibling) {
  let cursor = new RehydratingCursor(element, nextSibling, this.blockDepth || 0);

  /**
   * <div>   <---------------  currentCursor.element
   *   <!--%+b:1%--> <-------  would have been removed during openBlock
   *   <div> <---------------  currentCursor.candidate -> cursor.element
   *     <!--%+b:2%--> <-----  currentCursor.candidate.firstChild -> cursor.candidate
   *     Foo
   *     <!--%-b:2%-->
   *   </div>
   *   <!--%-b:1%-->  <------  becomes currentCursor.candidate
   */
  if (this.candidate !== null) {
    cursor.candidate = element.firstChild;
    this.candidate = element.nextSibling;
  }

  this.cursorStack.push(cursor);
};

// clears until the end of the current container
// either the current open block or higher
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
      this.disableRehydration(current);
    }
  };

RehydrateBuilder.prototype.__openBlock = function() {
  let { currentCursor } = this;
  if (currentCursor === null) return;

  let blockDepth = this.blockDepth;

  this.blockDepth++;

  let { candidate } = currentCursor;
  if (candidate === null) return;

  let { tagName } = currentCursor.element;

  if (isOpenBlock(candidate) && getBlockDepth(candidate) === blockDepth) {
    this.candidate = this.remove(candidate);
    currentCursor.openBlockDepth = blockDepth;
  } else if (tagName !== 'TITLE' && tagName !== 'SCRIPT' && tagName !== 'STYLE') {
    this.clearMismatch(candidate);
  }
};

RehydrateBuilder.prototype.__closeBlock = function() {
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
      let nextSibling = this.remove(candidate);
      this.candidate = nextSibling;
      currentCursor.openBlockDepth--;
    } else {
      // close the block and clear mismatch in parent container
      // we will be either at the end of the element
      // or at the end of our containing block
      this.clearMismatch(candidate);
      isRehydrating = false;
    }
  }

  if (isRehydrating === false) {
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
      this.enableRehydration(candidate);

      currentCursor.openBlockDepth--;
    }
  }
};

RehydrateBuilder.prototype.__appendText = function(string) {
  let { candidate } = this;

  if (candidate) {
    if (isTextNode(candidate)) {
      if (candidate.nodeValue !== string) {
        candidate.nodeValue = string;
      }
      this.candidate = candidate.nextSibling;

      return candidate;
    } else if (isSeparator(candidate)) {
      this.candidate = this.remove(candidate);

      return this.__appendText(string);
    } else if (isEmpty(candidate) && string === '') {
      this.candidate = this.remove(candidate);

      return this.__appendText(string);
    } else {
      this.clearMismatch(candidate);

      return NewElementBuilder.prototype.__appendText.call(this, string);
    }
  } else {
      return NewElementBuilder.prototype.__appendText.call(this, string);
  }
}

RehydrateBuilder.prototype.__pushRemoteElement = function(element, cursorId, insertBefore) {
  let marker = this.getMarker(element, cursorId);

  // when insertBefore is not present, we clear the element
  if (insertBefore === undefined) {
    while (element.firstChild !== null && element.firstChild !== marker) {
      this.remove(element.firstChild);
    }
    insertBefore = null;
  }

  let cursor = new RehydratingCursor(element, null, this.blockDepth);
  this.cursorStack.push(cursor);

  if (marker === null) {
    this.disableRehydration(insertBefore);
  } else {
    this.candidate = this.remove(marker);
  }

  let tracker = new RemoteBlockTracker(element);
  this.pushBlockTracker(tracker, true);
};

function isOpenBlock(node) {
  return node.nodeType === 8 && node.nodeValue.lastIndexOf('%+b:', 0) === 0;
}

function isCloseBlock(node) {
  return node.nodeType === 8 && node.nodeValue.lastIndexOf('%-b:', 0) === 0;
}

function getBlockDepth(node) {
  return parseInt(node.nodeValue.slice(4), 10);
}

/* end code changes from https://github.com/glimmerjs/glimmer-vm/pull/988 */

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/rehydrate-builder.ts#L440
function isSeparator(node) {
  return node.nodeType === 8 && node.nodeValue === '%|%';
}

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/rehydrate-builder.ts#L444
function isEmpty(node) {
  return node.nodeType === 8 && node.nodeValue === '% %';
}

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/@glimmer/runtime/lib/vm/rehydrate-builder.ts#L404
function isTextNode(node) {
  return node.nodeType === 3;
}

// from https://github.com/glimmerjs/glimmer-vm/blob/v0.35.11/packages/%40glimmer/runtime/lib/bounds.ts#L80
function clear(bounds) {
  let parent = bounds.parentElement();
  let first = bounds.firstNode();
  let last = bounds.lastNode();

  let node = first;

  while (node) {
    let next = node.nextSibling;
    parent.removeChild(node);
    if (node === last) return next;
    node = next;
  }

  return null;
}

export default {
  initialize() {}
};
