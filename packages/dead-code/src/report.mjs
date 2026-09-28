// ============================================================================
// Report
// ============================================================================
//
// Prints a run's result: findings grouped by file, a count per type, the known
// false positives set apart by reason, stale known entries and knip's hints.

// Finding types mapped to the label printed beside each finding.
const LABELS = {
  file: 'unused-file',
  export: 'unused-export',
  type: 'unused-type',
  enumMember: 'unused-enum-member',
  duplicate: 'duplicate-export',
  dependency: 'unused-dependency',
};

/**
 * Pluralises a count.
 *
 * @param n - The count
 * @param word - The singular noun
 * @returns The count and the noun, together
 */
function count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Sorts findings by file, then line, then name.
 *
 * @param findings - Findings in any order
 * @returns A sorted copy
 */
export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Formats one finding as a report line.
 *
 * @param finding - The finding
 * @returns `file:line  [label]  name`, or `file  [unused-file]` for a file
 */
function line(finding) {
  const label = LABELS[finding.type] ?? finding.type;
  const at = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  return finding.type === 'file'
    ? `${at}  [${label}]`
    : `${at}  [${label}]  ${finding.name}`;
}

/**
 * Formats labelled counts as an aligned, largest-first table.
 *
 * @param totals - Label to count
 * @returns One indented line per label
 */
function table(totals) {
  const ranked = [...totals].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const width = Math.max(...ranked.map(([label]) => label.length));
  return ranked.map(([label, n]) => `  ${label.padEnd(width)}  ${n}`);
}

/**
 * Tallies items by a key.
 *
 * @param items - The items
 * @param by - Picks each item's key
 * @returns Key to count, in first-seen order
 */
function tally(items, by) {
  const out = new Map();
  for (const item of items) out.set(by(item), (out.get(by(item)) ?? 0) + 1);
  return out;
}

/**
 * Builds the closing summary line.
 *
 * @param result - The run's result
 * @returns One sentence
 */
function summary({ findings, known, mode, base }) {
  const files = new Set(findings.map((f) => f.file)).size;
  const where =
    mode === 'branch'
      ? ` since ${base}`
      : mode === 'paths'
        ? ' in the named paths'
        : '';
  const aside = known.length ? ` ${known.length} known, not counted.` : '';

  if (findings.length === 0)
    return mode === 'branch'
      ? `No new dead code since ${base}.${aside}`
      : `No dead code found${where}.${aside}`;

  const noun = mode === 'branch' ? 'new finding' : 'finding';
  return `${count(findings.length, noun)} in ${count(files, 'file')}${where}.${aside}`;
}

/**
 * Builds the text report.
 *
 * @param result - `{ findings, known, stale, hints, mode, base }`
 * @returns The report, sections separated by blank lines
 */
export function formatText(result) {
  const { findings, known, stale, hints } = result;
  const sections = [];

  if (findings.length) {
    const byFile = new Map();
    for (const f of sortFindings(findings))
      byFile.set(f.file, [...(byFile.get(f.file) ?? []), line(f)]);
    sections.push([...byFile.values()].map((l) => l.join('\n')).join('\n\n'));

    const byType = tally(findings, (f) => LABELS[f.type] ?? f.type);
    sections.push(`By type\n${table(byType).join('\n')}`);
  }

  if (known.length)
    sections.push(
      `Known, not counted (${known.length})\n${table(tally(known, (f) => f.reason)).join('\n')}`,
    );

  if (stale.length)
    sections.push(
      `Stale known entries (${stale.length}), matching nothing\n${stale
        .map(
          (s) =>
            `  ${s.path}${s.names ? ` [${s.names.join(', ')}]` : ''}  ${s.reason}`,
        )
        .join('\n')}`,
    );

  if (hints.length)
    sections.push(
      `Configuration hints (${hints.length})\n${hints
        .map((h) =>
          [h.identifier, h.workspace !== '.' && h.workspace, h.file, h.message]
            .filter(Boolean)
            .join('  '),
        )
        .map((l) => `  ${l}`)
        .join('\n')}`,
    );

  sections.push(summary(result));
  return sections.join('\n\n');
}

/**
 * Builds the machine-readable report.
 *
 * @param result - `{ findings, known, stale, hints, mode, base }`
 * @returns The JSON text
 */
export function formatJson({ findings, known, stale, hints, mode, base }) {
  const body = {
    findings: sortFindings(findings),
    known: sortFindings(known),
    stale,
    hints,
    mode,
    ...(base ? { base } : {}),
  };
  return JSON.stringify(body, null, 2);
}
