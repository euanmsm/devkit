# @euanmsm/skill-gate

A Claude Code hook that blocks an edit until the agent has read the conventions
governing the file it is about to change.

The problem it solves: an agent that has not opened your conventions writes code
from memory of how code is usually written, not how _your_ code is written. You
then spend the review asking for the same changes you asked for last week. This
turns the conventions from something an agent might read into something it must.

## Installing

```sh
npm i -D @euanmsm/skill-gate
mkdir -p .devkit
cp node_modules/@euanmsm/skill-gate/skill-map.example.json .devkit/skill-map.json
```

Then register it as a `PreToolUse` hook in `.claude/settings.json`:

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "Edit|Write",
				"hooks": [{ "type": "command", "command": "npx devkit-skill-gate" }]
			}
		]
	}
}
```

## The map

`.devkit/skill-map.json` says which skills each path needs. Patterns are regular
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

## When it does not block

The gate fails open. A missing map, an unreadable transcript, a file outside the
repository or a malformed payload all allow the edit rather than halting work on
a tool that cannot do its job. `SKILL_GATE=off` disables it for one command.

Deliberate: a gate that breaks your session when its own config has a typo is a
gate you will remove within the week.
