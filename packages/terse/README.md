# @euanmsm/terse

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
npm i -D @euanmsm/terse
npx terse-init   # writes .devkit/terse.json
npx terse-docs   # writes the contract your agents read
```

For CI, add the check to your scripts:

```json
{ "scripts": { "check:comments": "terse" } }
```

It diffs against `origin/main` by default; pass another base as an argument.

For the hooks, add both to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx --no-install terse-gate",
            "timeout": 10,
            "statusMessage": "Checking the comment contract"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx --no-install terse-watch",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

The `timeout` matters. Without it a hook that hangs blocks the edit forever,
which quietly undoes the fail-open design.

### Two hooks, because one is not enough

`terse-gate` runs **before** an `Edit` or `Write` and can refuse it. That is the
one that actually prevents a bad comment reaching a file.

`terse-watch` runs **after every tool call** and catches what the gate cannot
see. An agent writing a file with a Bash heredoc, `sed -i`, or a Python script
never touches the `Edit` tool, so the gate is never consulted. The watcher
compares the working tree against the last commit and reports anything new.

It cannot block. The file is already written by the time it runs, and a
`PostToolUse` hook has no power to undo that. What it does is tell the agent
what it just wrote, immediately, so the fix happens in the same turn rather than
in review.

It reports each violation **once per session**, keeping the set it has already
mentioned in `.git/terse/`. Without that it would repeat every outstanding
violation after every command, which is noise an agent learns to skip.

Two audiences, two messages. The agent gets the full list in its context, so it
can act. You get one line in the terminal:

```
terse: 3 new comment violations in src/server.ts
```

Hook output on a clean exit never reaches the terminal by itself, so without
that line the watcher would fire invisibly and you would never know it had.

Omitting the `matcher` on the `PostToolUse` entry is deliberate — it matches
every tool, so a file written through an MCP server or some future tool is
covered without anyone remembering to add it.

## Configuring

Run `init` once. It writes a complete config — every rule and every cap spelled
out — so you edit what is in front of you rather than discovering defaults in a
README:

```sh
npx terse-init
```

That writes `.devkit/terse.json` with all sixteen rules listed and switched on.
Turn one off by setting it to `false`:

```json
{
  "rules": {
    "file-header": false,
    "section-banner": false,
    "no-history": true
  },
  "commentMaxChars": 120
}
```

A config naming only some rules leaves the rest switched on, so a short config
is a valid one. `init` refuses to overwrite a config you already have; pass
`--force` if you mean to replace it.

### The rules

| Name                   | What it requires                               |
| ---------------------- | ---------------------------------------------- |
| `file-header`          | Every file opens with a `// ====` header       |
| `exported-jsdoc`       | Every exported symbol and function has JSDoc   |
| `property-jsdoc`       | Every property has JSDoc, of one sentence      |
| `jsdoc-tag-coverage`   | JSDoc documents the parameters, return, throws |
| `header-cap`           | A file header is capped and has no subsections |
| `jsdoc-cap`            | JSDoc prose is capped and its tags do not wrap |
| `logic-comment-length` | A logic comment is one line                    |
| `no-history`           | No narrating what the code used to do          |
| `no-conversation`      | No referencing the conversation that wrote it  |
| `no-issue-id`          | No issue ids in comments                       |
| `no-justification`     | State what is true, do not argue for it        |
| `comment-length`       | One sentence, under the character cap          |
| `no-person`            | No first or second person                      |
| `no-commented-code`    | No commented-out code                          |
| `todo-form`            | A marker carries an issue id                   |
| `jsdoc-tags`           | Only the allowed JSDoc tags                    |
| `section-banner`       | No section banners in a small file             |

The first seven are house style — a repo that writes its files differently will
turn some off. The rest are closer to universal, and most repos keep them.

Findings report the name, not a number:

```
src/server.ts:14  [exported-jsdoc]  Declaration has no JSDoc.
```

## The written contract

A scanner that rejects a comment is only half the job — the agent writing the
comment needs the rules in front of it. `terse-docs` builds that document from
your config:

```sh
npx terse-docs
```

It assembles one prose chunk per rule, including only the rules you have
switched on, and writes the result to the path in `rulesDoc` (or
`.devkit/comment-rules.md` if you have not set one). Caps are written into the
prose as you configured them — set `commentMaxChars` to 140 and the document
says "one sentence, one clause, 140 characters".

Switch a rule off and its section disappears. Switch off every rule in a section
and the heading goes too. The document ends by naming which rules `terse`
catches mechanically and which remain review rules, so a reader knows what is
enforced and what is trusted.

This matters because a hand-written contract drifts. An agent told to write a
file header for a repo that switched `file-header` off wastes its time and adds
a comment nobody wanted. Generating the document means the instructions and the
scanner cannot disagree.

Keep it honest in CI:

```json
{ "scripts": { "check:comment-docs": "terse-docs --check" } }
```

That fails if the document no longer matches the config, the same way a stale
lockfile fails.

### Rules with no scanner

Five rules are prose only — `logic-comment-exception`, `what-not-why`,
`comment-ages-with-code`, `cut-is-deleted` and `migration-exception`. No script
can judge whether a comment earned its place, so these never produce a finding.
They exist so the generated contract can carry them, and you can switch them off
like any other.

### The caps

| Setting                   | Default                               | Controls                                    |
| ------------------------- | ------------------------------------- | ------------------------------------------- |
| `governed`                | `.ts .tsx .js .mjs .cjs`              | Which extensions are covered                |
| `exclude`                 | node_modules, `.min.js`, `.d.ts`      | Paths skipped entirely                      |
| `headerMax`               | 8                                     | Longest file header, in lines               |
| `jsdocProseMax`           | 4                                     | Longest prose run in one JSDoc block        |
| `commentMaxChars`         | 100                                   | Longest comment                             |
| `bannerMinCode`           | 150                                   | File size below which banners are noise     |
| `sectionBanners`          | `large-files`                         | `always` welcomes banners, `off` bans them  |
| `todoPrefix`              | any 2+ capitals                       | Issue prefix a `TODO()` must carry          |
| `allowedTags`             | `@param @returns @throws @deprecated` | JSDoc tags that pass                        |
| `jsdocScope`              | `all`                                 | `all` covers functions, `exported` does not |
| `jsdocScopeExclude`       | `.test.`, `.spec.`                    | Paths where only exports need JSDoc         |
| `bans`                    | five phrase sets                      | Phrases the content rules reject            |
| `rulesDoc`, `examplesDoc` | none                                  | Files the failure message points at         |

`sectionBanners` set to `always` is not the same as switching `section-banner`
off. Off drops banners from the generated contract entirely; `always` keeps a
section there saying what a banner should separate.

`bans` **replaces** the defaults rather than adding to them, which is why `init`
writes all five out in full — edit the list rather than rebuilding it.

Setting `rulesDoc` and `examplesDoc` matters more than it looks. It turns a
failure into a message an agent can act on without you in the loop.

## When it does not block

Like `preflight`, both hooks fail open — a broken config allows the edit rather
than stopping work, and `TERSE=off` disables them for one command. The CI check
does the opposite and fails loudly, because there a tool that cannot run is a
tool that is silently passing everything.
