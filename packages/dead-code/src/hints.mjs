// ============================================================================
// Hints Reporter
// ============================================================================
//
// A knip reporter that prints the configuration hints as one JSON line. Knip's
// own JSON reporter leaves them out.

import { isAbsolute, relative } from 'node:path';

const MESSAGES = {
  'entry-empty': 'Refine the entry pattern, it matches no files',
  'project-empty': 'Refine the project pattern, it matches no files',
  'entry-redundant': 'Remove the redundant entry pattern',
  'project-redundant': 'Remove the redundant project pattern',
  'entry-top-level': 'Move the top-level entry pattern into a workspace',
  'project-top-level': 'Move the top-level project pattern into a workspace',
  'top-level-unconfigured': 'Add entry files or refine the project files',
  'workspace-unconfigured':
    'Add entry files or refine the project files in this workspace',
  'package-entry': 'Package entry file not found',
  'project-extension-unregistered':
    'Extension in project is not registered as a compiler',
  'project-extension-excluded':
    'Compiled extension is excluded by project, so its imports are not followed',
};

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

  return {
    type: hint.type,
    identifier,
    workspace: hint.workspaceName ?? '.',
    file,
    message: MESSAGES[hint.type] ?? `Remove it from ${hint.type}, it is unused`,
  };
}

/**
 * Prints the hints knip hands every reporter.
 *
 * @param options - Knip's reporter options
 */
export default function hints(options) {
  const list = (options.configurationHints ?? []).map((h) =>
    toHint(h, options),
  );
  process.stdout.write(`${JSON.stringify({ hints: list })}\n`);
}
