# The experience

Every screen and flow, before any code. The rule throughout: `crib <tool>`
behaves exactly as it does today, and the learning feature hangs off two new
first words — `learn` and `drill` — which become reserved names no tool can take
(alongside `all`).

## The map

```
crib learn                          the courses, with your progress
crib learn shell                    one course's lesson menu
crib learn shell --line-editor      read a lesson (paged, like any topic)
crib learn shell --line-editor --practice   practise that lesson
crib learn shell --practice         practise the whole course
crib drill                          everything due for review, across courses
crib drill git                      due cards from one course only
```

The same conventions as the reference side, because fingers already know them:
the `--` is optional, prefixes resolve (`crib learn sh --line` works), and an
ambiguous prefix lists the matches instead of guessing.

## `crib learn` — the course list

```
  Courses:  crib learn <course>

    shell        Your shell — line editing, history, globbing, jobs   ▸ 3/6 read
    pipeline     Pipes, xargs and the text tools                      ▸ unread
    git          Git beyond add, commit, push                         ▸ done
    fzf          Fuzzy finding everywhere                             ▸ 1/4 read
    ...

  14 cards due for review — crib drill
```

Progress markers are quiet — a count, not a progress bar. The due-card line
appears only when something is due, so a fresh install shows nothing but
courses.

## `crib learn shell` — a course

```
  shell — Your shell: line editing, history, globbing, jobs

  Lessons, in order:  crib learn shell --<lesson>

    ✓ line-editor    The keys that edit the line you're typing
    ✓ history        Ctrl-R, history settings, !$ and friends
    ✓ aliases        What earns an alias, and writing functions
      globbing       Expansion, braces, **, and why rg foo *.ts surprises
      job-control    &, Ctrl-Z, bg, fg, and orphaned processes
      config         A .zshrc that earns its keep

  Practice:  crib learn shell --practice        21 exercises, 9 tried
```

Lessons are ordered deliberately — a course is a path, not a pile. `✓` means
read (you reached the end of it at least once), nothing more; there's no gating,
and any lesson is openable at any time.

## Reading a lesson

`crib learn shell --line-editor` prints prose — headed sections, short
paragraphs, command lines rendered in the same colours and columns as guide
items, so the two halves of the tool look like one tool. Long lessons page
through `$PAGER` exactly like a long topic does.

Every lesson ends the same way:

```
  ───
  Reference:  crib zsh --keys
  Practice:   crib learn shell --line-editor --practice    6 exercises
```

Reaching the end marks it read. The reference line links the lesson to the guide
that will serve you after the course is forgotten; writing a lesson with no
guide to point at is the prompt to write the guide.

## A practice session

`--practice` starts an interactive session: plain question-answer at the prompt,
no screen takeover, scrollback intact. A session is short by design — up to ~10
exercises, a few minutes — and Ctrl-C or `q` ends it cleanly at any point,
progress kept.

```
  Practising shell / line-editor — 6 exercises


  1/6  Your cursor is at the end of a long command and the typo is in the
       first word. One keystroke to get there?

       > ctrl-a

  ✓  Ctrl-A — start of line. (Ctrl-E returns to the end.)


  2/6  Which of these deletes the whole word behind the cursor?

         a) Ctrl-U      b) Ctrl-W      c) Ctrl-K      d) Ctrl-Y

       > b

  ✓  Ctrl-W. (Ctrl-U takes everything to the start of line, not one word.)


  3/6  Recall: rerun the previous command, substituting one word.

       (enter to reveal)

       ^old^new

       Did you have it?  [y/n] > y


  Done — 5 of 6, and the one you missed is queued for tomorrow.
```

Three formats visible there — typed answer, multiple choice, and a self-graded
recall card — defined properly in `exercises.md`. Wrong answers always show the
right one immediately with a one-line why; there are no second guesses within a
session, because the retry mechanism _is_ the drill queue.

## `crib drill` — the daily habit

Drill is the same session loop fed by the scheduler instead of by a lesson:
every card you've ever practised has a review date, wrong answers come back
sooner, right answers stretch further out (the scheme is in `exercises.md`).

```
  14 due — oldest first, mixed across courses.  q to stop any time.
```

`crib drill` with nothing due says so in one line and exits — it must be cheap
to run on reflex. `crib drill git` filters to one course. A `--new N` flag can
pull in unpractised cards from read lessons, for topping the deck up without
opening a course.

## A sandbox exercise

The fourth format gets its own flow. From a practice session, or directly:

```
$ crib learn git --practice

  4/5  Sandbox: reflog-rescue

  You're in a repo where a hard reset threw away two commits. Get them
  back — the branch should end up pointing where it did before the reset.

  A shell is opening in the sandbox. Do the task, then `exit`.
  (`crib` still works in there; so does `exit 1` to give up.)

  ── sandbox shell ────────────────────────────────────────────────
  $ git reflog
  ...
  $ git reset --hard HEAD@{2}
  $ exit
  ─────────────────────────────────────────────────────────────────

  ✓  main is back at 4c9e2a1, both commits reachable.

     One way:  git reflog        find where the branch was
               git reset --hard HEAD@{2}
```

The sandbox is a directory crib created under the system temp dir; your real
repos are never involved. The check inspects the outcome — where refs point,
what files contain — never the commands you typed, so any correct route passes.
Success or failure, the model route is printed, because seeing a cleaner way
than yours is half the value.

## Failure and edge screens

- `crib learn nosuch` — same shape as today's unknown-tool error, listing the
  courses.
- Ambiguous lesson prefix — same shape as today's ambiguous topic.
- `--practice` when a lesson has no exercises yet — says so, suggests the
  course-level `--practice`.
- Interactive session with stdout not a TTY — refuses with a one-liner (sessions
  can't be piped); plain lesson reading pipes fine, as all reference output does
  today.
- A sandbox left dirty by a crash — sandboxes are created fresh per run and the
  temp dir is disposable; `crib learn --clean` sweeps old ones.
