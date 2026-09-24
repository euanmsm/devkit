Three commands take you from a clean `main` to a chain of open PRs: `init`,
`add`, `submit`. Everything else is navigation.

## Build it

```bash
gh stack init auth              # first branch, sitting on main
# ...write the auth layer...
git add . && git commit -m "Auth layer"
gh stack add -Am "API routes"   # commit it all, branch on top
# ...write the API layer...
gh stack add -Am "Wire up the UI"
```

`init` starts the stack and its first branch (`--base` picks a different trunk;
several names build several layers at once, and branches that already exist are
adopted). `add -Am` is the move to learn: stage everything, commit with the
message, and branch on top — given no branch name, it invents one from the
message.

## Open the PRs

```bash
gh stack submit
```

One screen to title and describe every PR, `Ctrl+S` to send the lot. Each PR
gets the right base automatically and they arrive on GitHub linked as a stack.
New PRs are **drafts** unless you pass `--open`; `--auto` skips the editor and
takes generated titles.

`submit` is the only command that opens PRs. `push` publishes branches, `sync`
reconciles state — neither will ever create a PR for you.

## Look around

```bash
gh stack view       # every branch, its PR and its state
```

`✓` merged, `◎` queued, `○` open, `⚠` needs rebase.

Moving is relative to trunk: `gh stack down` goes a layer towards it,
`gh stack up` away from it, `top`, `bottom` and `trunk` jump to the ends, and
`gh stack switch` offers a picker. All of them skip branches whose PR has
already merged — the stack you move through is the live part.
