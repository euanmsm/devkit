// ============================================================================
// Review Page Notes
// ============================================================================
//
// The notes are the agent's half of the review page: the overview, the reading
// order and what each change means. They live as JSON files in one folder,
// merged in name order so separate agents can each write their own sections.
// Every check here returns problems as plain lines, so the agent can fix the
// notes it names and build again.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Fields that may appear in only one notes file. */
const SINGLE = ['title', 'overview', 'uiReview'];

/** Fields whose lists from every file are joined in name order. */
const JOINED = ['sections', 'skim'];

/**
 * Reads every `.json` file in the notes folder and merges them.
 *
 * @param dir - The notes folder
 * @returns The merged `notes` and any `problems`, each a line naming the file at fault
 */
export function loadNotes(dir) {
  const problems = [];
  const notes = { sections: [], skim: [] };
  const seen = {};

  let names;
  try {
    names = readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort();
  } catch {
    return {
      notes,
      problems: [`${dir}: no notes folder; write the notes there first`],
    };
  }
  if (!names.length) problems.push(`${dir}: holds no .json notes files`);

  for (const name of names) {
    let part;
    try {
      part = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
    } catch (error) {
      problems.push(`${name}: not valid JSON (${error.message})`);
      continue;
    }

    const shape = checkShape(part).map((problem) => `${name}: ${problem}`);
    problems.push(...shape);
    if (shape.length) continue;

    for (const key of SINGLE) {
      if (part[key] === undefined) continue;
      if (seen[key])
        problems.push(
          `${name}: ${key} is already set in ${seen[key]}; keep one`,
        );
      else {
        seen[key] = name;
        notes[key] = part[key];
      }
    }
    for (const key of JOINED) notes[key].push(...(part[key] ?? []));
  }

  return { notes, problems };
}

/**
 * Checks one notes file has the fields the page needs, of the right types.
 *
 * @param part - One parsed notes file
 * @returns Problems, each naming the field at fault
 */
