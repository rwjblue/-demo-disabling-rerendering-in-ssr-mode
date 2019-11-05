# demo-disabling-rerendering-in-ssr-mode

When using the serializion builder in FastBoot (aka SSR), any updates that are
ran invalidate and break the serialization comment nodes that are emitted. This
means that when the application attempts to rehydrate, it will throw errors
(because the expected markers are no longer present, they were removed by the
update opcodes).

This repo demonstrates that it is possible to prevent Ember from attempting to
update _any_ DOM elements after they are rendered initially. Please note though,
that this is a double edged sword: if your loading state is rendered on the
first pass that is **exactly** what will be serialized.

## Demo Details

This repo contains a component named `x-slow`. When this component is rendered,
it displays the text "Hiding!" but also schedules an update (via
`Ember.run.schedule('afterRender'`) to change the displayed text to `Showing!`.
Without the changes added in
`fastboot/initializers/disable-rerenders-in-ssr.js` the FastBoot rendered
content (viewed in network tab of devtools, or via curl) is the **updated**
value. After these changes, the value emitted from SSR is `Hiding!`
(appropriately).
