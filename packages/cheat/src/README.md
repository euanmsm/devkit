# src

The code that turns arguments into screens. The reference sheets themselves are
data, and they live in [`guides/`](guides/README.md).

## The one rule

Content never knows how it will be printed, and printing never knows what it is
printing about. Everything under `guides/` is plain objects matching the types
in `types.mjs`. Everything under [`render/`](render/README.md) takes those
objects and returns strings. Neither side imports the other, so you can add a
tool without touching the printing, and change how a flag looks without opening
a single guide.

## What happens on a run

Take `cheat gh --pr`:

1. `bin/cheat.mjs` hands `["gh", "--pr"]` to `run()` in `cli.mjs`.
2. `cli.mjs` asks `registry.mjs` whether a tool called `gh` exists. It does, so
   it loads it — and only it. `git`, `supabase` and the rest are never read.
3. `resolve.mjs` works out that `--pr` means the topic named `pr`.
4. `render/layout.mjs` measures `gh`'s longest name against the window and
   settles on one column for the whole guide.
5. `render/` turns that topic into a list of strings at that layout.
6. `cli.mjs` hands the finished screen to `Io.present` and returns an exit code.

Nothing between those steps holds state, and nothing is cached between runs.

## The files

| File           | Job                                                           |
| -------------- | ------------------------------------------------------------- |
| `types.mjs`    | What a guide, topic, section and item are. Start here.        |
| `registry.mjs` | Which tools have guides, and how to load one.                 |
| `resolve.mjs`  | Which topic someone meant, given what they typed.             |
| `cli.mjs`      | Arguments in, screens out, exit code back.                    |
| `pager.mjs`    | Whether to hand a long screen to `$PAGER`, and doing it.      |
| `render/`      | Objects to strings. See [render/README.md](render/README.md). |
| `guides/`      | The content. See [guides/README.md](guides/README.md).        |
| `learn/`       | The learning half. See [learn/README.md](learn/README.md).    |
| `interact/`    | The menus. See [interact/README.md](interact/README.md).      |

## Decisions worth knowing about

**`run()` takes its input and output as an argument.** The `Io` object in
`cli.mjs` carries the write functions, the environment, the terminal's size, and
whether the output is a terminal at all. Real runs get the process versions;
tests pass in functions that push onto an array. That is why the tests can check
exactly what gets printed without capturing `process.stdout`, and why no file
below `cli.mjs` reaches for a process global.

**A screen is built in full before any of it is written.** `Io.present` is
called once, with every line. It has to be: whether the output goes to a pager
depends on how many lines it turned out to be, which you only know at the end.
Errors still go out line by line through `Io.err`.

**Nothing reads `COLUMNS`.** Width comes from `process.stdout.columns`, falling
back to 80 whenever the output is not a terminal, so a redirected screen is the
same on every machine and `test/fixtures/lsof.txt` stays stable. `CHEAT_WIDTH`
overrides it for looking at a layout you are not sitting at.

**Guides are imported lazily.** `registry.mjs` holds each tool's name and
one-line summary directly, and the guide itself behind a function that imports
it. So `cheat` with no arguments can list every tool without reading any of
their content, and `cheat gh --pr` reads `gh` alone. Adding another tool does
not slow down the ones already there.
