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
