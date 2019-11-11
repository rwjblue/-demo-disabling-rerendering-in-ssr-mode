/* globals location, MutationObserver */

/**
 * This is a monkey patch for Glimmer VM on Ember 3.4 will fix an issue where
 * auto-corrected HTML failed to rehydrate and threw exceptions.
 *
 * In SSR, when a generated snippet of HTML is auto-corrected by browsers
 * during parsing - for example `<p> <div> </div> </p>` gets parsed as
 * `<p> </p> <div> </div>` by browsers - Glimmer was not able to properly
 * consolidate the client-side DOM and the auto-corrected SSR DOM
 * causing rehydration errors.
 */
import Ember from 'ember';
import { registerDeprecationHandler, registerWarnHandler } from '@ember/debug';

const IS_BROWSER = typeof document !== 'undefined';
const REDEBUG = IS_BROWSER && location.search.indexOf('rehydrationDebug') > -1;

if (IS_BROWSER && REDEBUG) {
  /* eslint-disable-next-line no-console */
  console.log(
    'Disabling Ember.warn and Ember.deprecate to allow easier debugging'
  );
  registerWarnHandler(() => undefined);
  registerDeprecationHandler(() => undefined);
}

if (IS_BROWSER && typeof FastBoot === 'undefined' && REDEBUG) {
  const target = document.querySelector('.application-outlet');
  const observer = new MutationObserver(function detectMutation(mutations) {
    // check for removed target
    mutations.forEach(function narrowDOMMutation(mutation) {
      const nodes = Array.from(mutation.removedNodes);
      const directMatch = nodes.indexOf(target) > -1;
      const parentMatch = nodes.some(parent => parent.contains(target));
      if (directMatch) {
        /* eslint-disable-next-line no-console */
        console.error('node', target, 'was directly removed!');
      } else if (parentMatch) {
        /* eslint-disable-next-line no-console */
        console.error('node', target, 'was removed through a removed parent!');
      }
    });
  });

  const config = {
    subtree: true,
    childList: true,
  };
  /* eslint-disable-next-line ember/no-observers */
  observer.observe(document.body, config);
}

const { RehydrateBuilder, NewElementBuilder } = Ember.__loader.require(
  '@glimmer/runtime'
);

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
  const parent = bounds.parentElement();
  const first = bounds.firstNode();
  const last = bounds.lastNode();

  let node = first;

  while (node) {
    const next = node.nextSibling;
    parent.removeChild(node);
    if (node === last) {
      return next;
    }
    node = next;
  }

  return null;
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
    this.startingBlockDepth = startingBlockDepth;
    this.openBlockDepth = startingBlockDepth - 1;
  }
}

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
    const { destroyables } = this;

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
    if (this.nesting !== 0) {
      return;
    }

    if (!this.first) {
      this.first = new First(node);
    }

    this.last = new Last(node);
  }

  didAppendBounds(bounds) {
    if (this.nesting !== 0) {
      return;
    }

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

/** start code from the changes in https://github.com/glimmerjs/glimmer-vm/pull/988/files */

function isOpenBlock(node) {
  return node.nodeType === 8 && node.nodeValue.lastIndexOf('%+b:', 0) === 0;
}

function isCloseBlock(node) {
  return node.nodeType === 8 && node.nodeValue.lastIndexOf('%-b:', 0) === 0;
}

function getBlockDepth(node) {
  return parseInt(node.nodeValue.slice(4), 10);
}

Object.defineProperty(RehydrateBuilder.prototype, 'candidate', {
  get() {
    if (this.currentCursor) {
      return this.currentCursor.candidate;
    }

    return null;
  },

  set(node) {
    const { currentCursor } = this;

    currentCursor.candidate = node;
  },
});

RehydrateBuilder.prototype.disableRehydration = function patchedDisableRehydration(
  nextSibling
) {
  const { currentCursor } = this;

  // rehydration will be disabled until we either:
  // * hit popElement (and return to using the parent elements cursor)
  // * hit closeBlock and the next sibling is a close block comment
  //   matching the expected openBlockDepth
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.warn('disableRehydration', nextSibling);
  }
  currentCursor.candidate = null;
  currentCursor.nextSibling = nextSibling;
};

RehydrateBuilder.prototype.enableRehydration = function patchedEnableRehydration(
  candidate
) {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.log('enableRehydration', candidate);
  }
  const { currentCursor } = this;

  currentCursor.candidate = candidate;
  currentCursor.nextSibling = null;
};

RehydrateBuilder.prototype.pushElement = function patchedPushElement(
  element,
  nextSibling
) {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.log('pushElement', element.tagName, this.blockDepth);
  }
  const cursor = new RehydratingCursor(
    element,
    nextSibling,
    this.blockDepth || 0
  );

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

