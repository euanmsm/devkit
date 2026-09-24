# guides

The content. One directory per tool, one file per topic, and no code that does
anything — every file here exports a plain object. Most contributions to this
project are made here.

## Shape

A **guide** is one tool, e.g. `gh`. It has a banner title, a one-line summary,
an intro of global flags and standing caveats, and a list of topics.

A **topic** is one slice of that tool, reached by `crib gh --pr`. It has the
name you type, a one-line description for the menu, and one or more sections.

A **section** is a heading plus a list of items. Most topics have exactly one;
`gh actions`, `gh config` and `gh secrets` have several because the underlying
commands genuinely fall into separate groups.

An **item** is a line on screen. Five kinds:

| Kind     | Renders as                                 | Use it for                        |
| -------- | ------------------------------------------ | --------------------------------- |
| `cmd`    | Indented 2, green, description at col 45   | A command                         |
| `flag`   | Indented 4, magenta, description at col 40 | An option on the command above    |
| `subcmd` | Indented 4, blue, description at col 42    | A subcommand of the command above |
| `note`   | Indented 2, grey prose                     | A caveat, a default, a gotcha     |
| `gap`    | An empty line                              | Holding a trailing note apart     |

`flag`, `subcmd`, `note` and `gap` go in a `cmd`'s `children` array, which is
what puts them underneath it and indented. The full definitions are in
[`../types.mjs`](../types.mjs).

## Adding a topic

Create `src/guides/<tool>/<topic>.mjs`:

```js
export const worktree = {
  name: 'worktree',
  description: 'Working with several checkouts at once',
  sections: [
    {
      title: 'worktree — Multiple working trees',
      items: [
        {
          kind: 'cmd',
          name: 'git worktree add <path> <branch>',
          desc: 'Check a branch out alongside this one',
          children: [
            {
              kind: 'flag',
              name: '-b <new-branch>',
              desc: 'Create the branch too',
            },
          ],
        },
      ],
    },
  ],
};
```

Then import it in that tool's `index.mjs` and add it to the `topics` array. The
order there is the order of the menu — group related topics together rather than
alphabetising.

## Adding a tool

Create `src/guides/<tool>/index.mjs` exporting a `Guide`, put the topic files
beside it, and add one entry to [`../registry.mjs`](../registry.mjs). Keep that
list alphabetical; a test enforces it.

Set `menu: false` on the guide when it is short enough to print in full with no
menu at all. `lsof` is the only one that does — four topics, and a menu would be
more keystrokes than just reading it.

## Writing conventions

Descriptions are terse and lowercase-ish, matching the tool's own `--help`
wording where that is clear and improving on it where it isn't. They are read at
a glance, not studied, so "Select branch" beats "Allows you to select which
branch to open".

Keep `name` fields exactly as you would type them, placeholders included:
`gh browse [<number>|<path>|<sha>]`, `-b, --branch <branch>`.

Topic names must be lowercase, start with a letter, and contain only letters,
digits and hyphens — they are what someone types. `all` is reserved for the
whole guide.

Long descriptions are not wrapped for you. The first column is padded to a fixed
width (45, 40 or 42 characters depending on the kind) and a name longer than
that simply pushes the description right, which a handful of long command names
already do. Aim to keep the whole line under about 100 characters.

## What the tests check

`npm test` runs `test/guides.test.mjs` against every guide in the registry, so a
new one cannot be added half-wired. It fails if a topic name is not typeable,
duplicated, called `all`, missing a description, or renders to almost nothing;
if a guide disagrees with the registry about its own name; or if the registry
falls out of alphabetical order.

None of that checks whether the content is _correct_ — only that it is wired up
and printable. Getting the flags right is on you.
