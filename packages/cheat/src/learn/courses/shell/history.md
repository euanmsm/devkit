Your history already holds most of the commands you'll type today. The
difference between pressing Up forty times and reaching straight in is two
settings and one habit.

## Search, don't scroll

`Ctrl-R` searches history backwards — type any fragment of a past command and it
appears. With fzf's shell integration loaded it becomes a fuzzy picker over
everything you've ever run:

```bash
eval "$(fzf --zsh)"   # in ~/.zshrc
```

The habit to build: **never press Up more than twice**. Anything further back is
quicker through `Ctrl-R`, and using it for small things is what makes it
automatic when it matters.

## Keep more of it

The defaults are stingy and per-tab. In `~/.zshrc`:

```bash
HISTSIZE=100000
SAVEHIST=100000
setopt SHARE_HISTORY          # tabs see each other's commands
setopt HIST_IGNORE_ALL_DUPS   # keep one copy of each command
setopt HIST_REDUCE_BLANKS
```

`SHARE_HISTORY` is the sleeper: a command typed in one terminal is a `Ctrl-R`
away in every other.

## Expansion — the last command, sliced

- `!!` — the previous command, whole. `sudo !!` is the classic.
- `!$` — just its last argument: `mkdir demo && cd !$`
- `!rg` — the most recent command that started with `rg`
- `^old^new` — rerun the previous command with one substitution

`!$` pays for itself the same day. Almost every `mkdir`, `touch` or download is
followed by a command that wants exactly the same path — stop retyping it.
