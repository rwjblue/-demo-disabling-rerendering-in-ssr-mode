import Ember from 'ember';
import Application from '@ember/application/instance';

const InertRenderer = Ember.__loader.require('ember-glimmer').InertRenderer;

// ember normally checks this at the end of each runloop (to determine if it
// should schedule another revalidation), since we **never** want to revalidate
// in ssr mode we hard code this to `true`
InertRenderer.prototype._isValid = function() {
  return true;
};

// ember calls this at the beginning of every run loop, it is responsible for
// queuing up the revalidation. but in this case, we never want revalidation
// so we do nothing
InertRenderer.prototype._scheduleRevalidate = function() {};

export default {
  name: 'disable-rerenders-in-ssr',
  initialize() {}
}
