# @litebyte/comment-contract

Mechanical enforcement of a comment contract — the rules saying what earns a
comment, how long it may be, and which phrases are banned outright.

It runs in two places. As a Claude Code hook it refuses an edit that introduces
a violation, so the comment is fixed before it ever reaches a file. In CI it
fails a pull request on the same grounds.

Both only ever judge **newly added lines**. Existing comments in a file you
happen to touch are left alone, so adopting this in an old codebase does not
mean fixing a thousand comments before you can merge anything.

## Installing

```sh
npm i -D @litebyte/comment-contract
```

For CI, add the check to your scripts:

```json
{ "scripts": { "check:comments": "devkit-check-comments" } }
```

It diffs against `origin/main` by default; pass another base as an argument.

For the edit gate, add a `PreToolUse` hook in `.claude/settings.json`:

```json
{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "Edit|Write",
				"hooks": [{ "type": "command", "command": "npx devkit-comment-gate" }]
			}
		]
	}
}
```

## Configuring

Optional — every setting has a default. Copy the example if you want to change
one:

```sh
cp node_modules/@litebyte/comment-contract/comment-contract.example.json \
   .devkit/comment-contract.json
```

| Setting                   | Default                          | What it controls                                    |
| ------------------------- | -------------------------------- | --------------------------------------------------- |
| `governed`                | `\.(tsx?\|mjs\|cjs\|js)$`        | Which extensions the contract covers                |
| `exclude`                 | node_modules, `.min.js`, `.d.ts` | Paths to skip entirely                              |
| `headerMax`               | 8                                | Longest permitted file header, in lines             |
| `jsdocProseMax`           | 4                                | Longest prose run inside one JSDoc block            |
| `commentMaxChars`         | 100                              | Longest permitted comment                           |
| `bannerMinCode`           | 150                              | Lines of code below which section banners are noise |
| `todoPrefix`              | `[A-Z]{2,}`                      | Issue prefix a `TODO(ABC-123):` must carry          |
| `bans`                    | five sets of phrases             | Phrases that fail outright                          |
| `rulesDoc`, `examplesDoc` | none                             | Files the failure message points at                 |

`bans` **replaces** the defaults rather than adding to them. Copy the ones you
want to keep out of `comment-contract.example.json`.

The default bans reject comments that narrate history ("previously", "no longer
needed"), reference the conversation that produced them ("as requested", "phase
2"), carry an issue id, justify rather than state, or speak in first or second
person. Each finding names the rule it breaks, so the agent reading the failure
knows what to change.

## When it does not block

Like the skill gate, the hook fails open — a broken config allows the edit
rather than stopping work. The CI check does the opposite and fails loudly,
because there a tool that cannot run is a tool that is silently passing
everything.
