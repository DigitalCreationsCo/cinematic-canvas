Use narrow selectors, one subscription per logical slice.

If `subscribeWithSelector` is used within a given the store, each store selector call re-renders this component ONLY when that selector's output changes.

`useShallow` prevents re-render when the output array/object is structurally identical to the previous one, even though .map() produces new refs.