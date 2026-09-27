// ============================================================================
// PR Test Helpers
// ============================================================================
//
// Generates the PR workflow from a fixture config and answers its agents with
// canned replies shaped by a scenario, for the engine and sync tests.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sync } from '../src/sync.mjs';
import { makeRepo, write } from './repo.mjs';

/** The folder holding the Curricular and Sales harness PR configs. */
export const FIXTURES = fileURLToPath(
  new URL('./fixtures/pr/', import.meta.url),
);

/** A PR template with the summary marker. */
export const TEMPLATE =
  '## Summary\n\n<!-- pr-qa:summary -->\n\n## Screenshots\n';

/**
 * Makes a repository with the PR skill configured from a fixture.
 *
 * @param fixture - `curricular` or `sales`, or null for no config module
 * @param options - `overrides` spread over the fixture's export, the skill's `options`, and shared `settings`
 * @returns The repository root
 */
export function prRepo(
  fixture,
  { overrides = {}, options = {}, settings = {} } = {},
) {
  const root = makeRepo({
    'skills.json': { ...settings, skills: { pr: options } },
    ...(fixture
      ? {
          'pr.mjs': `import base from ${JSON.stringify(join(FIXTURES, `${fixture}.mjs`))};\nexport default { ...base, ...${JSON.stringify(overrides)} };\n`,
        }
      : {}),
  });
  write(root, '.github/pull_request_template.md', TEMPLATE);
  return root;
}

/**
 * Generates the PR workflow script for a fixture.
 *
 * @param fixture - `curricular` or `sales`
 * @param overrides - Spread over the fixture's export
 * @returns The generated script's text
 */
export async function prWorkflow(fixture, overrides = {}) {
  const settings = fixture === 'sales' ? { skillsDir: '.agents/skills' } : {};
  const root = prRepo(fixture, { overrides, settings });
  await sync(root);
  return readFileSync(
    join(root, settings.skillsDir ?? '.claude/skills', 'pr/pr-qa.workflow.js'),
    'utf8',
  );
}

/**
 * Builds workflow args the way the prepass prints them.
 *
 * @param sections - Which sections the branch touches, by key
 * @param extra - Args to add or replace
 * @returns The args
 */
export function prArgs(sections, extra = {}) {
  return {
    branch: 'feature/thing',
    base: 'main',
    diffStat: ' src/a.ts | 2 +-',
    diffPath: '/scratch/pr-qa-diff.tmp.patch',
    patchDir: '/scratch/pr-qa-patches',
    factsPath: '/scratch/pr-qa-facts.tmp.md',
    largeDiff: false,
    sections,
    storyCount: 0,
    scratchDir: '/scratch',
    ...extra,
  };
}

/**
 * Reads the inventory entries a drafting prompt lists.
 *
 * @param prompt - A drafting prompt
 * @returns The entries it asks the drafter to cover
 */
export function promptEntries(prompt) {
  const start = prompt.indexOf('## Inventory entries to cover\n');
  const end = prompt.indexOf('\n\nEvery entry resolves');
  return JSON.parse(
    prompt.slice(start + '## Inventory entries to cover\n'.length, end),
  );
}

const GOOD_BACKEND = '```bash\ncurl -s "$PORT/x"\n```\n\n**Expect:** `200`';
const GOOD_HUMAN = 'Open the page.\n\n**Expect:** "Saved"';

/**
 * Reads the units a verification prompt hands its checker.
 *
 * @param prompt - A `verify:` prompt
 * @returns The units, each with its `id`, `name`, `kind` and `body`
 */
export function promptUnits(prompt) {
  return JSON.parse(
    prompt.slice(prompt.indexOf('## The units\n') + '## The units\n'.length),
  );
}

/**
 * Builds a canned-reply function for one scenario.
 *
 * The scenario sets the `visible` sections, the `backend` and `human` entry
 * counts over `files`, the `claims` and `failClaims` ids, a `verify` verdict
 * function, `badFormat` human steps, and the number of `stories`.
 *
 * `verify` is asked about one unit at a time, as `verify:<unit name>` with
 * `:r<round>` after the first round, and returns `{ verdict, findings,
 * rewrite }`, or null to leave that unit out of the checker's answer.
 *
 * @param scenario - The knobs above, each optional
 * @returns The reply function for `runWorkflow`
 */
