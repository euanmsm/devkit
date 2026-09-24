# @euanmsm/preflight

A Claude Code hook that blocks an edit until the agent has read the conventions
governing the file it is about to change — or blocks any other tool call, such
as an MCP write, until it has read the conventions for that tool.

The problem it solves: an agent that has not opened your conventions writes code
from memory of how code is usually written, not how _your_ code is written. You
then spend the review asking for the same changes you asked for last week. This
turns the conventions from something an agent might read into something it must.

## Installing

```sh
npm i -D @euanmsm/preflight
mkdir -p .devkit
cp node_modules/@euanmsm/preflight/preflight.example.json .devkit/preflight.json
```

Then register it as a `PreToolUse` hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "npx preflight" }]
      },
      {
        "matcher": "mcp__.*[Ll]inear.*__save_(issue|comment|document|project)",
        "hooks": [{ "type": "command", "command": "npx preflight" }]
      }
    ]
  }
}
```

The second entry is only needed for `tools` rules. The hook only runs for tools
its `matcher` lets through, so a `tools` rule for a tool no matcher covers never
fires. Keep the matcher and the rule's pattern in step.

## The map

`.devkit/preflight.json` says which skills each path needs. Patterns are regular
expressions tested against the path relative to the repository root.

```json
{
  "exclude": ["node_modules/", "\\.d\\.ts$"],
  "primary": [
    { "pattern": "^src/api/", "skills": ["api-routes"] },
    { "pattern": "^src/", "skills": ["readability"] }
  ],
  "universal": [{ "pattern": "\\.(tsx?|mjs)$", "skills": ["comments"] }]
}
```

`exclude` wins over everything. `primary` is **first match wins**, so list the
most specific pattern first — `^src/api/` above `^src/`, never the other way
round. `universal` rules always add on top of whichever primary rule matched.

A path no rule names requires nothing, so the gate is opt-in per directory.

### Gating a tool by name

`tools` rules match the tool name instead of a path, so they can gate calls that
write no file at all:

```json
{
  "tools": [
    {
      "pattern": "^mcp__.*[Ll]inear.*__save_(issue|comment|document|project)$",
      "skills": ["linear"]
    }
  ]
}
```

`tools` is first match wins, like `primary`. When a tool rule matches, its
skills are the only ones the call needs — path rules are not checked for that
call. The deny message names the tool when a tool rule matched and the file when
a path rule did.

## When it does not block

The gate fails open. A missing map, an unreadable transcript, a file outside the
repository or a malformed payload all allow the edit rather than halting work on
a tool that cannot do its job. `PREFLIGHT=off` disables it for one command.

Deliberate: a gate that breaks your session when its own config has a typo is a
gate you will remove within the week.
