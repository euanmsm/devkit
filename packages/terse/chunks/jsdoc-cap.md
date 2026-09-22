### JSDoc is {{jsdocProseMax}} prose lines, plus one line per tag

A one-line summary, then `@param` for every parameter and `@returns` for every
non-void return. Tag lines do not count against the cap. No body prose, and no
tag wrapping onto a second line. An object or destructured parameter gets one
`@param` for the object, not one per property.
