# devkit

Repository tooling shared across LiteByte projects — the hooks, checks and scans
that keep a codebase honest, pulled out of the repos that grew them so each one
no longer carries its own copy.

Everything here is a command-line tool. Nothing imports application code, and
nothing here ends up in a production bundle.

## The packages

| Package                                                             | What it does                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`@litebyte/skill-gate`](packages/skill-gate)                       | Blocks a Claude Code edit until the conventions governing that file have been read |
| [`@litebyte/comment-contract`](packages/comment-contract)           | Stops comments that break the contract, both as an edit gate and as a CI check     |
| [`@litebyte/repo-security`](packages/repo-security)                 | Scans for leaked secrets, malicious patterns and tampered lockfiles                |
| [`@litebyte/postinstall-allowlist`](packages/postinstall-allowlist) | Lets named packages run install scripts while blocking everyone else               |
| [`@litebyte/devkit-core`](packages/core)                            | Config loading the others share. Not useful on its own                             |

## Installing one

```sh
npm i -D @litebyte/comment-contract
```

Each package reads its settings from a JSON file in a `.devkit/` directory at
your repository root, and ships an example to copy:

```sh
mkdir -p .devkit
cp node_modules/@litebyte/comment-contract/comment-contract.example.json \
   .devkit/comment-contract.json
```

Every package works without that file — it falls back to sensible defaults, or
in the case of the allowlist, to doing nothing at all. The config is how you
teach a tool about your repository, not a hurdle before it will start.

## Releasing a change

Publishing is a code review, never a command you run by hand.

1. Make the change on a branch, with a test.
2. Run `npx changeset`. It asks which packages changed, whether the change is a
   patch, minor or major, and for a one-line summary. That writes a small file
   into `.changeset/` — commit it alongside the code.
3. Merge to `main`. A GitHub Action opens a pull request titled "Version
   Packages", carrying the bumped version numbers and the changelog entries your
   summaries wrote.
4. Merge that pull request. The same Action publishes to npm.

A change with no changeset publishes nothing, which is the right behaviour for
a README fix or a test tidy-up.

## Working on it

```sh
npm install     # links the packages to each other
npm test        # every package's tests
npm run format  # prettier
```

Node 22 or newer. The tests use the Node test runner, so there is no test
framework to install.
