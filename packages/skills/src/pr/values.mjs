// ============================================================================
// PR Skill Values
// ============================================================================
//
// The values the PR skill's templates are rendered with, built from the
// resolved config.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** This package's published version, pinned into the generated gate workflow. */
const PACKAGE_VERSION = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'package.json',
    ),
    'utf8',
  ),
).version;

/**
 * Builds the template values for the PR skill.
 *
 * @param pr - The resolved PR config
 * @param options - The skill's options from `skills.json`
 * @param shared - The shared settings
 * @returns The values its templates read
 */
export function prValues(pr, options, shared) {
  const skillDir = `${shared.skillsDir}/${pr.name}`;
  const humanTitles = Object.entries(pr.sections)
    .filter(([key]) => key !== 'backend')
    .map(([, section]) => section.title);

  return {
    pr,
    skillDir,
    qaGate: options.qaGate,
    template: pr.template,
    traps: pr.traps,
    trapsLink: path.posix.relative(skillDir, pr.traps),
    packageVersion: PACKAGE_VERSION,
    // Only read inside SKILL.md's single-quoted YAML description, where a
    // lone `'` would end the scalar.
    sectionNames: [
      pr.sections.backend.title,
      ...humanTitles,
      ...(pr.storybook ? ['Storybook Review Checks'] : []),
    ]
      .join(', ')
      .replace(/'/g, "''"),
    baseRule:
      pr.base === 'stack'
        ? `The base is \`${shared.baseBranch}\`, except on a branch in a \`gh stack\`, which targets the branch directly below it; the prepass works this out. Never open a mid-stack PR against \`${shared.baseBranch}\` — it flattens the stack.`
        : `The base is always \`${shared.baseBranch}\`.`,
    layerTable: layerTable(pr),
  };
}

/**
 * Renders the layers as a markdown table.
 *
 * @param pr - The resolved PR config
 * @returns The table
 */
function layerTable(pr) {
  const rows = pr.layers.map((layer) => {
    const paths = layer.paths
      .map((p) =>
        `\`${p instanceof RegExp ? p.source.replace(/\\\//g, '/') : `${p}…`}\``.replace(
          /\|/g,
          '\\|',
        ),
      )
      .join(', ');
    return `| ${layer.title} | ${pr.sections[layer.section].title} | ${paths} |`;
  });

  return ['| Layer | Section | Paths |', '| --- | --- | --- |', ...rows].join(
    '\n',
  );
}
