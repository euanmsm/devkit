Every prompt you type at is a full text editor, and most people use it as a dumb
input box. The same keys work in zsh, in `psql`, in `node` — anywhere
readline-style editing runs — so eight keystrokes learned once pay off in every
REPL you'll ever sit in.

## Moving

- `Ctrl-A` — start of the line
- `Ctrl-E` — end of the line
- `Alt-B` / `Alt-F` — back and forward one word

The word keys are the ones people miss. A typo three words back is two `Alt-B`s,
not fifteen taps of the left arrow.

## Deleting — and getting it back

- `Ctrl-W` — delete the word behind the cursor
- `Ctrl-U` — delete everything before the cursor
- `Ctrl-K` — delete everything after it
- `Ctrl-Y` — paste back whatever the last delete took

Deletes go into a buffer, not into the void. `Ctrl-U` then `Ctrl-Y` is how you
set a half-typed command aside: wipe the line, run something else, paste it back
and carry on.

## The escape hatches

- `Ctrl-L` — clear the screen without losing the line you're typing
- `Ctrl-_` — undo the last edit
- `Ctrl-X Ctrl-E` — open the current line in `$EDITOR`

That last one is the fix for a mangled twelve-line command: edit it like a file,
save, quit, and the shell runs what you left behind.

---

There is no gradual path from the arrow keys — these become automatic by
deciding to use them on purpose for a day, wrong-keying a few times, and letting
your fingers take over from there.
