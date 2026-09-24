# Becoming fast in the terminal

What to learn, in the order the time saved justifies. Written against your
actual machine — macOS, zsh, Node via `fnm`, a Next.js/Supabase/Vercel stack —
not a generic list.

Read the shape first: **most of your speed is not sitting in tools you haven't
installed.** It's sitting in two config files you already have. `~/.zshrc` has
no aliases and doesn't load fzf's key bindings. `~/.gitconfig` is five lines
long and has no aliases. Those are the first hours, and they cost nothing to
install.

---

## Part 1 — Free wins in configs you already have

### fzf key bindings

You have fzf, but only as a command you can pipe into. The shell integration is
one line you're missing:

```bash
eval "$(fzf --zsh)"   # add to ~/.zshrc
```

That gives you three keystrokes:

- **Ctrl-R** — fuzzy search your entire shell history instead of pressing Up
  forty times. This alone is the single highest-value change on the page.
- **Ctrl-T** — fuzzy-pick a file path and paste it onto the current line. Type
  `code ` then Ctrl-T rather than typing out `src/guides/openclaw/gateway.mjs`.
- **Alt-C** — fuzzy-pick a directory and `cd` into it.

Then learn fzf as a filter you pipe into, because it turns any list into a
picker: `git branch | fzf`, `rg --files | fzf`, `npm run | fzf`. Learn
`--preview` (show file contents beside the list), `--multi` (Tab to select
several), and the fact that fzf matching is fuzzy — `gudg` finds
`guides/gh/gist.mjs`.

### zsh history settings

Ctrl-R is only as good as the history behind it. Worth knowing and setting:
`HISTSIZE`/`SAVEHIST` (default is small — make it 100,000), `SHARE_HISTORY` (a
command typed in one tab is available in another), `HIST_IGNORE_ALL_DUPS`, and
`HIST_REDUCE_BLANKS`.

### The line editor keys

You are typing on a full text editor and probably using it as a dumb input box.
These work in zsh, in `psql`, in `node`, in most REPLs:

- `Ctrl-A` / `Ctrl-E` — start and end of line
- `Alt-B` / `Alt-F` — back and forward one word
- `Ctrl-W` — delete the word behind the cursor
- `Ctrl-U` / `Ctrl-K` — delete to start / to end of line
- `Ctrl-Y` — paste back what you just deleted
- `Ctrl-L` — clear the screen without losing the line you're typing
- `Ctrl-_` — undo

Plus zsh's own: `Ctrl-X Ctrl-E` opens the current command line in `$EDITOR`,
which is how you fix a mangled twelve-line command instead of retyping it.

### History expansion

- `!!` — the previous command. `sudo !!` is the classic.
- `!$` — the last argument of the previous command. `mkdir foo && cd !$`.
- `!rg` — the last command starting with `rg`.
- `^old^new` — rerun the last command with one substitution.

### Aliases and shell functions

You have none. The rule for what earns one: anything you type more than a few
times a day, and anything you have ever got wrong. Candidates from your own work
— `g` for git, `gs` for `git status -sb`, `nrd` for `npm run dev`, `crib` you
already symlink. Your `nbs` and `supabase-prod` functions show you already know
how to write these; you just haven't done it for the small stuff.

### Git configuration

Your `~/.gitconfig` handles signing and nothing else. What's missing and pays
back immediately:

- **Aliases** — `git st`, `git co`, `git lg` (a one-line graph log). Every one
  of these is typed dozens of times a day.
- `pull.rebase = true` — stops merge commits appearing every time you pull.
- `rerere.enabled = true` — git remembers how you resolved a conflict and
  replays that resolution next time the same conflict appears. Invaluable during
  a long rebase.
- `diff.algorithm = histogram` — noticeably better diffs on refactored code.
- `push.autoSetupRemote = true` — `git push` on a new branch just works, no
  `--set-upstream` dance.
- `column.ui = auto`, `branch.sort = -committerdate` — branches listed
  newest-first instead of alphabetically.
