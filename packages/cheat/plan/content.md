# Content

The course catalogue: what we teach, in what order, and where the exercises come
from. The source material is `CONTENT.md` — this file turns its parts into
courses and adds the practice layer it couldn't have on paper.

A course teaches; a guide reminds. Every lesson ends by pointing at the guide
topic that takes over once the course is forgotten — and where that guide
doesn't exist yet (`zsh`, `fzf`, `jq` topics beyond today's six tools), writing
the course is the forcing function to write the guide. The two ship together.

## The catalogue, in build order

Ordered by payoff-per-effort, not difficulty. The first three carry most of the
value in `CONTENT.md`; everything after them can land whenever.

### 1. shell — Your shell, properly

The daily-driver course; everything here is used hundreds of times a day, so it
compounds fastest. From Parts 1–2 of CONTENT.md.

| Lesson      | Teaches                                                | Practice leans on |
| ----------- | ------------------------------------------------------ | ----------------- |
| line-editor | Ctrl-A/E/W/U/K/Y, Alt-B/F, Ctrl-X Ctrl-E, undo         | typed, choice     |
| history     | Ctrl-R via fzf, history settings, `!!` `!$` `^old^new` | recall, typed     |
| aliases     | what earns an alias, functions, your nbs/supabase-prod | recall            |
| globbing    | expansion order, braces, `**`, noglob, quoting         | choice, sandbox   |
| job-control | `&`, Ctrl-Z, bg/fg, disown, nohup, orphaned processes  | recall, sandbox   |
| config      | a .zshrc that earns its keep, and fzf's keybindings    | recall            |

Sandbox sketches: a directory of awkwardly-named files to glob correctly; a fake
long-running process to background, resume, and disown.

### 2. pipeline — Pipes, xargs and the text tools

The course with the highest ceiling — composition is the skill that makes the
terminal worth living in. From Part 2.

| Lesson       | Teaches                                                  | Practice leans on |
| ------------ | -------------------------------------------------------- | ----------------- |
| streams      | pipes, `>` `>>` `2>` `2>&1`, /dev/null, exit codes, `&&` | choice, sandbox   |
| text-tools   | sort, uniq -c, cut, tr, wc, head/tail, column, comm      | recall, sandbox   |
| top-n        | the `sort \| uniq -c \| sort -rn` move, applied          | sandbox           |
| xargs        | -n1, -I{}, -0, -P — lists into commands, in parallel     | recall, sandbox   |
| find         | -name, -type, -newermt, -exec, -print0                   | recall, sandbox   |
| substitution | `<(cmd)`, comparing two commands' output                 | recall, sandbox   |
| sed-awk      | one substitution, print a field, sum a column — no more  | recall            |

This course is sandbox heaven: generate a directory of log files and ask for
"the five most common error codes", "every file mentioning X, word-counted",
"the lines in A not in B". Checks compare the user-produced output file against
the known answer — unambiguous, any route wins.

### 3. git — Git beyond add, commit, push

The largest returns of any single tool, per Part 3, plus the config wins from
Part 1. The existing git guide covers the basics; this course deliberately
starts past them, and its lessons are the source for the missing guide topics
(reflog, bisect, fixup) flagged in CONTENT.md Part 9.

| Lesson        | Teaches                                                  | Practice leans on |
| ------------- | -------------------------------------------------------- | ----------------- |
| staging       | add -p, restore --staged, commit --amend                 | sandbox           |
| history-craft | rebase -i, --fixup + --autosquash, range-diff            | sandbox           |
| time-travel   | reflog, reset soft/mixed/hard, recovering "lost" work    | sandbox, choice   |
| archaeology   | log -S, log -L, blame, --follow, show                    | sandbox, recall   |
| bisect        | bisect, bisect run                                       | sandbox           |
| stash         | push -m, pop, --keep-index                               | recall, sandbox   |
| worktrees     | add, list, remove — several branches at once             | recall, sandbox   |
| config        | rerere, pull.rebase, autoSetupRemote, aliases, histogram | recall            |

