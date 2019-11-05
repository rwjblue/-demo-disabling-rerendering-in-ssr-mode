import Component from '@ember/component';
import { schedule } from '@ember/runloop';

export default Component.extend({
  init() {
    this._super(...arguments);

    this.show = false;
  },

  didReceiveAttrs() {
    schedule('afterRender', () => {
      this.set('show', true);
    });
  }
});
