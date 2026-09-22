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
npx terse-init
```

For CI, add the check to your scripts:

```json
{ "scripts": { "check:comments": "terse" } }
```

It diffs against `origin/main` by default; pass another base as an argument.

For the edit gate, add a `PreToolUse` hook in `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "npx terse-gate" }]
      }
    ]
  }
}
```

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
| `exported-jsdoc`       | Every exported symbol has JSDoc                |
| `property-jsdoc`       | Every property has JSDoc, of one sentence      |
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

The first six are house style — a repo that writes its files differently will
turn some off. The rest are closer to universal, and most repos keep them.

Findings report the name, not a number:

```
src/server.ts:14  [exported-jsdoc]  Exported symbol has no JSDoc.
```

### The caps

| Setting                   | Default                               | Controls                                |
| ------------------------- | ------------------------------------- | --------------------------------------- |
| `governed`                | `.ts .tsx .js .mjs .cjs`              | Which extensions are covered            |
| `exclude`                 | node_modules, `.min.js`, `.d.ts`      | Paths skipped entirely                  |
| `headerMax`               | 8                                     | Longest file header, in lines           |
| `jsdocProseMax`           | 4                                     | Longest prose run in one JSDoc block    |
| `commentMaxChars`         | 100                                   | Longest comment                         |
| `bannerMinCode`           | 150                                   | File size below which banners are noise |
| `todoPrefix`              | any 2+ capitals                       | Issue prefix a `TODO()` must carry      |
| `allowedTags`             | `@param @returns @throws @deprecated` | JSDoc tags that pass                    |
| `bans`                    | five phrase sets                      | Phrases the content rules reject        |
| `rulesDoc`, `examplesDoc` | none                                  | Files the failure message points at     |

`bans` **replaces** the defaults rather than adding to them, which is why `init`
writes all five out in full — edit the list rather than rebuilding it.

Setting `rulesDoc` and `examplesDoc` matters more than it looks. It turns a
failure into a message an agent can act on without you in the loop.

## When it does not block

Like `preflight`, the hook fails open — a broken config allows the edit rather
than stopping work, and `TERSE=off` disables it for one command. The CI check
does the opposite and fails loudly, because there a tool that cannot run is a
tool that is silently passing everything.
