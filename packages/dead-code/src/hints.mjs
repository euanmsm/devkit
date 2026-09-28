// ============================================================================
// Hints Reporter
// ============================================================================
//
// A knip reporter that prints the configuration hints as one JSON line. Knip's
// own JSON reporter leaves them out.

import { isAbsolute, relative } from 'node:path';

// Knip's own thresholds for saying a project looks unconfigured.
const UNCONFIGURED_MIN_FILES = 20;
const UNCONFIGURED_MIN_RATIO = 0.2;

const MESSAGES = {
  'entry-empty': 'Refine the entry pattern, it matches no files',
  'project-empty': 'Refine the project pattern, it matches no files',
  'entry-redundant': 'Remove the redundant entry pattern',
  'project-redundant': 'Remove the redundant project pattern',
  'entry-top-level': 'Move the top-level entry pattern into a workspace',
  'project-top-level': 'Move the top-level project pattern into a workspace',
  'top-level-unconfigured': (hint, configured) =>
    configured
      ? `Add entry files or refine the project files (${hint.size} unused files)`
      : `Create a knip.json with entry and project files (${hint.size} unused files)`,
  'workspace-unconfigured': (hint, configured) =>
    configured
      ? `Add entry files or refine the project files in this workspace (${hint.size} unused files)`
      : `Create a knip.json with this workspace's entry and project files (${hint.size} unused files)`,
  'package-entry': 'Package entry file not found',
  'project-extension-unregistered':
    'Extension in project is not registered as a compiler',
  'project-extension-excluded':
    'Compiled extension is excluded by project, so its imports are not followed',
};

/**
 * Works out the hints knip adds when most files come back unused, which only
 * knip's own text reporter would otherwise print.
 *
 * @param options - Knip's reporter options
 * @returns `top-level-unconfigured` or `workspace-unconfigured` hints, or none
 */
export function unconfigured({
  counters = {},
  issues = {},
  includedWorkspaceDirs = [],
  cwd = '',
}) {
  const { files = 0, processed = 0 } = counters;
  if (
    files <= UNCONFIGURED_MIN_FILES ||
    processed === 0 ||
    files / processed <= UNCONFIGURED_MIN_RATIO
  )
    return [];

  // Deepest first, so a file counts towards the workspace it is really in.
  const workspaces = [...includedWorkspaceDirs]
    .sort((a, b) => b.split(/[\\/]/).length - a.split(/[\\/]/).length)
    .map((dir) => ({ dir, size: 0 }));
  for (const byFile of Object.values(issues.files ?? {}))
    for (const issue of Object.values(byFile)) {
      const ws = workspaces.find((w) => issue.filePath?.startsWith(w.dir));
      if (ws) ws.size++;
    }

  if (workspaces.length === 1)
    return [
      {
        type: 'top-level-unconfigured',
        identifier: '.',
        size: workspaces[0].size,
      },
    ];

  return workspaces
    .filter((w) => w.size > 1)
    .sort((a, b) => b.size - a.size)
    .map(({ dir, size }) => {
      const name = relative(cwd, dir) || '.';
      return {
        type: 'workspace-unconfigured',
        identifier: name,
        workspaceName: name,
        size,
      };
    });
}

/**
 * Turns one knip hint into plain data.
 *
 * @param hint - A hint from knip's `configurationHints`
 * @param options - Knip's `cwd` and `configFilePath`
 * @returns `{ type, identifier, workspace, file, message }`, `file` relative to `cwd`
 */
export function toHint(hint, { cwd = '', configFilePath } = {}) {
  const identifier =
    hint.identifier instanceof RegExp
      ? hint.identifier.source
      : String(hint.identifier ?? '');

  const path = hint.filePath || configFilePath || null;
  const file = path && cwd && isAbsolute(path) ? relative(cwd, path) : path;
  const message = MESSAGES[hint.type];

  return {
    type: hint.type,
    identifier,
    workspace: hint.workspaceName ?? '.',
    file: file && file.split('\\').join('/'),
    message:
      typeof message === 'function'
        ? message(hint, Boolean(configFilePath))
        : (message ?? `Remove it from ${hint.type}, it is unused`),
  };
}

/**
 * Prints the hints knip hands every reporter.
 *
 * @param options - Knip's reporter options
 */
export default function hints(options) {
  const list = options.isDisableConfigHints
    ? []
    : [...unconfigured(options), ...(options.configurationHints ?? [])].map(
        (h) => toHint(h, options),
      );
  process.stdout.write(`${JSON.stringify({ hints: list })}\n`);
}
