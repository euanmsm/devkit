// ============================================================================
// List
// ============================================================================
//
// Prints every checkout of the repository with its branch, slot and ports.

import { basename } from 'node:path';

import { loadWtConfig } from './config.mjs';
import { checkoutRoot, mainRoot, real, worktrees } from './git.mjs';
import { readRecord, slotOf } from './slots.mjs';

/**
 * Collects one row per checkout.
 *
 * @param cwd - Directory inside any checkout of the repository
 * @returns Each checkout's name, branch, slot, offset and path
 */
export function rows(cwd = process.cwd()) {
  const main = mainRoot(cwd);
  const config = loadWtConfig(checkoutRoot(cwd), main);

  return worktrees(cwd).map((w) => {
    const isMain = real(w.path) === main;
    const slot = isMain ? 0 : slotOf(w.path);

    return {
      name: isMain ? '(main)' : (readRecord(w.path)?.name ?? basename(w.path)),
      branch: w.branch ?? `(detached ${w.head?.slice(0, 7) ?? ''})`,
      slot,
      offset: slot * config.ports.step,
      path: w.path,
    };
  });
}

/**
 * Prints the checkouts as an aligned table.
 *
 * @param cwd - Directory inside any checkout of the repository
 */
export function list(cwd = process.cwd()) {
  const table = rows(cwd).map((r) => [
    r.name,
    r.branch,
    String(r.slot),
    `+${r.offset}`,
    r.path,
  ]);
  const head = ['NAME', 'BRANCH', 'SLOT', 'PORTS', 'PATH'];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...table.map((row) => row[i].length)),
  );

  for (const row of [head, ...table]) {
    console.log(
      row
        .map((cell, i) => cell.padEnd(widths[i]))
        .join('  ')
        .trimEnd(),
    );
  }
}