const originalPopElement = RehydrateBuilder.prototype.popElement;
RehydrateBuilder.prototype.popElement = function patchedPopElement() {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.log('popElement', this.element.tagName);
  }
  return originalPopElement.apply(this, arguments);
};

// clears until the end of the current container
// either the current open block or higher
RehydrateBuilder.prototype.clearMismatch = function patchedClearMismatch(
  candidate
) {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.warn('clearMismatch', candidate);
  }
  let current = candidate;
  const { currentCursor } = this;
  if (currentCursor !== null) {
    const { openBlockDepth } = currentCursor;
    if (openBlockDepth >= currentCursor.startingBlockDepth) {
      while (current) {
        if (isCloseBlock(current)) {
          const closeBlockDepth = getBlockDepth(current);
          if (openBlockDepth >= closeBlockDepth) {
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

RehydrateBuilder.prototype.__openBlock = function patchedOpenBlock() {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.log('openBlock', this.blockDepth);
  }

  const { currentCursor } = this;
  if (currentCursor === null) {
    return;
  }

  const { blockDepth } = this;

  this.blockDepth++;

  const { candidate } = currentCursor;
  if (candidate === null) {
    return;
  }

  const { tagName } = currentCursor.element;
  if (isOpenBlock(candidate) && getBlockDepth(candidate) === blockDepth) {
    this.candidate = this.remove(candidate);
    currentCursor.openBlockDepth = blockDepth;
  } else if (
    tagName !== 'TITLE' &&
    tagName !== 'SCRIPT' &&
    tagName !== 'STYLE'
  ) {
    this.clearMismatch(candidate);
  }
};

RehydrateBuilder.prototype.__closeBlock = function patchedCloseBlock() {
  if (REDEBUG) {
    /* eslint-disable-next-line no-console */
    console.log('closeBlock', this.blockDepth - 1);
  }
  const { currentCursor } = this;
  if (currentCursor === null) {
    return;
  }

  // openBlock is the last rehydrated open block
  const { openBlockDepth } = currentCursor;

  // this currently is the expected next open block depth
  this.blockDepth--;

  const { candidate } = currentCursor;

  let isRehydrating = false;

  if (candidate !== null) {
    isRehydrating = true;

    if (
      isCloseBlock(candidate) &&
      getBlockDepth(candidate) === openBlockDepth
    ) {
      const nextSibling = this.remove(candidate);
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
    const { nextSibling } = currentCursor;
    if (
      nextSibling !== null &&
      isCloseBlock(nextSibling) &&
      getBlockDepth(nextSibling) === this.blockDepth
    ) {
      // restore rehydration state
      const newCandidate = this.remove(nextSibling);
      this.enableRehydration(newCandidate);

      currentCursor.openBlockDepth--;
    }
  }
};

RehydrateBuilder.prototype.__appendText = function patchedAppendText(string) {
  const { candidate } = this;

  if (candidate) {
    if (isTextNode(candidate)) {
      if (candidate.nodeValue !== string) {
        candidate.nodeValue = string;
      }
      this.candidate = candidate.nextSibling;

      return candidate;
    }
    if (isSeparator(candidate)) {
      this.candidate = this.remove(candidate);

      return this.__appendText(string);
    }
    if (isEmpty(candidate) && string === '') {
      this.candidate = this.remove(candidate);

      return this.__appendText(string);
    }
    this.clearMismatch(candidate);

    return NewElementBuilder.prototype.__appendText.call(this, string);
  }

  return NewElementBuilder.prototype.__appendText.call(this, string);
};

RehydrateBuilder.prototype.__pushRemoteElement = function patchedPushRemoteElement(
  element,
  cursorId,
  _insertBefore
) {
  const marker = this.getMarker(element, cursorId);
  let insertBefore = _insertBefore;

  // when insertBefore is not present, we clear the element
  if (insertBefore === undefined) {
    while (element.firstChild !== null && element.firstChild !== marker) {
      this.remove(element.firstChild);
    }
    insertBefore = null;
  }

  const cursor = new RehydratingCursor(element, null, this.blockDepth);
  this.cursorStack.push(cursor);

  if (marker === null) {
    this.disableRehydration(insertBefore);
  } else {
    this.candidate = this.remove(marker);
  }

  const tracker = new RemoteBlockTracker(element);
  this.pushBlockTracker(tracker, true);
};

/* end code changes from https://github.com/glimmerjs/glimmer-vm/pull/988 */

export default {
  initialize() {},
};
