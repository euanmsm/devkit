### A `//` comment is never required

Write one only when the code alone leaves a competent reader unsure, which means
one of:

- a **workaround** — a bug, quirk or limit in a library or service
- a **constraint invisible in the code** — ordering that matters, a race, timing
- the **origin of a magic value**
- **why the obvious approach fails**, where the code takes a stranger path
- **what a regex matches**

Restating the logic in English is an anti-pattern. The reader can read the code.

> **The test:** if deleting the comment loses nothing a competent reader would
> get from the code in five seconds, it should not exist.
