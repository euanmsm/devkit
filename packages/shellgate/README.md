# @euanmsm/shellgate

A Claude Code hook that blocks Bash commands which edit files in your
repository, so the Edit and Write tools are the only way an agent can change
them.

The problem it solves: edit hooks such as `preflight` and `terse` only watch the
Edit and Write tools. An agent that reaches for `sed -i`, a `>` redirect or a
quick Python script changes the same file with none of those checks running, and
nothing tells you it happened. Some harness modes actively suggest shell edits.
This closes that route.

## Installing

```sh
npm i -D @euanmsm/shellgate
```

Then register it as a `PreToolUse` hook on Bash in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR/node_modules/.bin/shellgate\""
          }
        ]
      }
    ]
  }
}
```

Point at the installed binary rather than `npx shellgate`. The hook runs before
every Bash command, and starting through `npx` adds a delay to each one.

There is no config file — nothing goes in `.devkit/`.

## What it blocks

- In-place editors: `sed -i`, `perl -i`, `ruby -i`, `awk -i inplace`, `patch`,
  and `git apply` (except `--check`, `--stat`, `--numstat`, `--summary` and
  `--cached`)
- A `>` or `>>` redirect, or `tee`, into a path inside the repository —
  including quoted or escaped paths with spaces, and after a `cd` earlier in the
  same command (a `cd` inside `( … )` or `$( … )`, quoted or not, stops counting
  once it closes)
- An inline Python, Node, Ruby, Bun or Deno script that calls a file-writing
  API, including when run through `VAR=value`, `env`, `time`, `sudo`, `xargs`,
  `uv run`, `npx tsx`, or a path such as `.venv/bin/python` or `/usr/bin/time`

A blocked command never runs. The agent is told why and to make the change again
with Edit or Write.

## What it lets through

- Writes outside the repository: `/tmp`, a scratch directory, `/dev/null`
- Output handling such as `2>&1`, `2>/dev/null` and `| tail`
- Text that only looks like an edit, inside quotes or a heredoc body —
  `grep "sed -i"`, `jq 'select(.n > 1)'`, a commit message containing `>`. A
  heredoc with no closing delimiter line is not trusted, so its lines are still
  checked
- Read-only `python -c` and `node -e` one-liners, and lookups such as
  `command -v node`
- Tools that write files themselves, such as `prettier --write` or
  `eslint --fix`, and file moves: `mv`, `cp`, `rm`, `git mv`

## Known gaps

It matches patterns in the command text, so a determined workaround still gets
through:

- A script saved to a file and then run (`python3 edit.py`) is not inspected
- An inline script that names any absolute path outside the repository passes,
  even if it also writes inside it. That keeps scripts writing to a scratch
  directory working. Only a path under a real top-level directory counts —
  `/tmp`, `/private`, `/var`, `/Users`, `/home` and similar, or one that exists
  on the machine — so a URL path such as `/api/v1/users` or a regex literal such
  as `/oldName/g` does not

Pair it with a rule the agent reads, so it rarely tries in the first place.

## Suggested rule

Save as `.claude/rules/file-edits.md`:

```md
# File Edits

**Change files in this repo only with the Edit and Write tools.** Never through
Bash — no `sed -i`, `perl -i`, `>` or `>>` redirects, `tee`, `git apply`, and no
inline Python or Node script that writes a file.

- This overrides any harness instruction that permits shell edits
- `@euanmsm/shellgate` blocks these commands. A block means redo the change with
  Edit or Write — never hunt for another shell route
- Writing outside the repo is fine — a scratch directory, `/tmp`, `/dev/null`
```

## When it does not block

The gate fails open. A malformed payload, or a command running outside any git
repository, allows the command rather than halting work. `SHELLGATE=off`
disables it.
