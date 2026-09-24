# devkit

Repository tooling shared across LiteByte projects — the hooks, checks and scans
that keep a codebase honest, pulled out of the repos that grew them so each one
no longer carries its own copy.

Everything here is a command-line tool. Nothing imports application code, and
nothing here ends up in a production bundle.

## The packages

| Package                                    | What it does                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| [`@euanmsm/preflight`](packages/preflight) | Blocks a Claude Code edit until the conventions governing that file have been read      |
| [`@euanmsm/terse`](packages/terse)         | Stops comments that break the contract, both as an edit gate and as a CI check          |
| [`@euanmsm/shellgate`](packages/shellgate) | Blocks Bash commands that edit repository files, leaving Edit and Write the only way in |
| [`@euanmsm/secure`](packages/secure)       | Scans for leaked secrets, malicious patterns and tampered lockfiles                     |
| [`@euanmsm/vouch`](packages/vouch)         | Lets named packages run install scripts while blocking everyone else                    |
| [`@euanmsm/wt`](packages/wt)               | Runs git worktrees side by side, each with its own ports, env files and database        |
| [`@euanmsm/cheat`](packages/cheat)         | Terminal cheat sheets for everyday CLIs, plus short courses with practice               |
| [`@euanmsm/devkit-core`](packages/core)    | Config loading the others share. Not useful on its own                                  |

## Installing one

```sh
npm i -D @euanmsm/terse
```

Each package reads its settings from a JSON file in a `.devkit/` directory at
your repository root, and ships an example to copy:

```sh
mkdir -p .devkit
cp node_modules/@euanmsm/terse/terse.example.json \
   .devkit/terse.json
```

Every package works without that file — it falls back to sensible defaults, or
in the case of the allowlist, to doing nothing at all. The config is how you
teach a tool about your repository, not a hurdle before it will start.

## Working on it

```sh
npm install     # links the packages to each other
npm test        # every package's tests
npm run format  # prettier
```

Node 22.11 or newer. The tests use the Node test runner, so there is no test
framework to install.

## Making a change

`main` is protected. You cannot push to it, and neither can anyone else — admins
included. Every change arrives through a pull request.

```sh
git switch -c fix-the-thing
# … work, with a test …
npx changeset
git commit -am "fix: the thing"
git push -u origin fix-the-thing
gh pr create
```

`npx changeset` asks which packages you changed, whether it is a patch, minor or
major, and for a one-line summary. It writes a small markdown file into
`.changeset/` — commit that alongside the code. It is what decides the version
numbers and writes the changelog later.

If your change touches no package — a root README, a workflow file — you need no
changeset. If it touches a package but deliberately releases nothing, run
`npx changeset --empty`, which records that decision rather than leaving it
looking like a mistake.

### What CI checks

One job, `Tests`, on every pull request into `main`:

1. `npm ci`
2. `npm test` — all of it, every package, in one run
3. `npx changeset status --since=origin/main` — fails if you changed a package
   and forgot a changeset

That job is a **required check**, so a red pull request has no merge button. The
branch also has to be up to date with `main` before merging, which means the
code that gets tested is the code that lands.

Nothing runs on `main` itself. There is no point: a merge can only contain a
state CI has already tested.

## How a release happens

Publishing is a code review, never a command anyone runs by hand. Merging your
pull request does not publish anything — it takes two merges, and the second one
is the release.

```
your branch
   │ merge pull request
   ▼
 main ────► Release workflow runs
   │          │ finds pending changesets
   │          ▼
   │        opens "Version Packages" pull request
   │          (bumped versions, written changelogs,
   │           changesets consumed)
   │ merge that pull request
   ▼
 main ────► Release workflow runs again
              │ no changesets left to consume
              ▼
            npm publish
```

The middle step is the useful one. The "Version Packages" pull request shows you
exactly which packages are about to move and to what, with the changelog already
written from the summaries you gave. Several merged branches batch into one
release rather than each one publishing separately.

### Two details that are easy to break

**The release pull request is opened with a personal access token, not
`GITHUB_TOKEN`.** GitHub will not start a workflow run for an event triggered by
`GITHUB_TOKEN`. With the built-in token that pull request would get no CI run at
all, its required check would never pass, and releases would deadlock
permanently. The token lives in the `RELEASE_TOKEN` secret and needs Contents
and Pull requests write, nothing more.

**CI skips the changeset check on `changeset-release/main`.** That branch exists
precisely because it consumed every changeset, so the check would find changed
packages and no changesets and fail by construction. It is skipped by branch
name in `.github/workflows/ci.yml`.

Both look like tidy-ups to a future reader. Removing either stops releases
working, and the failure appears a step away from the cause.
