<!-- pr-qa:manual-checklist -->
<!-- pr-qa:sha=abc1234abc1234abc1234abc1234abc1234abc12 -->
<!-- pr-qa:banner:start -->
<!-- pr-qa:banner:end -->

## Manual QA — `abc1234`

_Triage: behaviour change (large) · needs database, api, page · about 36 minutes_

### Boot (run once, from the repo root)

```bash
npm run db:start
npm run dev
```

---

## Agent-Runnable Backend Checks

_About 7 minutes; 2 of 3 steps are blocking. Paste what you observed under each step._

**Setup:**

Derive the DSN from `apps/web/.env.local`.

- [x] **[blocking] Backend 1 — The assistant refuses a request with only a system message**

```bash
curl -s -X POST "http://localhost:$PORT/api/agents/assistant"
```

**Expect:** `400`, from `apps/web/src/app/api/agents/route.ts`.

  > **Observed** (agent, `abc1234`): `400`.

- [x] **[blocking] Backend 2 — The lockfile keeps msw nested under apps/web**

The alias in `apps/web/next.config.ts` points at the nested copy.

**Expect:** `apps/web/node_modules/msw`.

  > **Observed** (agent, `0ld0ld0`): an earlier pass.

  > **Failed** (agent, `abc1234`): a root entry is still there.

- [ ] **[if-time] Backend 3 — The monitoring tunnel is not redirected to login**

**Expect:** anything but `307`.

**Teardown:**

Nothing to undo.

**Covered by:** `apps/web/src/app/api/agents/route.test.ts`

---

## Agent-Runnable Frontend Checks

_Claude in Chrome runs these. About 16 minutes; 1 of 1 steps are blocking. Paste what you observed under each step._

- [ ] **[blocking] Frontend 1 — Room PDF renders in dev and in the production build**

**Expect:** pages named `Page 1`, `Page 2` and so on.

---

## Human UI / UX Checks

_About 13 minutes; 1 of 1 steps are blocking._

- [ ] **[blocking] Frontend 2 — Deadline calendar looks right and works from the keyboard**

**Expect:** the weekday headings line up, styled in `components/primitives/calendar.tsx`.

---

## Storybook Review Checks

- [ ] **Teacher/Recall/New** — DeadlineOpen
      The deadline popover has the accessible name "Choose a deadline".

---

### Local CI

- [ ] Review agents (run locally before merge)
- [x] Full test suite passes (run locally)

  > **Observed** (agent, `0ld0ld0`): an earlier run.

  > **Observed** (agent, `abc1234`): `npm run test:suite` exit 0.
