// ============================================================================
// Docs
// ============================================================================
//
// Builds the written contract from one chunk per rule, including only the rules
// a repository has switched on. An agent reading the result is reading exactly
// what the scanner enforces.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { repoRoot } from '@euanmsm/devkit-core';

import { ALL_RULES, RULES, config, enabled } from './scanner.mjs';

const CHUNKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'chunks');
const DEFAULT_PATH = '.devkit/comment-rules.md';

/** The order rules appear in, grouping size rules ahead of content rules. */
const ORDER = [
  'file-header',
  'header-cap',
  'exported-jsdoc',
  'property-jsdoc',
  'jsdoc-cap',
  'jsdoc-tags',
  'logic-comment-exception',
  'logic-comment-length',
  'what-not-why',
  'no-history',
  'no-conversation',
  'no-issue-id',
  'no-justification',
  'no-person',
  'comment-length',
  'no-commented-code',
  'todo-form',
  'section-banner',
  'comment-ages-with-code',
  'cut-is-deleted',
  'migration-exception',
];

/** The heading each rule sits under, in the order the sections appear. */
const SECTIONS = [
  {
    title: 'Coverage',
    rules: ['file-header', 'header-cap', 'exported-jsdoc', 'property-jsdoc'],
  },
  { title: 'JSDoc', rules: ['jsdoc-cap', 'jsdoc-tags'] },
  {
    title: 'Logic comments',
    rules: ['logic-comment-exception', 'logic-comment-length'],
  },
  {
    title: 'Style',
    rules: [
      'what-not-why',
      'no-history',
      'no-conversation',
      'no-issue-id',
      'no-justification',
      'no-person',
      'comment-length',
    ],
  },
  {
    title: 'Hygiene',
    rules: [
      'no-commented-code',
      'todo-form',
      'section-banner',
      'comment-ages-with-code',
      'cut-is-deleted',
    ],
  },
  { title: 'Exceptions', rules: ['migration-exception'] },
];

/**
 * Fills a chunk's placeholders from the repository's caps.
 *
 * @param text - One chunk's markdown
 * @returns The same markdown with every `{{cap}}` replaced
 */
export function fill(text) {
  const values = {
    headerMax: config.headerMax,
    jsdocProseMax: config.jsdocProseMax,
    commentMaxChars: config.commentMaxChars,
    bannerMinCode: config.bannerMinCode,
    todoPrefix: config.todoPrefix === '[A-Z]{2,}' ? 'ABC' : config.todoPrefix,
    allowedTags: config.allowedTags.map((t) => `\`${t}\``).join(', '),
    governed: config.governed,
  };

  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    key in values ? String(values[key]) : whole,
  );
}

/** Reads one chunk, or null when the package ships none by that name. */
function chunk(name) {
  const path = join(CHUNKS, `${name}.md`);
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : null;
}

/**
 * Builds the whole contract.
 *
 * @returns Markdown carrying every rule this repository switches on
 */
export function build() {
  const on = ORDER.filter((name) => name in ALL_RULES && enabled(name));
  const parts = [fill(chunk('_intro'))];

  for (const section of SECTIONS) {
    const included = section.rules.filter((name) => on.includes(name));
    if (included.length === 0) continue;

    parts.push(`## ${section.title}`);
    for (const name of included) {
      const text = chunk(name);
      if (text) parts.push(fill(text));
    }
  }

  parts.push(fill(chunk('_outro')), enforcement(on));

  return `${parts.join('\n\n')}\n`;
}

/** Names which rules a machine catches and which stay review rules. */
function enforcement(on) {
  const checked = on.filter((name) => name in RULES);
  const review = on.filter((name) => !(name in RULES));

  const lines = [
    '## Enforcement',
    '',
    `\`terse\` catches ${checked.length} of these in CI and refuses an edit that ` +
      'introduces one: ' +
      `${checked.map((n) => `\`${n}\``).join(', ')}.`,
  ];

  if (review.length > 0) {
    lines.push(
      '',
      'No scanner can judge the rest, so they are review rules: ' +
        `${review.map((n) => `\`${n}\``).join(', ')}.`,
    );
  }

  return lines.join('\n');
}

/** Where the contract is written, which the failure message also points at. */
export function target() {
  return config.rulesDoc || DEFAULT_PATH;
}

/** Writes the contract, or with `--check` reports whether it is stale. */
export function main() {
  const root = repoRoot();
  const path = join(root, target());
  const built = build();

  if (process.argv.includes('--check')) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;

    if (current === built) {
      console.log(`${target()} matches .devkit/terse.json.`);
      return;
    }

    console.error(
      `${target()} no longer matches .devkit/terse.json. Run \`terse-docs\` and commit the result.`,
    );
    process.exit(1);
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, built);

  console.log(`Wrote ${target()} from .devkit/terse.json.`);
}
