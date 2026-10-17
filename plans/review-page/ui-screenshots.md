# Review page: to do

## Screenshots in the UI / UX review

The UI review's right column shows a hand-written terminal mock of each screen.
That works poorly for React apps and can drift from the real UI. Instead, a
subagent should render the changed screens with test data and capture them,
ideally before and after, while the review page is being built.

### The idea

Capture splits into three parts: get the UI into a known state, drive it to the
screen, and capture what is there. The skill owns the last part. Each project
supplies the first two through an adapter.

Two ways to get a screen up, preferring the first:

- **Render it with the project's test harness, no running stack.** React has
  Storybook or Playwright component testing. This repo's TUI page tests already
  render real screens at a fixed terminal size, against a fake API, pressing
  real keys. `page-editing-facts.test.tsx` already does "open the editor, Tab to
  facts, tick, save", and the frame it checks is the screenshot. This is fast
  and the same on every run.
- **Run the real app on seed data and drive it.** Slower and more fragile, but
  shows the whole system:
  - **Web:** Playwright against the dev server.
  - **TUI:** a virtual terminal. Charm's VHS writes PNGs or GIFs from a short
    script; `@xterm/headless` or `tmux capture-pane` give the raw frame.
  - **Electron:** Playwright drives it.
  - **Native mobile:** `xcrun simctl` or `adb screencap`.
  - **Fallback for anything else:** computer use, slow and unreliable.

### Before and after

Check out the base commit in a second worktree with devkit's `wt`, which gives
it its own ports and database. Run the same capture on both copies:

- **Web screenshots:** compare the two pixel by pixel to highlight what changed,
  and to catch screens that changed by accident.
- **TUI frames:** these are text, so they compare as an exact text diff. They're
  tiny, and their text can be selected and copied.

### Walkthrough steps become runnable

Give each UI review step a machine form beside its human one:

```json
{
  "do": "Press Tab twice.",
  "expect": "The cursor moves to facts…",
  "keys": ["tab", "tab"],
  "capture": true
}
```

The subagent plays the steps and captures each one. A step that will not run, or
a capture that does not match its "expect", means the walkthrough is wrong, so
the steps are checked before a reviewer sees them.

### Per-project config

A `.devkit/review-page.json`, like devkit's other tools:

```json
{
  "capture": {
    "kind": "tui",
    "mode": "harness",
    "size": [160, 40],
    "harness": "packages/sales-system/tui/src/testing/render-screen.tsx",
    "stack": {
      "setup": ["npm run sales:db-reset"],
      "start": "npm run stack:dev"
    }
  }
}
```

The skill reads this. The subagent only writes what changes per branch: which
screens to capture and how to reach them.

### Keeping captures stable

Use fake data, a frozen clock, a fixed screen or terminal size and no
animations. Mask anything that always differs, such as relative timestamps and
ids, or every comparison flags noise.

### Risks

- A full stack is slow to start and can collide with one already running. The
  test-harness route avoids it.
- Native mobile and desktop apps need simulators and permissions. Support them
  later.
- Store images in `tmp/<branch>/shots/` beside `review.html` rather than
  embedding them, so the page stays small.

### First step when we come back

Prototype on the sales repo through the test harness. Capture coloured frames
for the eight walkthroughs on this branch and its base, using the TUI's existing
test helpers, and show them in the right column as a terminal with a
Before/After toggle. A Playwright adapter for a web project comes second.
