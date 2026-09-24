# @euanmsm/wt

Runs several git worktrees of one repository side by side, each with its own
ports, its own copy of your env files and, optionally, its own local Supabase
stack.

Two checkouts of the same app both want port 3000, so the second `npm run dev`
fails with `EADDRINUSE`. `wt` gives every worktree a slot number, and each slot
shifts every port you list by a fixed step. The main checkout keeps the normal
ports, slot 1 adds 100, slot 2 adds 200, and so on.

## Installing

```sh
npm i -D @euanmsm/wt
npx wt init
```

`wt init` writes a starter `.devkit/wt.json`. Edit it to list your services,
then add the personal settings file to `.gitignore`:

```
.devkit/wt.local.json
.wt-supabase/
```

Run it through `npx wt`, an npm script (`"wt": "wt"`), or a shell alias.

## Using it

```sh
wt recall-ui -b euanmadhar/recall-ui       # new worktree on a branch
wt recall-ui -b euanmadhar/recall-ui -f main
wt spike --detach                          # no branch
wt list                                    # every checkout, its slot and path
wt -d recall-ui                            # delete the worktree and its branch
wt -d recall-ui --save-branch              # delete the worktree, keep the branch
```

The worktree's name and its branch are separate, and both are required. The name
is the folder, so it has no `/` in it. Every worktree lands in one folder beside
the main checkout: with the default config, `~/code/app` puts `recall-ui` at
`~/code/app-wt/recall-ui`.

The branch is used as it is if it exists locally. If it exists only on the
remote, the worktree checks it out tracking the remote. Otherwise `wt` creates
it from `-f <base>`, or from the branch you are on.

On create, `wt`:

1. adds the worktree and records its slot inside git's own folder for that
   worktree, so the slot is freed when the worktree goes;
2. copies every untracked env file matching `env.copy` from the main checkout,
   and rewrites each `:<port>` for a listed service to the shifted port;
3. writes the Supabase override project, if configured (see below);
4. runs the `postCreate` hooks inside the new worktree, stopping if a required
   one fails;
5. boots, migrates and stops the Supabase stack;
6. opens the worktree.

On delete, it runs the `preDelete` hooks, stops the Supabase stack and deletes
its data, stops anything still listening on the `killOnDelete` ports, removes
the workspace entry, then the folder and the branch.

## Ports in your scripts

`wt port <service>` prints the current checkout's port, so npm scripts can use
it inline:

```json
{ "scripts": { "dev": "next dev -p $(wt port app)" } }
```

From code, import the resolver:

```ts
import { ports } from '@euanmsm/wt';

const { app, docs } = ports(); // { app: 3100, docs: 3101 } in slot 1
```

Both take the offset from the first place that sets it: the `ports.offsetEnv`
variable in the environment, then that variable in one of its `files`, then the
worktree's slot. The main checkout has no slot, so it gets the base ports. To
move a worktree's ports by hand, edit the variable in its env file.

## Configuring

`.devkit/wt.json` is tracked and holds facts about the repository.
`.devkit/wt.local.json` is untracked and holds your own preferences. Anything in
it is laid over the tracked file, one section at a time.

```json
{
  "dir": "../curricular-wt",
  "remote": "origin",
  "env": { "copy": [".env*"], "maxDepth": 3 },
  "ports": {
    "step": 100,
    "services": { "app": 3000, "docs": 3001, "storybook": 6006 },
    "offsetEnv": {
      "name": "WORKTREE_PORT_OFFSET",
      "files": ["apps/main/.env.local"]
    },
    "killOnDelete": ["app"]
  },
  "hooks": {
    "postCreate": [
      "npm ci",
      { "run": "npm run setup:husky", "optional": true }
    ],
    "preDelete": []
  },
  "open": "window",
  "workspaceFile": null
}
```