The flagship sandboxes live here, each a story: the reset that lost commits
(reflog), the bug introduced eight commits ago with a test script provided
(bisect run), the file with three unrelated changes to split into two commits
(add -p), the typo that belongs in a commit three back (fixup/autosquash). Git
sandboxes are cheap to build declaratively — a setup list of commits — and their
end states are exactly checkable. This is the best
effort-to-value-to-checkability ratio in the whole plan.

### 4. fzf — One tool, everywhere

Small surface, hourly payoff, and the guide doesn't exist yet — course and guide
written together. From Part 1.

Lessons: keybindings (Ctrl-R/T, Alt-C) · as-a-filter (piping lists in, fuzzy
syntax, --multi) · preview (file browsing, bat when present) · recipes (git
branch picker, npm script runner, kill-by-name). Mostly recall and typed;
interactive fzf itself can't run inside a session, so sandboxes don't apply.

### 5. rg — You own it, you use a fifth of it

From Part 5. Lessons: filtering (-t, -g, --hidden) · reading results (-C, -l,
-c, -o) · harder patterns (--multiline, -F, word boundaries) · as-a-source
(--json, piping into xargs and fzf). Sandboxes: a small codebase to answer
questions about — "which files call X but not Y?".

### 6. jq — From field access to fluency

From Part 5. Lessons: paths and iteration · select and map · shaping output (-r,
@csv, string interpolation) · defaults and args (`//`, --arg). Sandboxes: a
real-shaped JSON file (a gh api response) and questions with exact expected
output — perfectly checkable.

### 7. debug — When something is broken

Part 6, turned into drills — these commands are needed rarely and suddenly,
which is precisely what spaced repetition is for. Lessons: ports-and-processes
(lsof, pgrep/pkill — pointing at the existing lsof guide) · http (curl -v, -I,
timing, --resolve) · dns (dig, +short, @server) · disk (df, du, ncdu-shaped
thinking). Practice is recall-heavy by design; a sandbox that plants a listening
process to find and kill is the one genuinely great sandbox here.

### 8. macos — The Mac-shaped tools

Part 7. One or two lessons: pbcopy/pbpaste, open, mdfind, caffeinate, brew
leaves/bundle, defaults, trash. Almost pure recall cards; this course exists
mainly to feed the drill deck.

### 9. scripting — Small tools you keep

Part 8, last because it synthesises the others. Lessons: skeleton (set -euo
pipefail, shebangs) · quoting (the eats-people-alive lesson) · arguments and
flow ($@, ${var:-default}, case) · composing (reading stdin, exiting honestly) ·
when-to-stop (past ~100 lines, write TypeScript — this repo as the proof).
Sandboxes: fix a broken script (quoting bugs, missing pipefail) until its
provided test passes — shellcheck-shaped puzzles without needing shellcheck.

## Deliberately out of the catalogue

- **Stack CLIs** (supabase, vercel, docker, gh): guides yes — gh and supabase
  already have them — but courses no, for now. Their workflows are
  project-shaped and drift with the product; courses teach the durable layer
  underneath. Their guides join the drill deck via `drill: true` items instead,
  which gets them into daily practice without course upkeep. The one exception
  shipped so far is `stacks`: stacked pull requests are a workflow you think in
  rather than a product surface, so the course teaches the workflow and leaves
  every flag to the `gh --stack` guide.
- **Tools not yet adopted** (zoxide, delta, tmux, ast-grep…): CONTENT.md's rule
  stands — the course is written when the tool is adopted, as the way of
  adopting it.
- **Machine-specific state** ("you have no aliases", "your gitconfig is five
  lines"): stays in CONTENT.md. Courses teach the tool, not this laptop's
  current condition — that's what keeps them from rotting.

## Rollout

Phase 1 ships `shell` complete (lessons only), proving the reading experience.
Phase 2 adds its exercises plus the recall/choice/typed formats. Phase 3
(drills) lands with `debug` and `macos` — the card-heavy courses that make a
daily `cheat drill` worth having — plus the first `drill: true` pass over the gh
and git guides. Phase 4 (sandboxes) lands with `git`, its best customer, then
backfills sandboxes into `pipeline`. From there, one course at a time, each
bringing its guide along.