- `init.defaultBranch = main`.
- `core.pager` — where `delta` plugs in later (Part 4).

---

## Part 2 — Core Unix, which never expires

These outlive every tool below. Learn them once and they apply on any machine
you ever touch, including servers where nothing is installed.

**Composition.** Pipes (`|`), redirection (`>`, `>>`, `2>`, `2>&1`, `&>`), and
`/dev/null`. The mental model that everything is a stream of lines, and each
tool does one transformation. This is the whole game.

**xargs.** Turn a list of lines into arguments for another command.
`rg -l TODO | xargs wc -l`. Learn `-n1`, `-I{}` for placing the argument in the
middle, `-0` with `find -print0` for filenames containing spaces, and `-P8` —
which runs eight at once and is the cheapest parallelism you will ever get.

**Process substitution.** `diff <(cmd-a) <(cmd-b)` compares two commands' output
without writing temp files. Comparing prod and local schema dumps is exactly
this.

**The text pipeline.** `sort`, `uniq -c` (count duplicates — with
`sort | uniq -c | sort -rn` this is the "top N" of everything), `cut`, `tr`,
`wc -l`, `head`/`tail`, `tail -f`, `column -t`, `comm`, `paste`. Then enough
`sed` to do a substitution and enough `awk` to print a field and sum a column.
You do not need more awk than that.

**find.** `find . -name '*.ts' -newermt '2 days ago'`, `-type f`, `-size`,
`-delete`, `-exec ... +`. Slower to type than `fd` but present everywhere.

**Globbing.** Shell expansion happens before your command runs, which is why
`rg foo *.ts` behaves oddly. Brace expansion (`mv file.{ts,bak}`), zsh's `**/`
recursive glob, and `noglob` for when you want the literal string.

**Job control.** `&`, `Ctrl-Z`, `bg`, `fg`, `jobs`, `disown`, `nohup`. You've
already been bitten by orphaned `next` processes — that's what your `zshexit`
hook is for — so this one is personal.

**Exit codes and signals.** `$?`, `&&` versus `||` versus `;`, what SIGTERM and
SIGKILL actually differ on, and why `kill -9` should be the second thing you
try.

**Permissions.** `chmod +x`, the octal digits, `chown`, and when `sudo` is
genuinely the answer rather than a way to make an error message go away.

**Getting help.** `man`, `--help | rg <thing>`, `type`/`which`/`command -v`, and
`less` navigation — `/` to search, `n`/`N`, `g`/`G`, `q` — since your own `crib`
pages through it.

---

## Part 3 — Git properly

You use git constantly, so the returns here are the largest of any single tool.
Roughly in order of payoff:

- **`git add -p`** — stage selected hunks, not whole files. Changes how you
  commit: you stop bundling three unrelated things because they touched the same
  file.
- **`git commit --fixup <sha>` + `git rebase -i --autosquash`** — mark a commit
  as "this fixes that earlier one" and let rebase slot it in automatically. This
  is how you keep a clean history without hand-editing a rebase todo list.
- **`git rebase -i`** in general — reorder, squash, edit, drop, split.
- **`git reflog`** — every commit your branch has pointed at, including ones you
  "lost". Almost nothing in git is actually destroyed, and this is how you get
  it back. Learn it _before_ you need it.
- **`git stash`** with `push -m`, `list`, `pop`, `--keep-index`.
- **`git log -S 'someString'`** — find the commit that introduced or removed a
  string. `git log -L :func:file.ts` follows one function's whole history.
- **`git blame`**, and then `git log --follow` when the file was renamed.
- **`git bisect`** — binary search the history for the commit that broke
  something. `git bisect run <script>` automates it entirely.
- **`git worktree`** — several branches checked out at once, in separate
  directories, sharing one clone. You already work in worktrees; worth knowing
  the full command set.
- **`git restore`** and **`git switch`** — the modern, unambiguous replacements
  for the many meanings of `git checkout`.
