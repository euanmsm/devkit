# @euanmsm/repo-security

Two scans that between them cover the ways a repository gets compromised: a
secret committed by accident, and malicious code arriving through a dependency
or a tampered config file.

Both run in two modes. Before a commit they look only at staged files, so the
check is fast enough that nobody disables it. In CI they scan the whole tree.

## What it checks

**`devkit-security-scan`**

- **gitleaks** — leaked API keys, tokens and credentials.
- **semgrep** — malicious code patterns: backdoors, obfuscation, code built at
  runtime. Uses the supply-chain and JavaScript rulesets.
- **lockfile-lint** — that every package in `package-lock.json` resolves to your
  allowed registry over HTTPS, which is what catches a lockfile edited to point
  at someone else's server.

**`devkit-config-integrity`**

- Config files (`*.config.js`, `.mjs`, `.ts`) scanned for `eval`, hex escapes,
  `String.fromCharCode` and the rest of the obfuscation vocabulary, plus lines
  long enough to hide code past the edge of an editor.
- Your `.gitignore` still ignoring the files it must, which catches the commit
  that quietly removes `.env.local` from it.
- Staged files scanned for obfuscation, pre-commit only.

## Installing

```sh
npm i -D @euanmsm/repo-security
brew install gitleaks semgrep
```

`gitleaks` and `semgrep` are external binaries. If either is missing the scan
**skips that check and still passes** — so install them in CI, or a green build
means less than it looks like.

Wire both into a pre-commit hook:

```sh
#!/usr/bin/env bash
PRE_COMMIT=1 npx devkit-config-integrity
PRE_COMMIT=1 npx devkit-security-scan
npx lint-staged
```

and into CI without `PRE_COMMIT`, where they scan everything.

## Configuring

```sh
cp node_modules/@euanmsm/repo-security/repo-security.example.json \
   .devkit/repo-security.json
```

| Setting                | Default                  | What it controls                         |
| ---------------------- | ------------------------ | ---------------------------------------- |
| `gitignoreRequired`    | none                     | Patterns `.gitignore` must still contain |
| `lockfileAllowedHosts` | `["npm"]`                | Registries a lockfile may resolve to     |
| `semgrepConfigs`       | supply-chain, javascript | Rulesets to scan with                    |
| `maxConfigLineLength`  | 200                      | Longest permitted line in a config file  |
| `docsUrl`              | none                     | Link shown when the check fails          |

With no config the gitignore check skips rather than inventing a list of files
it guesses you care about.

## Bypassing

`git commit --no-verify` skips the hook. That is there for the genuine
emergency, and the CI run will still catch whatever you skipped.
