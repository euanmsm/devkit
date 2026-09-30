# reading-order

Writes a reading order for the current branch: a short numbered list of links to
the files a reviewer should open, in the order that makes the change easiest to
follow, with a few words of guidance where a file would otherwise be read the
wrong way.

It reads the branch's diff over `baseBranch` and the code around it before
ordering anything, so the list follows how the change works rather than how the
files happen to be named. It never edits code, stages or commits.

## Running it

```
/reading-order            # diff over baseBranch
/reading-order <branch>   # diff over another base
```

## What it does

1. **Finds the diff.** It diffs the branch against the commit it left the base
   at, preferring `origin/<base>` when that is further along, as the other
   skills do. Only committed changes count, since that is what the PR shows;
   uncommitted ones are mentioned in the reply and left out. When a PR is open,
   its title and description are read for context.
2. **Understands the change.** It reads the whole diff and whatever code around
   it it needs, until it can say what the branch does, which files the change is
   really about, which files only changed mechanically, and whether a doc
   explains the design faster than the code.
3. **Orders the files.** Something is read before anything that depends on it,
   and the why before the how: design docs first, then the data the change is
   built on, then the core files with each one's tests straight after it, then
   the code that calls them, working outward. Renames, import-path changes,
   formatting and generated files go in an unnumbered Skim list at the end,
   grouped where they can be. Every changed file appears exactly once.
4. **Adds notes sparingly.** A note is a few words after the link — which
   function to read, or what to hold in mind. Most files get none. Review
   findings go in the reply, never in the file.
5. **Writes and checks the file.** It checks every link opens, every changed
   file is listed, and warns when the file is not git-ignored.

## The file

`<outputDir>/<branch>/reading-order.tmp.md` at the repository root, where
`<branch>` is the branch name after its last `/`. Running it again overwrites
the file. Links are relative to the file, so they open straight from the editor.

```text
# Reading order — CUR-1450 Engine refresh

## Core

1. [session.ts](<../../src/lib/auth/session.ts>) — public API only
2. [startEngine.ts](<../../src/lib/auth/_session/startEngine.ts>) — `handleAuthEvent`
3. [session.test.ts](<../../src/lib/auth/__tests__/session.test.ts>)

## Callers

4. [useConversation.ts](<../../src/features/chat/useConversation.ts>)

## Skim

- All other `_hooks/*.ts` files — import path change only
```

Add `outputDir` to the repository's `.gitignore`, or the file can be committed
by accident.

## Options

| Option      | Default | What it is                                                                   |
| ----------- | ------- | ---------------------------------------------------------------------------- |
| `outputDir` | `tmp`   | The folder, relative to the repository root, the reading order is written in |

The skill also uses the shared `skillsDir` and `baseBranch` settings.

## Files it writes

| File                                 |
| ------------------------------------ |
| `<skillsDir>/reading-order/SKILL.md` |