- **`git reset`** — the difference between `--soft`, `--mixed` and `--hard`,
  which is the thing most people never quite pin down.
- **`git range-diff`** — compare two versions of a branch, so you can see what
  actually changed between force-pushes.
- **`git maintenance start`** — background housekeeping, keeps big repos quick.

---

## Part 4 — Tools worth installing, ranked

Ranked by how often you'd touch them. Everything here is one `brew install`.

### Tier 1 — you'll use these hourly

- **zoxide** — `z crib` jumps to `~/Coding/crib` from anywhere, learning from
  the directories you actually visit. Replaces most `cd`.
- **bat** — `cat` with syntax highlighting, line numbers and paging. Its real
  value is as fzf's preview command, which turns file-picking into
  file-browsing.
- **fd** — `find` with sane defaults: respects `.gitignore`, skips `.git`, regex
  by default. `fd guides` versus
  `find . -name '*guides*' -not -path './node_modules/*'`.
- **delta** — a pager for git that syntax-highlights diffs, shows them
  side-by-side, and highlights the changed words within a line. Set once in
  `~/.gitconfig` and every `git diff`, `git show` and `git log -p` improves.
- **eza** — `ls` with colours, icons, a `--tree` mode, and git status per file.
- **tldr** — the practical examples a man page doesn't give you. Note that this
  is `crib`'s nearest relative; worth reading a few of its pages for how they
  present things.

### Tier 2 — real force multipliers, slightly more to learn

- **atuin** — replaces Ctrl-R with a searchable SQLite database of your history:
  filter by directory, by exit status, by host, with stats. If you like fzf's
  Ctrl-R, this is the next step up.
- **mise** (or **direnv**) — per-directory environment. Walk into a repo and the
  right Node version and the right env vars are already loaded. `mise` would
  also replace `fnm`, and manages Python/Deno/anything else the same way.
- **tmux** (or **zellij**) — sessions that survive a closed terminal and a
  dropped SSH connection, split panes, and a dev server that keeps running while
  you go elsewhere. Zellij is far easier to learn; tmux is what you'll find on
  other people's servers.
- **lazygit** — a full terminal UI over git. Best thing in existence for staging
  individual hunks and for interactive rebase, even if you drive git from the
  command line the rest of the time.
- **watchexec** (or **entr**) — rerun a command whenever files change.
  `watchexec -e ts npm test` is a test watcher for anything, in any language.
- **yq** — jq for YAML. Every config file you own is YAML or TOML.
- **jless** (or **fx**) — an interactive viewer for large JSON, for when
  `jq | less` has stopped being enough.

### Tier 3 — sharp tools for specific jobs

- **httpie** or **xh** — `http POST :3000/api/x name=euan` instead of a curl
  incantation with four flags. Keep learning curl too; it's on every machine.
- **hyperfine** — proper benchmarking of commands, with warmups and statistics,
  rather than running `time` three times and squinting.
- **sd** — find-and-replace with a syntax you can remember, unlike `sed`.
- **ast-grep** — search and rewrite code by its _structure_, not by text.
  `ast-grep -p 'useEffect($$$)'` finds every hook call regardless of formatting.
  This is the big one for codemods across a TypeScript codebase.
- **difftastic** — a diff that understands syntax, so reindenting a block
  doesn't show as fifty changed lines.
- **just** — a task runner that is simply a list of named commands. Better than
  `make` for this, because it isn't secretly a build system with opinions about
  tabs.
- **gum** — prompts, spinners and menus for your own shell scripts, so a script
  you wrote can ask a question without you writing `read` loops.
- **dust** / **ncdu** — what's eating the disk, answered visually.
- **btop** — `top` you can actually read.
- **shellcheck** and **shfmt** — lint and format shell scripts. Shell has many
  sharp edges and shellcheck knows all of them.

### Tier 4 — worth knowing exist

