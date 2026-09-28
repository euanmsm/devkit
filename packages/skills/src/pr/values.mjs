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

/** The settings an object `qaGate` takes. */
const QA_GATE_KEYS = ['nodeVersion', 'nodeVersionFile', 'install'];

/** How the gate workflow gets the package: fetched by npx, or from the lockfile. */
const QA_GATE_INSTALLS = ['npx', 'lockfile'];

/**
 * Says what `qaGate` should have been, when it is wrong.
 *
 * @param value - The value the config gives
 * @returns What it must be, or null when it is fine
 */
export function qaGateProblem(value) {
  if (typeof value === 'boolean') return null;

  const want = `true, false, or an object of ${QA_GATE_KEYS.join(', ')}`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return want;
  }
  if (Object.keys(value).some((key) => !QA_GATE_KEYS.includes(key))) {
    return want;
  }
  if ('nodeVersion' in value && 'nodeVersionFile' in value) {
    return 'given nodeVersion or nodeVersionFile, not both';
  }
  for (const key of ['nodeVersion', 'nodeVersionFile']) {
    if (
      key in value &&
      (typeof value[key] !== 'string' || !value[key].trim())
    ) {
      return `given ${key} as a non-empty string`;
    }
  }
  if ('install' in value && !QA_GATE_INSTALLS.includes(value.install)) {
    return `given install as one of ${QA_GATE_INSTALLS.map((i) => `"${i}"`).join(', ')}`;
  }
  return null;
}

/**
 * Fills in the gate workflow's settings.
 *
 * @param value - `qaGate` from `skills.json`: a boolean or its settings
 * @returns The settings, or null when the gate is off
 */
export function qaGateSettings(value) {
  if (!value) return null;
  const given = value === true ? {} : value;
  return {
    install: given.install ?? 'npx',
    nodeVersion: given.nodeVersionFile ? '' : (given.nodeVersion ?? '22'),
    nodeVersionFile: given.nodeVersionFile ?? '',
  };
}

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

  const gate = qaGateSettings(options.qaGate);

  return {
    pr,
    name: pr.name,
    skillDir,
    qaGate: Boolean(gate),
    gateCheckout: Boolean(
      gate?.install === 'lockfile' || gate?.nodeVersionFile,
    ),
    gateLockfile: gate?.install === 'lockfile',
    gateNode: gate?.nodeVersionFile
      ? `node-version-file: ${gate.nodeVersionFile}`
      : `node-version: ${gate?.nodeVersion ?? '22'}`,
    gateCommand:
      gate?.install === 'lockfile'
        ? 'npx --no-install skills'
        : `npx --yes @euanmsm/skills@${PACKAGE_VERSION}`,
    template: pr.template,
    traps: pr.traps,
    trapsLink: path.posix.relative(skillDir, pr.traps),
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
        ? `The base is \`${shared.baseBranch}\`, except on a branch in a \`gh stack\`, which targets the branch directly below it; the prepass works this out. Never open a mid-stack PR against \`${shared.baseBranch}\` — it flattens the stack. \`gh stack submit\` also creates and updates the PRs, with the same bases; this skill is still what writes the summary and the checklist.`
        : `The base is always \`${shared.baseBranch}\`.`,
    stackBase: pr.base === 'stack',
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
