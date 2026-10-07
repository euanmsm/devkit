---
name: reading-order
description:
  "Write a reading order for the current branch's diff over its parent branch: a
  short numbered list of links to the files a reviewer should read, in the order
  that makes the change easiest to understand, with a brief note where one
  helps. Use when asked for a reading order, a review path, or where to start
  reading a PR."
user-invocable: true
---

{{marker}}

# Reading Order

Writes `{{outputDir}}/<branch>/reading-order.tmp.md`: an ordered list of links
to the files a reviewer should open, so that by the time they reach each file
they already know what it depends on and why it changed.

**The list is the deliverable, and it must stay thin.** It is not a summary of
the PR and not a review. A reviewer should be able to take it in at a glance and
then just start clicking. Most entries are a bare link; a note is added only
where the reviewer would otherwise read the file the wrong way.

```
/reading-order            # diff over the branch's parent
/reading-order <branch>   # diff over another base
```

It never edits code, stages or commits. The only file it writes is the reading
order.

## 1. Find the diff

Run from the repository root:

```bash
BASE_VARS="$(npx --no-install skills base --base "<the branch given, or empty>")" && eval "$BASE_VARS"
echo "base: $BASE_BRANCH ($BASE_SOURCE)"
echo "fork: $FORK"
git rev-parse --abbrev-ref HEAD
git log --oneline "$FORK"..HEAD
git diff --stat "$FORK" HEAD
git diff --name-status "$FORK" HEAD
git status --porcelain
```

Shell variables do not survive from one command to the next, so write the fork
commit out literally in every later command.

`skills base` finds the branch's parent: the branch given, else the base of its
open PR, the branch below it in a `gh stack`, or the parent git recorded when it
was created, and `{{baseBranch}}` only when none of those answers. A stacked
branch's reading order then covers its own commits, not its parents'. It
fetches the base and uses the local copy or `origin/`, whichever the branch
left later. Name the base and its source in your reply, and pass on any
`warning:` line.

- Stop if `skills base` exits non-zero (show what it printed), or if the branch
  has no commits over the base — there is nothing to read.
- The reading order covers the committed diff only, which is what the PR shows.
  If `git status --porcelain` lists changes, mention in your reply that they
  were left out.
- If a PR is open for the branch, `gh pr view --json number,title,body` gives
  its title and the author's own account of the change. A failure here just
  means there is no PR; carry on without it.

## 2. Understand the change

Read the whole diff (`git diff <fork> HEAD`), then open whatever you need around
it — the rest of a changed file, the code it calls, the code that calls it —
until you can answer:

- What does this branch set out to do, in one sentence?
- Which file or two is the change really about? Everything else either feeds
  into those files or reacts to them.
- Which files only changed mechanically — a rename, an import path, formatting,
  a regenerated file, a lockfile — and need no real reading?
- Is there a doc, plan or convention file, changed or not, that explains the
  design faster than the code would?

Do not write anything until you can answer all four. An order built from file
names alone is just the diff sorted differently.

## 3. Choose the order

The rule behind every choice: **read a thing before anything that depends on it,
and read the why before the how.** In practice that usually means:

1. **Intent** — docs, plans, ADRs or convention files that explain the design.
   An unchanged doc belongs here only when it is the quickest way to understand
   the change; say which section to read.
2. **Shape** — the data the change is built on: migrations, schemas, shared
   types, config.
3. **Core** — the file or files the change is really about, in the order their
   logic runs. Put each file's tests straight after it, while the code is fresh.
4. **Outward** — the code that uses the core: services, routes, hooks, then UI.
   Follow the direction a call travels.
5. **Skim** — mechanical changes. Group them where you can, such as "All other
   `_hooks/*.ts` files — import path change only".

Skip a section the branch does not touch, and rename sections to fit the change
("Fetch layer", "Callers") when that tells the reviewer more than the generic
name. Every file in the diff appears exactly once: in the numbered list, or
under Skim.

## 4. Write the notes

A note goes after the link, following an em dash, and is a few words — never
more than one short sentence. Add one only when it changes how the file is read:

- Where to look in a long file: "`handleAuthEvent` only", "public API only".
- What to hold in mind: "the old retry loop is gone; errors now bubble up".
- Why a file that looks unrelated is here: "moved from `utils/`, unchanged".

Do not describe what a file does when its name already says it, do not repeat
the PR summary, and do not give review findings. If you spot a bug, mention it
in your reply, not in the file.

## 5. Write the file

Write to `{{outputDir}}/<branch>/reading-order.tmp.md` at the repository root,
where `<branch>` is the branch name after its last `/`
(`euan/cur-1450-engine-refresh` becomes `cur-1450-engine-refresh`). Overwrite an
older reading order at that path.

Links are relative to the file's own folder, so they open from the editor. Wrap
each path in angle brackets, which keeps brackets, parentheses and spaces in a
path working. Use the file name as the link text, adding its parent folder when
two names clash. A deleted file has nothing to open: write its path in code
formatting, with no link.

```text
# Reading order — <PR title, else branch name>

## Docs

1. [session-lifecycle.md](<../../docs/auth/session-lifecycle.md>) — "What happens"

## Core

2. [session.ts](<../../src/lib/auth/session.ts>) — public API only
3. [startEngine.ts](<../../src/lib/auth/_session/startEngine.ts>) — `handleAuthEvent`
4. [session.test.ts](<../../src/lib/auth/__tests__/session.test.ts>)

## Callers

5. [useConversation.ts](<../../src/features/chat/useConversation.ts>)
6. [callback/page.tsx](<../../src/app/(auth)/callback/page.tsx>)

## Skim

- All other `_hooks/*.ts` files — import path change only
- `src/lib/auth/legacyRefresh.ts` — deleted
```

Numbers run on across sections, so the reviewer always knows how far through
they are. Skim entries are not numbered.

## 6. Check it

Confirm every link opens:

```bash
FILE=<the reading order's path>
DIR="$(dirname "$FILE")"
grep -o '](<[^>]*>)' "$FILE" | sed 's/^](<//; s/>)$//' | while IFS= read -r link; do
  test -e "$DIR/$link" || echo "BROKEN: $link"
done
```

Then check every path in `git diff --name-only <fork> HEAD` appears in the file
— as a link, a deleted path or inside a Skim group. Fix anything broken or
missing before replying.

Finally, `git check-ignore -q "$FILE" || echo "NOT IGNORED"`. If the file is not
ignored, say so in your reply, so it does not get committed by accident.

## 7. Reply

Give the file's path, one sentence on what the branch does, and how many files
the reviewer needs to read against how many they can skim. Do not paste the list
into the reply; the file is the list.