export function checkShape(part) {
  const problems = [];
  const fail = (where, what) => problems.push(`${where} ${what}`);
  const text = (value) => typeof value === 'string' && value.trim() !== '';
  const texts = (value) =>
    text(value) ||
    (Array.isArray(value) && value.length > 0 && value.every(text));
  const list = (value) => Array.isArray(value);

  /** Checks a required or optional field against a test. */
  const field = (
    object,
    where,
    key,
    test,
    { required = true, means = 'text' } = {},
  ) => {
    if (object[key] === undefined) {
      if (required) fail(`${where}.${key}`, 'is missing');
      return false;
    }
    if (!test(object[key])) {
      fail(`${where}.${key}`, `must be ${means}`);
      return false;
    }
    return true;
  };
  const optional = { required: false };
  const object = (value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  if (!object(part)) return ['must be a JSON object'];
  for (const key of Object.keys(part)) {
    if (![...SINGLE, ...JOINED].includes(key)) {
      fail(
        key,
        `is not a notes field; use ${[...SINGLE, ...JOINED].join(', ')}`,
      );
    }
  }

  field(part, '', 'title', text, optional);

  if (
    field(part, '', 'overview', object, { required: false, means: 'an object' })
  ) {
    field(part.overview, 'overview', 'summary', text);
    for (const key of ['userChanges', 'holdInMind']) {
      field(part.overview, 'overview', key, (v) => list(v) && v.every(text), {
        required: false,
        means: 'a list of text',
      });
    }
  }

  if (field(part, '', 'sections', list, { required: false, means: 'a list' })) {
    part.sections.forEach((section, si) => {
      const at = `sections[${si}]`;
      field(section, at, 'title', text);
      field(section, at, 'intro', text, optional);
      if (
        !field(section, at, 'files', (v) => list(v) && v.length > 0, {
          means: 'a list of at least one file',
        })
      )
        return;

      section.files.forEach((file, fi) => {
        const fat = `${at}.files[${fi}]`;
        field(file, fat, 'path', text);
        field(file, fat, 'summary', text);
        field(file, fat, 'context', texts, {
          required: false,
          means: 'text or a list of text',
        });
        field(file, fat, 'changed', texts, {
          required: false,
          means: 'text or a list of text',
        });

        if (
          field(file, fat, 'tests', list, { required: false, means: 'a list' })
        ) {
          file.tests.forEach((test, ti) => {
            field(test, `${fat}.tests[${ti}]`, 'path', text);
            field(test, `${fat}.tests[${ti}]`, 'note', text, optional);
          });
        }

        if (
          field(file, fat, 'hunks', list, {
            required: false,
            means: 'a list, one entry per hunk',
          })
        ) {
          file.hunks.forEach((hunk, hi) => {
            const hat = `${fat}.hunks[${hi}]`;
            if (hunk === null) return;
            if (!object(hunk))
              return fail(hat, 'must be a note object, or null for no note');
            if (hunk.parts !== undefined) {
              if (
                !field(hunk, hat, 'parts', (v) => list(v) && v.length > 0, {
                  means: 'a list of at least one part',
                })
              )
                return;
              hunk.parts.forEach((p, pi) => {
                field(
                  p,
                  `${hat}.parts[${pi}]`,
                  'at',
                  (v) => /^\d+(-\d+)?(,\s*\d+(-\d+)?)*$/.test(String(v)),
                  {
                    means: 'a line or range such as "12" or "12-30"',
                  },
                );
                field(p, `${hat}.parts[${pi}]`, 'title', text);
                field(p, `${hat}.parts[${pi}]`, 'text', texts, {
                  means: 'text or a list of text',
                });
              });
            } else {
              field(hunk, hat, 'title', text);
              field(hunk, hat, 'text', texts, {
                means: 'text or a list of text',
              });
            }
          });
        }
      });
    });
  }

  if (field(part, '', 'skim', list, { required: false, means: 'a list' })) {
    part.skim.forEach((group, gi) => {
      const at = `skim[${gi}]`;
      field(group, at, 'label', text);
      field(group, at, 'note', text, optional);
      field(
        group,
        at,
        'paths',
        (v) => list(v) && v.length > 0 && v.every(text),
        { means: 'a list of at least one path' },
      );
    });
  }

  if (
    field(part, '', 'uiReview', object, { required: false, means: 'an object' })
  ) {
    const ui = part.uiReview;
    field(ui, 'uiReview', 'intro', text, optional);
    if (
      field(ui, 'uiReview', 'setup', list, { required: false, means: 'a list' })
    ) {
      ui.setup.forEach((step, i) => {
        field(step, `uiReview.setup[${i}]`, 'text', text);
        field(step, `uiReview.setup[${i}]`, 'cmd', text, optional);
      });
    }
    if (
      field(ui, 'uiReview', 'scenarios', (v) => list(v) && v.length > 0, {
        means: 'a list of at least one walkthrough',
      })
    ) {
      ui.scenarios.forEach((scenario, si) => {
        const at = `uiReview.scenarios[${si}]`;
        field(scenario, at, 'title', text);
        field(scenario, at, 'where', text, optional);
        field(scenario, at, 'why', texts, {
          required: false,
          means: 'text or a list of text',
        });
        field(
          scenario,
          at,
          'screen',
          (v) => list(v) && v.every((l) => typeof l === 'string'),
          {
            required: false,
            means: 'a list of lines',
          },
        );
        field(scenario, at, 'files', (v) => list(v) && v.every(text), {
          required: false,
          means: 'a list of paths',
        });
        if (
          field(scenario, at, 'steps', (v) => list(v) && v.length > 0, {
            means: 'a list of at least one step',
          })
        ) {
          scenario.steps.forEach((step, i) => {
            field(step, `${at}.steps[${i}]`, 'do', text);
            field(step, `${at}.steps[${i}]`, 'expect', text);
            field(step, `${at}.steps[${i}]`, 'cmd', text, optional);
          });
        }
      });
    }
    if (
      field(ui, 'uiReview', 'notPreviewable', list, {
        required: false,
        means: 'a list',
      })
    ) {
      ui.notPreviewable.forEach((item, i) => {
        field(item, `uiReview.notPreviewable[${i}]`, 'title', text);
        field(item, `uiReview.notPreviewable[${i}]`, 'why', text);
      });
    }
  }

  problems.push(...unknownFields(part));

  // Problems from the top level start with a stray dot; drop it.
  return problems.map((problem) => problem.replace(/^\./, ''));
}

/** The fields each kind of object in the notes may hold. */
const FIELDS = {
  overview: ['summary', 'userChanges', 'holdInMind'],
  section: ['title', 'intro', 'files'],
  file: ['path', 'summary', 'context', 'changed', 'hunks', 'tests'],
  test: ['path', 'note'],
  hunk: ['title', 'text', 'parts'],
  part: ['at', 'title', 'text'],
  skim: ['label', 'note', 'paths'],
  uiReview: ['intro', 'setup', 'scenarios', 'notPreviewable'],
  setup: ['text', 'cmd'],
  scenario: ['title', 'where', 'why', 'screen', 'files', 'steps'],
  step: ['do', 'expect', 'cmd'],
  notPreviewable: ['title', 'why'],
};

/**
 * Names every field the page would silently drop, so a typo or an invented
 * field is caught rather than lost.
 *
 * @param part - One notes file, already known to hold objects where it should
 * @returns Problems, each naming the field and the ones allowed there
 */
function unknownFields(part) {
  const problems = [];
  const check = (object, where, kind) => {
    if (object === null || typeof object !== 'object' || Array.isArray(object))
      return;
    for (const key of Object.keys(object)) {
      if (!FIELDS[kind].includes(key)) {
        problems.push(
          `${where}.${key} is not a field here; use ${FIELDS[kind].join(', ')}`,
        );
      }
    }
  };
  const each = (list, fn) => (Array.isArray(list) ? list.forEach(fn) : null);

  check(part.overview, 'overview', 'overview');
  each(part.sections, (section, si) => {
    check(section, `sections[${si}]`, 'section');
    each(section?.files, (file, fi) => {
      const at = `sections[${si}].files[${fi}]`;
      check(file, at, 'file');
      each(file?.tests, (test, ti) =>
        check(test, `${at}.tests[${ti}]`, 'test'),
      );
      each(file?.hunks, (hunk, hi) => {
        check(hunk, `${at}.hunks[${hi}]`, 'hunk');
        each(hunk?.parts, (p, pi) =>
          check(p, `${at}.hunks[${hi}].parts[${pi}]`, 'part'),
        );
      });
    });
  });
  each(part.skim, (group, gi) => check(group, `skim[${gi}]`, 'skim'));
  const ui = part.uiReview;
  check(ui, 'uiReview', 'uiReview');
  each(ui?.setup, (step, i) => check(step, `uiReview.setup[${i}]`, 'setup'));
  each(ui?.scenarios, (scenario, si) => {
    check(scenario, `uiReview.scenarios[${si}]`, 'scenario');
    each(scenario?.steps, (step, i) =>
      check(step, `uiReview.scenarios[${si}].steps[${i}]`, 'step'),
    );
  });
  each(ui?.notPreviewable, (item, i) =>
    check(item, `uiReview.notPreviewable[${i}]`, 'notPreviewable'),
  );
  return problems;
}

/**
 * Checks the merged notes against the diff: every changed file is placed
 * exactly once, nothing outside the diff is named, and each file's hunk notes
 * match its hunks.
 *
 * @param notes - The merged notes
 * @param files - The parsed diff
 * @returns Problems, each naming the file at fault
 */
export function checkNotes(notes, files) {
  const problems = [];
  const byPath = new Map(files.map((file) => [file.path, file]));

  if (!notes.overview)
    problems.push(
      'no overview: add one to a notes file such as 00-overview.json',
    );
  if (!notes.sections.length)
    problems.push(
      'no sections: every changed file needs a place in the reading order',
    );

  // Where each path is placed, to catch files left out or listed twice.
  const placed = new Map();
  const place = (filePath, where) =>
    placed.set(filePath, [...(placed.get(filePath) ?? []), where]);
  for (const section of notes.sections) {
    for (const file of section.files) {
      place(file.path, `section "${section.title}"`);
      for (const test of file.tests ?? [])
        place(test.path, `tests of ${file.path}`);
    }
  }
  for (const group of notes.skim) {
    for (const filePath of group.paths)
      place(filePath, `skim "${group.label}"`);
  }

  for (const [filePath, places] of placed) {
    if (!byPath.has(filePath))
      problems.push(`${filePath}: not in the diff; check the path`);
    else if (places.length > 1)
      problems.push(
        `${filePath}: listed ${places.length} times (${places.join('; ')}); keep one`,
      );
  }
  for (const filePath of byPath.keys()) {
    if (!placed.has(filePath))
      problems.push(
        `${filePath}: missing; add it to a section, a file's tests, or skim`,
      );
  }

  for (const section of notes.sections) {
    for (const file of section.files) {
      const diff = byPath.get(file.path);
      if (diff) problems.push(...checkHunkNotes(file, diff));
    }
  }

  for (const scenario of notes.uiReview?.scenarios ?? []) {
    for (const filePath of scenario.files ?? []) {
      if (!byPath.has(filePath))
        problems.push(
          `${filePath}: named by walkthrough "${scenario.title}" but not in the diff`,
        );
    }
  }

  return problems;
}

/**
 * Checks one reading-order file's hunk notes against its diff.
 *
 * @param file - The file's notes
 * @param diff - The file's parsed diff
 * @returns Problems naming the file
 */
function checkHunkNotes(file, diff) {
  const problems = [];
  const count = diff.hunks.length;

  if (!file.hunks) {
    if (count)
      problems.push(
        `${file.path}: no hunk notes for its ${count} hunk${count === 1 ? '' : 's'}`,
      );
    return problems;
  }
  if (file.hunks.length !== count) {
    problems.push(
      `${file.path}: ${file.hunks.length} hunk note${file.hunks.length === 1 ? '' : 's'} for ${count} hunk${count === 1 ? '' : 's'}`,
    );
  }

  // A deleted file only has old line numbers, so its parts cite those.
  const side = diff.status === 'deleted' ? 'o' : 'n';
  const shown = new Set(
    diff.hunks.flatMap((hunk) =>
      hunk.lines.map((line) => line[side]).filter((n) => n != null),
    ),
  );
  for (const hunk of file.hunks) {
    for (const part of hunk?.parts ?? []) {
      const outside = expandRange(part.at).filter((n) => !shown.has(n));
      if (outside.length) {
        problems.push(
          `${file.path}: part "${part.title}" cites line${outside.length === 1 ? '' : 's'} ${compactRange(outside)}, which the diff does not show`,
        );
      }
    }
  }
  return problems;
}

/**
 * Expands a line spec such as `"3,7-9"` into its line numbers.
 *
 * @param spec - A line, a range, or a comma-separated list of them
 * @returns Every line number it covers
 */
export function expandRange(spec) {
  return String(spec)
    .split(',')
    .flatMap((range) => {
      const [a, b = a] = range.trim().split('-').map(Number);
      return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
    });
}

/**
 * Writes line numbers back as ranges, so a problem stays one short line.
 *
 * @param numbers - Ascending line numbers
 * @returns Text such as `"3, 7-9"`
 */
function compactRange(numbers) {
  const runs = [];
  for (const n of numbers) {
    const last = runs.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else runs.push([n, n]);
  }
  return runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', ');
}