export function prReplies(scenario = {}) {
  const {
    visible = null,
    backend = 3,
    human = 2,
    files = 3,
    claims = [],
    failClaims = [],
    verify = () => ({ verdict: 'PASS', findings: 'holds' }),
    badFormat = false,
    stories = 1,
  } = scenario;

  return (label, prompt) => {
    if (label === 'context-pack') {
      const keys = [...prompt.matchAll(/`(\w+)` — /g)].map((m) => m[1]);
      return {
        packPath: '/scratch/pr-qa-pack.tmp.md',
        testFiles: [{ file: 'src/a.test.ts', asserts: 'a works' }],
        visibleSections: visible ?? keys,
      };
    }

    if (label.startsWith('surfaces:')) {
      return {
        surfaces: [
          { surface: 'the home page', reachedBy: 'sign in', state: 'empty' },
        ],
        unresolved: [],
      };
    }

    if (label.startsWith('inventory:')) {
      const name = label.slice('inventory:'.length);
      if (name === 'backend') {
        return {
          entries: Array.from({ length: backend }, (_, i) => ({
            id: `be-${i + 1}`,
            behaviour: `backend behaviour ${i + 1}`,
            where: `src/service/file${i % files}.ts:${10 + i}`,
            reachable: 'POST /x',
            actors: 'API caller',
            visible: false,
            section: null,
          })),
        };
      }
      if (name === 'cross-cutting') {
        return {
          entries: [
            {
              id: 'xc-1',
              behaviour: 'a rejected caller',
              where: 'src/service/file0.ts:99',
              reachable: 'POST /x without a token',
              actors: 'API caller',
              visible: false,
              section: null,
              dimension: 'authorisation',
            },
          ],
        };
      }
      return {
        entries: Array.from({ length: human }, (_, i) => ({
          id: `${name}-${i + 1}`,
          behaviour: `${name} behaviour ${i + 1}`,
          where: `src/ui/view${i}.tsx:5`,
          reachable: 'click Save',
          actors: 'user',
          visible: true,
          section: name,
        })),
      };
    }

    if (label.startsWith('audit:')) return { entries: [] };

    if (label.startsWith('draft:backend')) {
      const entries = promptEntries(prompt);
      return {
        steps: entries
          .filter((entry) => !claims.includes(entry.id))
          .map((entry) => ({
            title: `Check ${entry.id}`,
            priority: 'blocking',
            body: GOOD_BACKEND,
            coversEntryIds: [entry.id],
            minutes: 2,
          })),
        coveredByTests: entries
          .filter((entry) => claims.includes(entry.id))
          .map((entry) => ({
            entryId: entry.id,
            testFile: 'src/a.test.ts',
            assertion: `asserts ${entry.id}`,
          })),
        gaps: [],
      };
    }

    if (label === 'draft:boot')
      return { markdown: '```bash\nnpm run dev\n```' };
    if (label === 'draft:summary' || label === 'summary') {
      return { markdown: 'Adds the thing.' };
    }

    if (label === 'draft:storybook') {
      return {
        items: Array.from({ length: stories }, (_, i) => ({
          metaTitle: `Features/Thing${i}`,
          exports: ['Default'],
          storyFile: `src/ui/Thing${i}.stories.tsx`,
          whatChanged: 'The badge is now green.',
        })),
      };
    }

    if (label.startsWith('draft:')) {
      return {
        steps: promptEntries(prompt).map((entry, i) => ({
          title: `See ${entry.id}`,
          priority: i === 0 ? 'blocking' : 'if-time',
          body: badFormat ? 'Open the page and look.' : GOOD_HUMAN,
          coversEntryIds: [entry.id],
          minutes: 3,
        })),
        coveredByTests: [],
        gaps: [{ gap: 'screen reader output', why: 'needs a screen reader' }],
      };
    }

    if (label.startsWith('verify:')) {
      const round = /:r(\d+)(?::b\d+)?$/.exec(label)?.[1];
      return {
        verdicts: promptUnits(prompt).flatMap((unit) => {
          const verdict = verify(
            `verify:${unit.name}${round ? `:r${round}` : ''}`,
            unit,
          );
          return verdict ? [{ rewrite: null, ...verdict, id: unit.id }] : [];
        }),
      };
    }

    if (label.startsWith('claim:')) {
      const id = label.slice('claim:'.length);
      return { holds: !failClaims.includes(id), evidence: 'line 12' };
    }

    if (label.startsWith('convert:')) {
      const id = label.slice('convert:'.length);
      return {
        steps: [
          {
            title: `Converted ${id}`,
            priority: 'blocking',
            body: GOOD_BACKEND,
            coversEntryIds: [id],
            minutes: 4,
          },
        ],
        coveredByTests: [],
        gaps: [],
      };
    }

    if (label.startsWith('format:')) {
      return {
        markdown: `${prompt.split('The step:\n')[1].split('\n\nReturn')[0]}\n\n**Expect:** "Fixed"`,
      };
    }

    throw new Error(`No canned reply for ${label}`);
  };
}
