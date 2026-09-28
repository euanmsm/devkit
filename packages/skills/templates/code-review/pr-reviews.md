{{marker}}

# Posting a review to a pull request

When asked to leave comments on a pull request, review a PR, or start a review,
use the **pending review** flow below. Never use `gh pr comment` — that posts to
the issue thread, with no diff anchor and no review state — and never one-shot
`gh pr review --request-changes`.

Two APIs, two jobs:

- **REST** creates the review together with its first batch of comments
- **GraphQL** appends every comment after that, one at a time

Never delete a review and repost it to add a comment. [Cost](#cost) explains
what that does to your rate limit.

## 1. Create the review

Build the payload as JSON on disk. Comment bodies carry backticks, apostrophes
and fenced ` ```suggestion ` blocks, so generate the file with node or python
and heredoc bodies rather than shell string quoting:

```json
{
  "body": "The review summary. This is the only time it is set.",
  "comments": [
    { "path": "src/foo.ts", "line": 42, "side": "RIGHT", "body": "..." },
    {
      "path": "src/db/migrations/001_initial.sql",
      "start_line": 10,
      "line": 14,
      "start_side": "RIGHT",
      "side": "RIGHT",
      "body": "..."
    }
  ]
}
```

A single line takes `line` + `side`. A range takes `start_line` + `line` and
both `*_side` fields. `body` is the PR-level summary — `/{{name}}` puts its
`prBody` here. Submitting leaves it alone, so write it now.

POST it, and **omit `event` entirely** — that omission is what leaves the review
`PENDING`:

```bash
gh api repos/:owner/:repo/pulls/<PR>/reviews -X POST --input payload.json
```

Capture `id` from the response and confirm `"state": "PENDING"`.

> [!WARNING] **A 502 on this POST often means the review was created anyway.**
> Always check before retrying — a blind retry creates a second review, and only
> one review can be pending at a time.
>
> ```bash
> gh api repos/:owner/:repo/pulls/<PR>/reviews --paginate \
>   --jq '.[] | select(.state=="PENDING") | .id'
> ```

## 2. Append one comment

`addPullRequestReviewThread` takes a `pullRequestReviewId`, so it adds a thread
to an existing pending review and leaves it pending. This is the append path
REST does not have.

```bash
gh api graphql -f query='
mutation($reviewId: ID!, $path: String!, $body: String!,
         $line: Int!, $side: DiffSide!) {
  addPullRequestReviewThread(input: {
    pullRequestReviewId: $reviewId
    path: $path
    body: $body
    line: $line
    side: $side
  }) { thread { id } }
}' -f reviewId="$REVIEW_ID" -f path="src/foo.ts" \
   -F line=42 -f side=RIGHT -f body="$(cat body.md)"
```

- `-F` for `Int`, `-f` for `String` and enums
- For a range comment, add `$startLine: Int!` and `$startSide: DiffSide!` to the
  signature, and `startLine` / `startSide` to the input
- `$reviewId` is the **node id**, not the REST integer id — see
  [Node ids](#node-ids)

## 3. Edit or delete a single comment

Both work on comments inside a pending review, and neither touches the review
itself:

```bash
gh api repos/:owner/:repo/pulls/comments/<COMMENT_ID> -X PATCH -f body="..."
gh api repos/:owner/:repo/pulls/comments/<COMMENT_ID> -X DELETE
```

Comment ids come from the review's comment list:

```bash
gh api repos/:owner/:repo/pulls/<PR>/reviews/<ID>/comments --paginate \
  --jq '.[] | {id, path, original_position}'
```

## 4. Check every line before posting

**A comment can only anchor to a line that appears in the diff**, and one bad
anchor rejects the entire POST with
`422 Unprocessable Entity — Line could not be resolved`. The error does not name
the offending comment, so validate locally first: parse the `@@` hunk headers
out of `git diff -U0 <base>...HEAD -- <path>` and keep the set of right-side
line numbers each file actually offers.

Three anchors fail routinely and none of them are obvious:

- **An empty file has no addable line.** A `.gitkeep` is in the diff as a new
  file and still cannot take a comment.
- **A line past the end of the file**, usually because the finding cited a line
  number from an earlier draft of the code.
- **A line in a file GitHub declined to render**, such as `package-lock.json`.

Re-anchor rather than drop: move the comment to the code it is actually about. A
finding about a directory's placement can sit on the lint rule that names the
directory; a finding about a missing dependency can sit in the dependency block.

## 5. Verify anchoring

Pending comments return `line` and `start_line` as `null`. Read
`original_position` instead — but that is a position in the diff, not a line in
the file. See [Position is not line](#position-is-not-line).

## 6. Wait for the user

Do not submit. When the user says submit, request changes, comment or approve,
fire the event then. **If they say only "submit", ask which event** —
`REQUEST_CHANGES`, `COMMENT` or `APPROVE`. Never pick one for them: a request for
changes blocks the PR.

```bash
gh api repos/:owner/:repo/pulls/<PR>/reviews/<ID>/events -f event="<EVENT>"
```

Leave `body` out. The summary was set when the review was created, and a
`body` here would replace it.

## Node ids

GraphQL needs the review's node id, not its REST integer. Fetch both together:

```bash
gh api graphql -f query='
{ repository(owner:"OWNER", name:"REPO") {
    pullRequest(number: 1) {
      reviews(last: 5) { nodes { id databaseId state } } } } }'
```

`id` is the node id the mutation wants; `databaseId` is the integer the REST
paths take.

## Position is not line

`original_position` counts lines **in the diff**, not in the file. Getting this
wrong 422s the whole POST with `Line could not be resolved`.

The mapping rule:

- Position `0` is the **first** `@@` hunk header
- Every patch line after it increments the count, **including later `@@`
  headers**
- A removed (`-`) line consumes a position but maps to no file line

So a wholly new file with a single hunk has position equal to file line number,
and a modified file diverges, often wildly. When round-tripping comments —
backing them up and reposting — convert `original_position` to a file line using
each file's `patch` from `GET /pulls/<PR>/files`. Copying `original_position`
straight into `line` works on added files and silently breaks on modified ones.

## Cost

Content-creating requests are capped by GitHub's **secondary** rate limits,
which are separate from the 5,000/hour primary limit and far easier to hit:

- 80 content-creating requests per minute
- 500 per hour

Every comment in a review POST counts as one creation. Delete-and-repost is
therefore quadratic in edits — the *n*th comment costs _n_ creations, not one.

Measured on a real PR, over nine incremental rounds building a 66-comment
review:

```
delete + full repost:   421 creations
append per comment:      66 creations + 1 review create
```

That run hit the 500/hour wall and was blocked from creating content for the
rest of the window, with the review already deleted and not yet reposted.
**Append. Do not repost.**

A 49-comment review posted here as one `event: COMMENT` POST hit the per-minute
limit on its own, before any edits. So when a bulk create is genuinely needed —
the first batch, or restoring after a wipe — keep it to one POST, size that
batch well under 80, and pace everything after it.

## Dead forms

| Form                                                   | Result                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| `-f event=""` on review create                         | **422** — `PullRequestReviewEvent` rejects the empty string. Omit it. |
| `POST .../reviews/<ID>/comments`                       | **404** — that path is list-only. Append with the GraphQL mutation.   |
| `line` set from `original_position` on a modified file | **422** — `Line could not be resolved`                                |

## Event values

There is no default. Ask when the user has not said which.

- `REQUEST_CHANGES` — blocks the merge until the author responds
- `APPROVE`
- `COMMENT` — neutral
- omitted, leaving the review `PENDING` — keep it as a draft

## Rules

- **Never** use `gh pr comment` for review feedback. It has no diff anchor and
  no review state.
- **Never** delete a pending review to add or change a comment. Append, PATCH,
  or DELETE the single comment.
- **Never** submit on your own. A pending review stays pending until the user
  says to submit it.
- Inline only. The PR-level summary belongs in the review `body` set when the
  review is created, not in a separate issue comment and not in the submit
  call.
- Suggestions go in a ` ```suggestion ` fenced block inside the comment body.
- Keep the payload on disk as the source of truth. The local file is free to
  edit; the API is not.
