<!-- pr-qa:manual-checklist -->
<!-- pr-qa:sha=abc1234abc1234abc1234abc1234abc1234abc12 -->
<!-- pr-qa:banner:start -->
<!-- pr-qa:banner:end -->

## Manual QA — `abc1234`

<details><summary><b>Boot and caveats</b> · about 36 min in all</summary>

_Triage: behaviour change (large) · needs database, api, page · about 36 minutes_

### Boot (run once, from the repo root)

```bash
npm run db:start
npm run dev
```

### Environment caveats

- **Every feature flag is forced on under `npm run dev`.**

</details>

**Backend** · agent · about 7 min

- [x] **Backend 1** — The assistant refuses a request with only a system message
- [x] **Backend 2** — The lockfile keeps msw nested under apps/web · ❌ failed
- [ ] **Backend 3** · if-time — The monitoring tunnel is not redirected to login

<details><summary>How to run the Backend steps</summary>

<details><summary>Setup, teardown and coverage</summary>

**Setup:**

Derive the DSN from `apps/web/.env.local`.

> **Observed** (agent, `abc1234`): the DSN had the usual shape.

**Teardown:**

Nothing to undo.

**Covered by:** `apps/web/src/app/api/agents/route.test.ts`

</details>

<details><summary><b>Backend 1</b> — The assistant refuses a request with only a system message</summary>

```bash
curl -s -w '\n%{http_code}\n' -X POST "http://localhost:$PORT/api/agents/assistant"
```

**Expect:** `400`, from `apps/web/src/app/api/agents/route.ts`.

**On main:** `400` with a different message.

> **Observed** (agent, `abc1234`): `400`.

</details>

<details><summary><b>Backend 2</b> — The lockfile keeps msw nested under apps/web</summary>

```bash
jq -r '.packages | keys[]' package-lock.json | grep msw
```

The alias in `apps/web/next.config.ts` points at the nested copy.

**Expect:**

```
apps/web/node_modules/msw
- [x] not a box, it is output
<details>
```

**On main:** `node_modules/msw`.

> **Observed** (agent, `0ld0ld0`): an earlier pass.

```
node_modules/msw
```

> **Failed** (agent, `abc1234`): a root `node_modules/msw` entry is still there.
> The alias would point at a missing file.

</details>

<details><summary><b>Backend 3</b> — The monitoring tunnel is not redirected to login</summary>

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "http://localhost:$PORT/monitoring"
```

**Expect:** anything but `307`.

**On main:** `307`.

</details>

</details>

**Frontend** · agent · about 16 min

- [ ] **Frontend 1** — Room PDF renders in dev and in the production build

<details><summary>How to run the Frontend steps</summary>

<details><summary>Setup</summary>

_Claude in Chrome runs these._

Sign in as the seeded teacher.

</details>

<details><summary><b>Frontend 1</b> — Room PDF renders in dev and in the production build</summary>

1. Open the room page.

**Expect:** pages named `Page 1`, `Page 2` and so on.

**On main:** the same pages from an older viewer.

</details>

</details>

**Frontend** · human · about 13 min

- [ ] **Frontend 2** — Deadline calendar looks right and works from the keyboard

<details><summary>How to run the Frontend steps</summary>

<details><summary>Setup, teardown and coverage</summary>

_Run these after the agent half: they rely on its setup._

**Teardown:**

Restore the teacher's theme.

**Covered by:** `apps/web/e2e/deadline.spec.ts`

</details>

<details><summary><b>Frontend 2</b> — Deadline calendar looks right and works from the keyboard</summary>

1. Open the new assignment page and click **"No deadline"**.

**Expect:** the weekday headings line up with their columns, styled in `components/primitives/calendar.tsx`.

</details>

</details>

**Storybook** · human

- [ ] **Teacher/Recall/New** — DeadlineOpen

<details><summary>How to run the Storybook checks</summary>

<details><summary><b>Teacher/Recall/New</b> — DeadlineOpen</summary>

The deadline popover has the accessible name "Choose a deadline".

</details>

</details>

<details><summary><b>Not covered here</b> · 1 check</summary>

- Sentry events show Authorization as [Filtered] — needs a real Sentry project

</details>

**When you're finished**, stop the stack: `npm run db:stop`

**Local CI**

- [ ] Review agents (run locally before merge)
- [x] Full test suite passes (run locally)

<details><summary>Local CI notes</summary>

Storybook tests are dispatch-only.

> **Observed** (agent, `0ld0ld0`): an earlier run.

> **Observed** (agent, `abc1234`): `npm run test:suite` exit 0.

</details>
