# interact

The menus. At a terminal, `crib`, `crib gh` and `crib learn` open an arrow-key
selector instead of printing a list of commands to retype; anything piped,
redirected, given real topic arguments, or run with `--print` takes the printing
paths untouched.

## The one rule here

This directory owns every escape code and every keypress in the codebase.
`select.mjs` draws with exactly four sequences — cursor-up, erase-down, hide
cursor, show cursor — and `keys.mjs` is the only file that touches raw mode.
Nothing else in the repo knows the terminal can do either. There is no alternate
screen and no full-screen ownership: a menu draws in place, erases itself when
it's done, and whatever it caused to print lands in normal scrollback, pager and
all.

## The files

| File         | Job                                                        |
| ------------ | ---------------------------------------------------------- |
| `keys.mjs`   | Raw mode in, typed keypresses out; all cleanup lives here. |
| `select.mjs` | The in-place list: cursor, filter, scroll window.          |
| `browse.mjs` | Which menu leads where, and what enter presents.           |

`browse.mjs` renders nothing itself — enter hands the same lines the printed
paths produce (`renderTopic`, `renderWholeGuide`, `renderLesson`) to
`io.present`, and a lesson read from a menu gains its ✓ through the same
`progress.mjs` calls. One deliberate difference from the printed side: menus
page **every** screen, however short, so enter always opens the pager view and q
always returns to the menu — the print-if-it-fits rule stays with typed
commands, where it belongs. `--no-pager` and `NO_PAGER` still force printing.

## Keys

Arrows (or ctrl-p/ctrl-n) move, enter opens, esc goes up a level — root esc
exits. Typing filters the list; while a filter is active every printable
character belongs to it, so `q` quits only when the filter is empty, and esc
clears the filter before it means "back". Ctrl-c leaves immediately from
anywhere. All of it exits 0 — walking away from a menu is not an error.

## Safety

Raw mode and the hidden cursor are restored in `close()`, and again on process
exit as a belt-and-braces net, so a crash mid-menu can't leave the shell eating
keystrokes. `keys.mjs` pauses stdin on close, which is what hands the keyboard
to the pager while a topic is being read. A resize mid-menu corrects on the next
keypress — size is re-read every draw, and that's deliberate v1 simplicity.

## Testing

`scriptedKeys` and `press("down", "return")` in `keys.mjs` drive everything
without a terminal: `test/select.test.mjs` covers the selector's behaviour,
`test/browse.test.mjs` scripts whole journeys and asserts the sequence of
presented screens. The real-PTY run (spawn crib under `expect`, walk the menus,
check the ✓ appears) is a manual check, not part of `npm test`.