`age` and `sops` for encrypting files in a repo; `croc` for sending a file
between machines; `pandoc` for converting documents; `parallel` when `xargs -P`
isn't enough; `mtr` for tracing a flaky network path; `tokei` for counting the
code in a repo.

---

## Part 5 — Your own stack, driven from the terminal

**Node and npm.** `npx` versus `npm exec`; `npm ls <pkg>` to find why something
is installed; `npm outdated`; `npm run` with no arguments to list scripts;
`--workspace` for monorepos; `node --watch` and `node --test` (which this repo
already uses); `NODE_OPTIONS`. Worth trying `pnpm` for the disk and install-time
saving, and `bun` as a fast runner for one-off TypeScript scripts.

**gh.** You have a guide already. The parts most people never reach:
`gh pr create --fill`, `gh pr checkout <n>` (fetches someone's PR into a local
branch), `gh run watch` and `gh run view --log-failed` for CI without leaving
the terminal, `gh search`, and `gh api` with `--jq` — which lets you script
anything the web UI can do.

**supabase.** Guide exists. The daily set is `db diff`, `db push`,
`migration new`, `gen types typescript`, `functions serve`, and `db reset`. Add
`psql` and learn ten of its meta-commands (`\dt`, `\d table`, `\x`, `\timing`) —
being able to query production read-only from the terminal changes how you debug
data problems.

**vercel.** `vercel dev`, `vercel env pull`, `vercel logs --follow`,
`vercel inspect`, `vercel promote` and `vercel rollback`. Being able to roll
back from the terminal in ten seconds is the reason to learn this.

**docker.** `ps`, `logs -f`, `exec -it <c> sh`, `compose up -d`,
`compose logs -f`, and `system prune` when the disk fills. Supabase local runs
on this, so when it misbehaves these are the commands that tell you why.

**infisical.** Guide exists. `infisical run --` in particular, so secrets never
land in a `.env` on disk.

**ripgrep.** You have it, but there's a lot past `rg foo`: `-t ts` to restrict
by file type, `-C3` for context, `-l` for filenames only, `--hidden`, `-g` glob
filters, `--multiline`, and `--json` to make its output something a script can
read.

**jq.** Same story — you have it, but the gap between "I can select a field" and
fluency is where the value is: `select()`, `map()`, `//` for defaults, `-r` for
raw strings, `@csv`, `--arg` for passing shell values in safely.

---

## Part 6 — When something is broken

The commands you reach for when a port is taken, a process won't die, or DNS is
lying to you.

- **`lsof`** — you already have a guide. `lsof -i :3000` is the one.
- **`ps aux | rg node`**, **`pgrep -fl next`**, **`pkill -f 'next dev'`** —
  finding and killing processes by name rather than by hunting for a PID.
- **`dig`** (`dig +short`, `dig @1.1.1.1`) and `nslookup` — is it DNS? It is
  usually DNS.
- **`curl -v`**, `-I` for headers only, `-w '%{time_total}'` for timing,
  `--resolve` to test a domain against a specific IP before you cut DNS over.
- **`nc -zv host port`** — is anything listening at all.
- **`ping`**, `traceroute`.
- **`df -h`** and **`du -sh *`** — the disk is full, and this is where.
- **`caffeinate -i <cmd>`** — stop macOS sleeping through a long job.

---

## Part 7 — macOS specifics

Small, and you'll use them constantly once you know them.

- **`pbcopy` / `pbpaste`** — the clipboard as a pipe. `crib gh --pr | pbcopy`.
  Probably the most-used item in this section.
- **`open`** — `open .` in Finder, `open -a "Google Chrome" file.html`,
  `open https://…`.
- **`mdfind`** — Spotlight from the command line, and much faster than `find`
  across a whole disk.
- **`say`** — a long build tells you when it's done.
- **`brew`** — `leaves` (what you actually asked for, versus dependencies),
  `bundle dump` (write a Brewfile so a new machine is one command),
  `autoremove`, `uses --installed`.