| Setting              | Default          | What it controls                                                                   |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `dir`                | `"../{repo}-wt"` | Where worktrees go, relative to the main checkout. `{repo}` is its folder name     |
| `remote`             | `"origin"`       | The remote checked for a branch that is not local                                  |
| `env.copy`           | `[".env*"]`      | File-name patterns copied from the main checkout. Tracked files are never copied   |
| `env.maxDepth`       | `3`              | How many folders deep to look for them                                             |
| `ports.step`         | `100`            | How far each slot moves every port                                                 |
| `ports.services`     | `{}`             | Each service's port in the main checkout                                           |
| `ports.offsetEnv`    | `null`           | A variable written into `files` on create, and read back as a hand-set offset      |
| `ports.killOnDelete` | `[]`             | Services whose leftover server is stopped when a worktree is deleted               |
| `hooks.postCreate`   | `[]`             | Commands run in a new worktree, in order                                           |
| `hooks.preDelete`    | `[]`             | Commands run in a worktree before it is deleted                                    |
| `open`               | `"window"`       | `window` opens a new VS Code window, `workspace` adds to a saved workspace, `none` |
| `workspaceFile`      | `null`           | The `.code-workspace` file used when `open` is `workspace`                         |

Hooks run with `WT_NAME`, `WT_PATH`, `WT_BRANCH`, `WT_BASE`, `WT_SLOT` and
`WT_OFFSET` set. A hook written as a plain string is required: if it fails, `wt`
stops there and exits with an error. On create, nothing after it runs, so no
stack is booted and nothing is opened. The worktree stays on disk, so remove it
with `wt -d <name>` once the problem is fixed and create it again. On delete,
nothing is removed. A hook written as `{ "run": "...", "optional": true }` only
prints a warning when it fails. A misspelt setting stops `wt` with a message
naming it, before anything is created.

## Opening in your workspace

Set this in `.devkit/wt.local.json`:

```json
{ "open": "workspace", "workspaceFile": "../curricular.code-workspace" }
```

Each new worktree is added to that file's `folders` list as
`{ "name": "wt: <name>", "path": "..." }`, then `code <file>` brings forward the
window that has it open. VS Code picks up the new folder straight away. Deleting
the worktree removes its entry.

Your other folders, your settings and your comments are left exactly as they
are. Only an entry pointing at the worktree being created or deleted is ever
touched. If the file does not exist, `wt` creates it with the main checkout and
the new worktree. If it cannot be read, `wt` warns and opens a new window
instead.

## Supabase

Add a `supabase` block to give each worktree its own local stack:

```json
{
  "supabase": {
    "dir": "supabase",
    "basePort": 54320,
    "step": 1000,
    "link": ["migrations", "seed.sql", "functions"],
    "appService": "app",
    "resetCommand": "npm run supabase:reset",
    "envFiles": ["apps/main/.env.local"]
  }
}
```

Your tracked `supabase/config.toml` is never edited. Each worktree gets a
gitignored `.wt-supabase/supabase/` folder holding a copy of it: the project id
gains a `-wtN` suffix, and every port moves to `basePort + slot × step`. The
names in `link` are symlinked back to the real folders, so migrations never
drift. `appService` points `site_url` and the auth redirect URLs at the
worktree's app port. The same ports are rewritten in the copied env files.

A stack is about a dozen containers, so a new worktree's stack is booted once,
reset with `resetCommand` (or `supabase db reset`), and stopped again with its
data kept. `--keep-supabase` leaves it running and `--no-supabase` skips the
boot. `wt -d` stops it and deletes its data.

Run the Supabase CLI through `wt` so it reads the right config:

```json
{
  "scripts": {
    "supabase:start": "wt supabase start",
    "supabase:stop": "wt supabase stop",
    "supabase:check-target": "wt supabase check"
  }
}
```

Node scripts that talk to the stack over HTTP should resolve it through the
guard, which refuses when the URL they would use belongs to another checkout's
stack:

```ts
import {
  requireSupabaseTarget,
  requireServiceRoleKey,
} from '@euanmsm/wt/supabase';

const { url } = requireSupabaseTarget();
const client = createClient(url, requireServiceRoleKey());
```

The URL comes from `SUPABASE_URL`, then `NEXT_PUBLIC_SUPABASE_URL`, then the
`envFiles` in order, then the stack's own `[api]` port. Remote URLs are never
refused. Set `SUPABASE_ALLOW_CROSS_WORKTREE=1` to turn the refusal into a
warning.
