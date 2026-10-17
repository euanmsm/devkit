{{marker}}

# Review page notes

The notes are JSON files in the page folder's `notes/` folder, merged in name
order. `sections` and `skim` from every file are joined in that order; `title`,
`overview` and `uiReview` may each appear in only one file. Any text field can
use `` `code` ``, `**bold**` and `*italic*`.

Fields marked _optional_ can be left out. Everything else is required. The
build names any field that is missing, the wrong type, or not listed here.

## Overview — `00-overview.json`

```json
{
  "title": "Retry failed uploads before showing an error",
  "overview": {
    "summary": "Uploads that fail on a dropped connection now retry three times with a growing wait before the user sees an error. Until now one network blip lost the upload.",
    "userChanges": [
      "A brief connection drop no longer fails an upload; the progress bar pauses and carries on."
    ],
    "holdInMind": [
      "Retries happen in the upload queue, not the API client, so other requests are unaffected."
    ]
  }
}
```

- `title` _optional_ — one line. The PR title is used when it is left out.
- `overview.summary` — two to four sentences: what the branch does and why.
- `overview.userChanges` _optional_ — what changes for the people using the
  product, one item each.
- `overview.holdInMind` _optional_ — what a reader needs in mind before the
  files, one item each.

## Sections — `01-<section>.json` onwards

```json
{
  "sections": [
    {
      "title": "The upload queue",
      "intro": "Where retries now live. Read this before its callers.",
      "files": [
        {
          "path": "src/uploads/queue.ts",
          "summary": "The queue retries a failed upload before reporting it.",
          "context": "The queue owns every upload the app starts: it runs them one at a time and tells the progress bar how far each has got.",
          "changed": "A failed upload used to be reported straight away. Now a network error puts it back at the front of the queue after a wait that doubles each time, up to three tries.",
          "hunks": [
            { "title": "Retry settings", "text": "The try count and first wait, kept together so they are easy to tune." },
            { "title": "Requeue on network errors", "text": ["Only network errors retry; a rejected file still fails at once.", "The wait doubles from the first one."] },
            null
          ],
          "tests": [
            { "path": "src/uploads/__tests__/queue.test.ts", "note": "Covers the third failure becoming an error." }
          ]
        },
        {
          "path": "src/uploads/backoff.ts",
          "summary": "New helper that works out each retry's wait.",
          "hunks": [
            {
              "parts": [
                { "at": "1-12", "title": "Wait for a try", "text": "Doubles the first wait for each try so far." },
                { "at": "14-20", "title": "Cap", "text": "Never waits longer than ten seconds." }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- `title` — names what the section holds.
- `intro` _optional_ — one or two sentences on why to read it here.
- `files` — the files in the order to read them. Each has:
  - `path` — exactly as the brief gives it.
  - `summary` — one sentence: what the file now does differently.
  - `context` _optional_ — text, or a list of paragraphs: the part of the
    system this file belongs to.
  - `changed` _optional_ — text, or a list of paragraphs: the change as a whole.
  - `hunks` — one entry per hunk, in the brief's order (`git diff -M <fork>
    HEAD -- <path>` lists them). Each is one of:
    - `{ "title", "text" }` — `text` is a string or a list of paragraphs;
    - `{ "parts": [{ "at", "title", "text" }] }` — for an added or deleted
      file's single hunk, split by line range. `at` is a line, a range or a
      list: `"12"`, `"12-30"` or `"3,7-9"`. It uses new-side lines, or old-side
      lines for a deleted file;
    - `null` — no note for that hunk.

    Leave `hunks` out only for a file with no hunks, such as a pure rename.
  - `tests` _optional_ — test files read with this file, each with a `path` and
    an _optional_ `note`. They need no hunk notes.

## Skim — `80-skim.json`

```json
{
  "skim": [
    {
      "label": "Import paths after the `uploads/` move",
      "note": "Only the import lines change.",
      "paths": ["src/app/page.tsx", "src/app/settings/page.tsx"]
    }
  ]
}
```

- `label` — the kind of change.
- `note` _optional_ — why it needs no reading.
- `paths` — the files, exactly as the brief gives them. A test that only
  changed mechanically can sit here with its source file. Skim files need no
  hunk notes.

## UI / UX review — `90-ui.json`

Only when the branch changes what a user sees or does.

```json
{
  "uiReview": {
    "intro": "Check the retry by cutting the network mid-upload.",
    "setup": [
      { "text": "Start the app against the local API.", "cmd": "npm run dev" }
    ],
    "scenarios": [
      {
        "title": "A dropped connection pauses the upload",
        "where": "Files → Upload",
        "why": "One network blip used to lose the upload.",
        "files": ["src/uploads/queue.ts"],
        "screen": ["Uploading report.pdf", "[#####.....] 50%  retrying in 2s"],
        "steps": [
          { "do": "Start the app.", "expect": "The Files page loads.", "cmd": "npm run dev" },
          { "do": "Start uploading a large file, then turn the network off for five seconds.", "expect": "The progress bar pauses and shows a retry countdown." },
          { "do": "Turn the network back on.", "expect": "The upload carries on from where it paused and finishes." }
        ]
      }
    ],
    "notPreviewable": [
      { "title": "Third failure", "why": "Needs the network down for over 30 seconds; the queue test covers it." }
    ]
  }
}
```

- `intro` _optional_ — one or two sentences on what to check.
- `setup` _optional_ — steps to get the app running, each with `text` and an
  _optional_ `cmd` to copy.
- `scenarios` — one walkthrough per user-visible change:
  - `title` — the change, as the user meets it.
  - `where` _optional_ — where in the app.
  - `why` _optional_ — text, or a list of paragraphs: what changed and why.
  - `files` _optional_ — the changed files behind it, as the brief gives them.
  - `screen` _optional_ — lines sketching what should appear, for terminal UIs.
  - `steps` — each with what to `do`, what to `expect`, and an _optional_
    `cmd` to copy when the step runs a command.
- `notPreviewable` _optional_ — changes the local setup cannot show, each with
  a `title` and `why`.