- **`defaults read/write`** — change macOS settings from a script, which is how
  a new machine gets set up in minutes rather than an afternoon.
- **`launchctl`** — scheduled and background jobs, macOS's cron.
- **`trash`** — you have it. Safer than `rm` and there's no reason not to alias
  it.
- Terminal emulator: if you're not on **Ghostty** or **WezTerm**, they're worth
  the switch for speed alone.

---

## Part 8 — Writing small tools you keep

The last step is that anything you do three times becomes a script.

- `#!/usr/bin/env bash` and `set -euo pipefail` — stop on error, stop on
  undefined variable, and don't let a failure in the middle of a pipe pass
  silently. Every script starts with this.
- Quoting. `"$var"` versus `$var` versus `'$var'`, and why the difference eats
  people alive when filenames have spaces.
- `$1`, `$@`, `${var:-default}`, `case`, `if [[ ]]`, functions, `local`.
- Reading `stdin` so your script composes with pipes like everything else.
- Exiting non-zero on failure, so `&&` and CI both behave.
- `shellcheck` on everything.
- When to stop: past roughly a hundred lines, write it in TypeScript and run it
  with `node`. This repo is the proof — it started as a 3,000-line bash script.

---

## Part 9 — What this means for `crib`

Which of the above deserve a guide in this repo, and in what order. The test is
whether the tool has more flags than you can hold in your head _and_ you use it
often enough to keep forgetting them.

**Build first:**

1. **`fzf`** — small surface, huge payoff, and you'll be learning it at the same
   time. Key bindings, `--preview`, `--multi`, and a section of recipes
   (`git branch | fzf`, `rg --files | fzf`).
2. **`zsh`** — the line editor keys, history expansion, globbing, job control.
   Not a CLI tool, but it's the thing you use most and the thing least
   documented in a form you can grep.
3. **`rg`** and **`jq`** — you own both already and use maybe a fifth of each.
   These are pure recall problems, which is exactly what this repo is for.
4. **`unix`** — a cross-cutting guide for the pipeline: `xargs`, `sort`,
   `uniq -c`, `cut`, `tr`, `find`, process substitution. Doesn't map to one
   binary, so give it a topic per job rather than per command.

**Build next:** `docker`, `psql`, `vercel`, `npm`, `curl`, `ssh`, `macos` (the
Part 7 list), `brew`.

**Build as you adopt them:** a tool you haven't installed doesn't need a guide
yet. When `delta`, `zoxide`, `tmux`, `ast-grep` or `just` become part of your
day, that's the moment to write it up — write the guide as the thing that makes
you learn it.

**Worth reconsidering:** your `git` guide covers the basics well. The gap is
Part 3 — reflog, bisect, `add -p`, `--fixup`, `range-diff`. Those are the ones
worth having a screen for, because you use them rarely enough to forget the
exact syntax every time.

---

## Part 10 — The order to actually do this in

Learning tools in bulk doesn't stick. Pick a small number, use them until they
are automatic, then add more.

**Week one, no installs.** Add `eval "$(fzf --zsh)"` and the history settings to
`~/.zshrc`. Add git aliases and `rerere`. Learn Ctrl-R, Ctrl-A/E/W/U, `!$`.
Force yourself to use Ctrl-R instead of Up.

**Week two, Tier 1.** `brew install zoxide bat fd git-delta eza tldr`. Wire
`bat` in as fzf's preview and `delta` in as git's pager. Stop typing `cd` and
`cat`.

**Week three, git.** `git add -p` for every commit for a week. Then `--fixup`
and `--autosquash`. Then read `reflog` and `bisect` once so you know they exist
when you need them.

**Week four, the pipeline.** Every time you're about to do something by hand,
ask whether `sort | uniq -c | sort -rn` or an `xargs` does it. Add `watchexec`.

**After that,** add tools as jobs demand them rather than on a schedule, and
write the `crib` guide for each one as you adopt it. The guide is how it sticks.
