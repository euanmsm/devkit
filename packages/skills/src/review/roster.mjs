// ============================================================================
// Code Review Roster
// ============================================================================
//
// Builds the parts of the code review's SKILL.md that describe the repository's
// own lenses and bundles, so the page and the workflow script are generated
// from the same config and cannot disagree.

import { reportName } from './prepass.mjs';

const COUNT_WORDS = [
  'No',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
];

/**
 * Builds every template value the code review's SKILL.md needs.
 *
 * @param review - The resolved review config
 * @param options - The skill's options from `skills.json`
 * @param shared - The shared settings, for `rulesDir`
 * @returns Values by placeholder name
 */
export function skillValues(review, options, shared) {
  const tools = review.prepass.tools;

  return {
    name: review.name,
    githubReview: options.githubReview,
    skillsDir: review.skillsDir,
    rulesDir: shared.rulesDir,
    configPath: options.config,
    presentStep: options.githubReview ? 7 : 6,
    targetGlobs: listOf(review.files.targetExtensions.map((ext) => `*.${ext}`)),
    toolNames: listOf(tools.map((tool) => tool.key)),
    reportFiles: listOf([...tools.map(reportName), '_import-graph.tmp.md']),
    toolReportArgs: tools
      .map(
        (tool) => `      ${tool.key}: \`\${SCRATCH_DIR}/${reportName(tool)}\`,`,
      )
      .join('\n'),
    judgmentSection: judgmentSection(review),
    splitTable: splitTable(review),
    bundleTables: bundleTables(review),
    noSkillLine: noSkillLine(review),
    diffOnlyLenses:
      review.diffOnlyLenses.length > 0
        ? listOf(review.diffOnlyLenses)
        : 'none in this repository',
    rosterNotes: review.rosterNotes
      ? `\n### Notes for this repository\n\n${review.rosterNotes.trim()}\n`
      : '',
  };
}

/**
 * Lists the lenses Recon decides, with the sentence it is given for each.
 *
 * @param review - The resolved review config
 * @returns The section markdown
 */
function judgmentSection(review) {
  const rows = Object.entries(review.lenses)
    .filter(([, lens]) => lens.route.judgment)
    .map(([key, lens]) => `| \`${key}\` | ${cell(lens.route.judgment)} |`);

  if (rows.length === 0) {
    return 'Every lens routes from its path, so none is left to Recon.';
  }

  const count = COUNT_WORDS[rows.length] ?? String(rows.length);

  return `${count} ${rows.length === 1 ? 'lens is' : 'lenses are'} left to Recon, because a path cannot decide ${rows.length === 1 ? 'it' : 'them'}:

| Lens | When Recon adds it |
| ---- | ------------------ |
${rows.join('\n')}`;
}

/**
 * Lists each bundle that splits and the two agents it becomes.
 *
 * @param review - The resolved review config
 * @returns The table markdown
 */
function splitTable(review) {
  const byKey = new Map(review.bundles.map((bundle) => [bundle.key, bundle]));

  const rows = review.splitOrder.map((key) => {
    const parts = byKey
      .get(key)
      .split.map((part) => `${codeList(part.lenses)} (${part.model})`)
      .join(' + ');
    return `| \`${key}\` | ${parts} |`;
  });

  if (rows.length === 0) return 'No bundle in this repository splits.';

  return `In split order:

| Bundle | Splits into |
| ------ | ----------- |
${rows.join('\n')}`;
}

/**
 * Lists the bundles, cross-cutting first, with what fires each layer-scoped one.
 *
 * @param review - The resolved review config
 * @returns The tables markdown
 */
function bundleTables(review) {
  const target = review.bundles.filter((bundle) => bundle.scope === 'target');
  const slice = review.bundles.filter((bundle) => bundle.scope === 'slice');

  const targetRows = target.map(
    (bundle) =>
      `| \`${bundle.key}\` | ${codeList(bundle.lenses)} | ${bundle.model} |`,
  );

  const sliceRows = slice.map((bundle) => {
    const patterns = bundle.lenses.flatMap(
      (key) => review.lenses[key].route.paths ?? [],
    );
    const firesOn =
      patterns.length > 0
        ? [
            ...new Set(
              patterns.map((pattern) => `\`${cell(pattern.toString())}\``),
            ),
          ].join(', ')
        : 'Recon only';
    return `| \`${bundle.key}\` | ${codeList(bundle.lenses)} | ${bundle.model} | ${firesOn} |`;
  });

  const tables = [];

  if (targetRows.length > 0) {
    tables.push(`**Cross-cutting — each reads the whole target**

| Bundle | Lenses | Model |
| ------ | ------ | ----- |
${targetRows.join('\n')}`);
  }

  if (sliceRows.length > 0) {
    tables.push(`**Layer-scoped — each reads its own slice**

| Bundle | Lenses | Model | Fires on |
| ------ | ------ | ----- | -------- |
${sliceRows.join('\n')}`);
  }

  return tables.join('\n\n');
}

/**
 * Names the lenses with no skill, whose brief carries the whole standard.
 *
 * @param review - The resolved review config
 * @returns The sentence
 */
function noSkillLine(review) {
  const keys = Object.entries(review.lenses)
    .filter(([, lens]) => !lens.skill)
    .map(([key]) => key);

  if (keys.length === 0) return 'Every lens in this repository loads a skill.';

  return `${keys.length === 1 ? 'One lens has' : 'These lenses have'} no skill, so the brief in the config carries the whole standard: ${codeList(keys)}.`;
}

/**
 * Joins items as English, each in backticks.
 *
 * @param items - The items
 * @returns `a`, `b` and `c`
 */
function listOf(items) {
  const quoted = items.map((item) => `\`${item}\``);
  if (quoted.length <= 1) return quoted.join('');
  return `${quoted.slice(0, -1).join(', ')} and ${quoted.at(-1)}`;
}

/**
 * Joins items with commas, all inside one pair of backticks.
 *
 * @param items - The items
 * @returns `a, b, c` in backticks
 */
function codeList(items) {
  return `\`${items.join(', ')}\``;
}

/**
 * Makes text safe inside a markdown table cell.
 *
 * @param text - The text
 * @returns The text on one line with pipes escaped
 */
function cell(text) {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}
