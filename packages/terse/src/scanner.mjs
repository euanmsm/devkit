// ============================================================================
// Comment Budget
// ============================================================================
//
// Checks every governed source file against the comment contract. Which rules
// run, the caps they apply and the phrases they ban all come from
// .devkit/terse.json. Findings carry the name of the rule they break.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { compile, loadConfig } from '@euanmsm/devkit-core';

// ============================================================================
// Config
// ============================================================================

/**
 * Every rule a scanner can judge, in the order a reader meets them. The key is
 * the name a finding reports and a config file switches off; `number` ties back
 * to the written contract.
 */
export const RULES = {
  'file-header': {
    number: 1,
    about: 'Every file opens with a `// ====` header',
  },
  'exported-jsdoc': { number: 2, about: 'Every exported symbol has JSDoc' },
  'property-jsdoc': {
    number: 3,
    about: 'Every property has JSDoc, of one sentence',
  },
  'jsdoc-tag-coverage': {
    number: 20,
    about: 'JSDoc documents every parameter, the return and the throws',
  },
  'header-cap': {
    number: 5,
    about: 'A file header is capped and has no subsections',
  },
  'jsdoc-cap': {
    number: 6,
    about: 'JSDoc prose is capped and its tags do not wrap',
  },
  'logic-comment-length': { number: 7, about: 'A logic comment is one line' },
  'no-history': { number: 9, about: 'No narrating what the code used to do' },
  'no-conversation': {
    number: 10,
    about: 'No referencing the conversation that wrote it',
  },
  'no-issue-id': { number: 11, about: 'No issue ids in comments' },
  'no-justification': {
    number: 12,
    about: 'State what is true, do not argue for it',
  },
  'comment-length': {
    number: 13,
    about: 'One sentence, under the character cap',
  },
  'no-person': { number: 14, about: 'No first or second person' },
  'no-commented-code': { number: 15, about: 'No commented-out code' },
  'todo-form': { number: 16, about: 'A marker carries an issue id' },
  'jsdoc-tags': { number: 17, about: 'Only the allowed JSDoc tags' },
  'section-banner': { number: 18, about: 'No section banners in a small file' },
};

/**
 * Rules no scanner can judge. They never produce a finding, and exist so the
 * generated contract can carry them, or leave them out, alongside the rest.
 */
export const GUIDANCE = {
  'logic-comment-exception': {
    number: 4,
    about: 'A `//` comment is written only for the five triggers',
  },
  'what-not-why': {
    number: 8,
    about: 'A comment says what the code is, right now',
  },
  'comment-ages-with-code': {
    number: 19,
    about: 'A comment changes with its code, or goes',
  },
  'cut-is-deleted': {
    number: 21,
    about: 'Cut content is deleted, never relocated',
  },
  'migration-exception': {
    number: 22,
    about: 'A migration header is exempt from the cap',
  },
};

/** Every rule the generated contract can carry, checked or not. */
export const ALL_RULES = { ...RULES, ...GUIDANCE };

const DEFAULTS = {
  governed: '\\.(tsx?|mjs|cjs|js)$',
  exclude: ['(^|/)node_modules/', '\\.min\\.[cm]?js$', '\\.d\\.ts$'],
  headerMax: 8,
  jsdocProseMax: 4,
  commentMaxChars: 100,
  bannerMinCode: 150,
  todoPrefix: '[A-Z]{2,}',
  allowedTags: ['@param', '@returns', '@throws', '@deprecated'],
  jsdocScope: 'all',
  jsdocScopeExclude: ['\\.test\\.', '\\.spec\\.'],
  rulesDoc: '',
  examplesDoc: '',
  rules: Object.fromEntries(
    [...Object.keys(RULES), ...Object.keys(GUIDANCE)].map((name) => [
      name,
      true,
    ]),
  ),
  bans: [
    {
      name: 'no-history',
      label: 'history',
      pattern:
        '\\b(previously|used to|no longer|now that|was originally|is now|has been (renamed|moved|replaced|removed))\\b',
    },
    {
      name: 'no-conversation',
      label: 'conversation',
      pattern:
        '\\b(as requested|per the plan|as discussed|this wave|we decided|phase \\d)\\b',
    },
    {
      name: 'no-issue-id',
      label: 'issue id',
      pattern: '\\b[A-Z]{2,}-\\d+\\b',
      flags: '',
    },
    {
      name: 'no-justification',
      label: 'justification or consequence',
      pattern:
        '\\b(so that|rather than|which is what|the reason|deliberately|on purpose|prevents|defaults to|falls back)\\b',
    },
    {
      name: 'no-person',
      label: 'first or second person',
      pattern: '\\b(we|our|ours|us|you|your)\\b',
    },
  ],
};

const FILE = loadConfig('terse.json', {}) ?? {};

/** Every cap and switch in force, a repository's config over the defaults. */
export const config = {
  ...DEFAULTS,
  ...FILE,
  // A config naming only the rules it turns off keeps the rest switched on.
  rules: { ...DEFAULTS.rules, ...(FILE.rules ?? {}) },
};

/**
 * True when a repo leaves a rule switched on.
 *
 * @param name - The rule's name, as `RULES` keys it
 * @returns Whether findings against it are reported
 */
export function enabled(name) {
  return config.rules[name] !== false;
}

// ============================================================================
// Scope
// ============================================================================

const GOVERNED = new RegExp(config.governed);
const EXCLUDED = compile(config.exclude);

/**
 * True when the contract governs a file.
 *
 * @param path - Repo-relative path
 * @returns Whether the file is hand-written source the rules cover
 */
export function governs(path) {
  return GOVERNED.test(path) && !EXCLUDED.some((p) => p.test(path));
}

const JSDOC_SCOPE = config.jsdocScope === 'exported' ? 'exported' : 'all';
const JSDOC_SCOPE_EXCLUDED = compile(config.jsdocScopeExclude ?? []);

/**
 * Which declarations rule 2 binds to in one file.
 *
 * @param path - Repo-relative path, empty when the caller has none
 * @returns `'all'` for functions as well as exports, `'exported'` for exports alone
 */
function scopeFor(path) {
  if (JSDOC_SCOPE === 'exported') return 'exported';
  if (path && JSDOC_SCOPE_EXCLUDED.some((p) => p.test(path))) return 'exported';

  return 'all';
}

// ============================================================================
// Rules
// ============================================================================

const HEADER_MAX = config.headerMax;
const JSDOC_PROSE_MAX = config.jsdocProseMax;
const COMMENT_MAX_CHARS = config.commentMaxChars;
const BANNER_MIN_CODE = config.bannerMinCode;

const TODO_FORM = new RegExp(`\\bTODO\\(${config.todoPrefix}-\\d+\\):`);
const TODO_EXAMPLE = `TODO(${config.todoPrefix === '[A-Z]{2,}' ? 'ABC' : config.todoPrefix}-1234): one line`;

const BANS = config.bans.map((ban) => ({
  rule: ban.name,
  label: ban.label,
  re: new RegExp(ban.pattern, ban.flags ?? 'i'),
}));

// The trailing identifier class excludes a re-export's `{`.
const EXPORTED =
  /^export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:const|let|var|function|class|interface|type|enum)\s+[A-Za-z_$]/;

// A `(` that follows is confirmed as a parameter list before anything binds to it.
const FN_KEYWORD = /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\b/;
const FN_ASSIGNED =
  /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::(?:[^=]|=>)*)?=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;
const FN_BINDS =
  /^(?:async\s+)?function\s+[A-Za-z_$]|^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::(?:[^=]|=>)*)?=\s*(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;
const SHORT_ARROW =
  /^(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::(?:[^=]|=>)*)?=\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>\s*(.*)$/;
const VOIDISH = /^(?:void|never|Promise<\s*(?:void|never)\s*>)$/;
const SIGNATURE_MAX_LINES = 40;

const ALLOWED_TAGS = new Set(config.allowedTags);
const CODE_SHAPE =
  /^(import |export |const |let |var |return |await |if \(|for \(|\w+\.\w+\(|\}|\{)/;
const DECLARATION = /^(export\s+)?(interface\s+\w+|type\s+\w+(<[^>]*>)?\s*=)/;
const PROPERTY = /^(readonly\s+)?[\w"'`]+\??\s*:/;

// ============================================================================
// Helpers
// ============================================================================

// ======== Text ==============================================================

/**
 * Strips the leading comment marker from a line.
 *
 * @param line - One raw source line
 * @returns The line's text, marker gone
 */
function body(line) {
  return line
    .trim()
    .replace(/^\/\/+\s?/, '')
    .replace(/^\/?\*+\/?\s?/, '')
    .replace(/\s*\*\/$/, '')
    .trim();
}

/**
 * True when a line opens or closes a `// ====` banner rule.
 *
 * @param line - One raw source line
 * @returns Whether the line is a banner's rule
 */
function isBannerRule(line) {
  return /^\s*\/\/\s*[=-]{5,}\s*$/.test(line);
}

/**
 * Counts lines that are neither blank nor a comment.
 *
 * @param lines - Every line of the file
 * @returns How many of them carry code
 */
function codeLineCount(lines) {
  return lines.filter((l) => l.trim() && !/^\s*(\/\/|\*|\/\*)/.test(l.trim()))
    .length;
}

// ======== Braces ============================================================

// A `/` opens a regex only where a value may start, and never after JSX's `<`.
const REGEX_OPENS_AFTER = new Set([
  '',
  '=',
  '(',
  ',',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '%',
  '>',
]);

/**
 * Counts a line's braces, ignoring any inside a string, template or regex.
 *
 * @param line - One raw source line
 * @returns `{ open, close }` brace counts
 */
function braceCounts(line) {
  let open = 0;
  let close = 0;
  let prev = '';

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '/' && line[i + 1] === '/') break;

    // A JSX comment closes on its own line, between the braces of `{/* … */}`.
    if (c === '/' && line[i + 1] === '*') {
      const close = line.indexOf('*/', i + 2);
      if (close === -1) break;
      i = close + 1;
      continue;
    }

    // `/>` closes a JSX element; a regex matching `>` alone is not worth the miss.
    const opensRegex =
      c === '/' && line[i + 1] !== '>' && REGEX_OPENS_AFTER.has(prev);

    if (c === '"' || c === "'" || c === '`' || opensRegex) {
      i = closingDelimiter(line, i, c);
      prev = c;
      continue;
    }

    if (c === '{') open++;
    else if (c === '}') close++;
    if (c.trim()) prev = c;
  }

  return { open, close };
}

/**
 * Finds where a literal closes.
 *
 * @param line - One raw source line
 * @param start - Index the literal opens at
 * @param delimiter - The character that closes it
 * @returns Index of the closing delimiter, or the line's end when unterminated
 */
function closingDelimiter(line, start, delimiter) {
  for (let i = start + 1; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === delimiter) return i;
  }

  return line.length;
}

// ======== Signatures ========================================================

/**
 * Blanks every string, template, regex and comment on a line.
 *
 * @param line - One raw source line
 * @returns The same line, literal contents replaced by spaces of equal length
 */
function stripLiterals(line) {
  let out = '';
  let prev = '';

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === '/' && line[i + 1] === '/') break;

    if (c === '/' && line[i + 1] === '*') {
      const close = line.indexOf('*/', i + 2);
      const end = close === -1 ? line.length : close + 2;
      out += ' '.repeat(end - i);
      i = end - 1;
      continue;
    }

    const opensRegex =
      c === '/' && line[i + 1] !== '>' && REGEX_OPENS_AFTER.has(prev);

    if (c === '"' || c === "'" || c === '`' || opensRegex) {
      const end = closingDelimiter(line, i, c);
      out += c + ' '.repeat(Math.max(0, end - i - 1));
      if (end < line.length) out += c;
      prev = c;
      i = end;
      continue;
    }

    out += c;
    if (c.trim()) prev = c;
  }

  return out.padEnd(line.length, ' ');
}

/**
 * Splits a parameter list at the commas belonging to it, not to a nested type.
 *
 * @param text - Everything between the signature's parentheses
 * @returns One string per parameter
 */
function splitParams(text) {
  const out = [];
  let depth = 0;
  let angle = 0;
  let current = '';
  let prev = '';

  for (const ch of text) {
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === '<' && /[\w$>\]]/.test(prev)) angle++;
    else if (ch === '>' && prev !== '=' && angle > 0) angle--;

    if (ch === ',' && depth === 0 && angle === 0) {
      out.push(current);
      current = '';
    } else current += ch;

    if (ch.trim()) prev = ch;
  }

  out.push(current);

  return out.map((p) => p.trim()).filter(Boolean);
}

/**
 * Reads a parameter's name.
 *
 * @param text - One parameter, type annotation and default included
 * @returns The name, or null when the parameter is destructured or unreadable
 */
function paramName(text) {
  const t = text.replace(/^\.\.\./, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return null;

  const m = /^[A-Za-z_$][\w$]*/.exec(t);

  return m ? m[0] : null;
}

/**
 * Reads a parameter list from its opening `(`, across as many lines as it takes.
 *
 * @param lines - Every line of the file
 * @param n - Line the declaration starts on, 0-based
 * @returns `{ params, line, rest }`, or null when the list never closes
 */
function readSignature(lines, n) {
  const first = stripLiterals(lines[n]);
  const open = first.indexOf('(');
  if (open === -1) return null;

  // An unclosed generic before the parens means the `(` belongs to a type.
  const before = first.slice(0, open);
  if ((before.match(/</g) ?? []).length > (before.match(/>/g) ?? []).length)
    return null;

  let depth = 0;
  let text = '';

  for (let i = n; i < Math.min(lines.length, n + SIGNATURE_MAX_LINES); i++) {
    const line = i === n ? first : stripLiterals(lines[i]);

    for (let c = i === n ? open : 0; c < line.length; c++) {
      const ch = line[c];

      if (ch === '(') {
        depth++;
        if (depth === 1) continue;
      } else if (ch === ')') {
        depth--;
        if (depth === 0)
          return {
            params: splitParams(text).map((p) => ({
              text: p,
              name: paramName(p),
            })),
            line: i,
            rest: line.slice(c + 1),
          };
      }

      text += ch;
    }

    text += '\n';
  }

  return null;
}

/**
 * Reads what follows a parameter list, up to the body.
 *
 * @param lines - Every line of the file
 * @param sig - What `readSignature` returned
 * @returns `{ returnType, body, expression }`, or null when no body follows
 */
function readTail(lines, sig) {
  let depth = 0;
  let pre = '';

  for (let i = sig.line; i < Math.min(lines.length, sig.line + 8); i++) {
    const line = i === sig.line ? sig.rest : stripLiterals(lines[i]);

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];

      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === '<' && /[\w$>\]]$/.test(pre.trimEnd())) depth++;
      else if (ch === '>' && line[c - 1] !== '=' && depth > 0) depth--;

      if (depth === 0 && ch === '{')
        return { returnType: annotation(pre), body: { line: i, col: c } };

      if (depth === 0 && ch === '=' && line[c + 1] === '>') {
        const body = firstBrace(lines, i, c + 2, sig.line + 8);
        return { returnType: annotation(pre), body, expression: !body };
      }

      if (depth === 0 && ch === ';') return null;

      pre += ch;
    }

    pre += ' ';
  }

  return null;
}

/**
 * Finds the `{` opening an arrow's body.
 *
 * @param lines - Every line of the file
 * @param start - Line to start looking on, 0-based
 * @param from - Column to start looking at
 * @param limit - Line to give up on
 * @returns Where the brace sits, or null when the arrow returns an expression
 */
function firstBrace(lines, start, from, limit) {
  for (let i = start; i < Math.min(lines.length, limit); i++) {
    const line = stripLiterals(lines[i]);
    for (let c = i === start ? from : 0; c < line.length; c++) {
      if (!line[c].trim()) continue;
      return line[c] === '{' ? { line: i, col: c } : null;
    }
  }

  return null;
}

/**
 * Reads a return-type annotation.
 *
 * @param pre - The text between a signature's `)` and its body
 * @returns The type, undefined when there is none and null when unreadable
 */
function annotation(pre) {
  const t = pre.trim();
  if (!t.startsWith(':')) return undefined;

  const type = t.slice(1).trim();

  return type || null;
}

/**
 * Reads whether a function body returns a value or throws, ignoring nested ones.
 *
 * @param lines - Every line of the file
 * @param start - Where the body's `{` sits
 * @returns `{ returns, throws }`
 */
function bodyFacts(lines, start) {
  let depth = 0;
  let nested = null;
  let returns = false;
  let throws = false;

  for (let i = start.line; i < lines.length; i++) {
    const line = stripLiterals(lines[i]);
    const text = i === start.line ? line.slice(start.col + 1) : line;

    if (nested === null && i > start.line) {
      if (/(?:^|[^\w.$])return\s+[^\s;]/.test(text)) returns = true;
      if (/(?:^|[^\w.$])throw\s/.test(text)) throws = true;
    }

    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;

    if (
      nested === null &&
      i > start.line &&
      opens > closes &&
      /(?:^|[^\w.$])function\b|=>/.test(text)
    )
      nested = depth;

    depth += opens - closes;

    if (nested !== null && depth <= nested) nested = null;
    if (depth < 0) break;
  }

  return { returns, throws };
}

/**
 * Reads a function declaration, so its tags can be checked against it.
 *
 * @param lines - Every line of the file
 * @param n - Line the declaration starts on, 0-based
 * @returns `{ params, returns, throws }`, or null when it is not a readable function
 */
function functionInfo(lines, n) {
  const trimmed = lines[n].trim();
  const keyword = FN_KEYWORD.test(trimmed);
  if (!keyword && !FN_ASSIGNED.test(trimmed)) return null;

  const short = keyword ? null : SHORT_ARROW.exec(trimmed);

  const sig = short
    ? { params: [{ text: short[1], name: short[1] }], line: n, rest: '' }
    : readSignature(lines, n);
  if (!sig) return null;

  const arrow = lines[n].indexOf('=>');
  const body = short ? firstBrace(lines, n, arrow + 2, n + 8) : null;
  const tail = short
    ? { returnType: undefined, body, expression: !body }
    : readTail(lines, sig);
  if (!tail) return null;
  if (tail.returnType === null) return null;

  const facts = tail.body
    ? bodyFacts(lines, tail.body)
    : { returns: true, throws: false };

  return {
    params: sig.params.filter((p) => p.name !== 'this'),
    returns: tail.returnType
      ? !VOIDISH.test(tail.returnType)
      : tail.expression || facts.returns,
    throws: facts.throws,
  };
}

// ======== Findings ==========================================================

/**
 * Builds one finding against a named rule.
 *
 * @param rule - The rule's name, as `RULES` keys it
 * @param line - Line the finding anchors to, 1-based
 * @param message - What a reader must change
 * @returns The finding
 */
function finding(rule, line, message) {
  return { rule, number: RULES[rule]?.number, line, message };
}

// ============================================================================
// Checks
// ============================================================================

// ======== File header =======================================================

/**
 * Checks rules 1 and 5 — a header exists, is capped, and has no subsections.
 *
 * @param lines - Every line of the file
 * @returns `{ findings, next }`, where `next` is the line the body starts on
 */
function checkHeader(lines) {
  // An executable script opens with `#!`, and the header follows it.
  const top = lines[0]?.startsWith('#!') ? 1 : 0;

  if (!lines[top]?.startsWith('//'))
    return {
      findings: [finding('file-header', top + 1, 'No `// ====` file header.')],
      next: top,
    };

  let end = top;
  while (end + 1 < lines.length && lines[end + 1].startsWith('//')) end++;

  const header = lines.slice(top, end + 1);
  const findings = [];

  // Anchoring past the cap keeps the finding inside the span that grew the header.
  if (header.length > HEADER_MAX)
    findings.push(
      finding(
        'header-cap',
        top + HEADER_MAX + 1,
        `File header is ${header.length} lines, cap is ${HEADER_MAX}.`,
      ),
    );

  const underline = header.findIndex(
    (l, n) => n > 3 && /^\/\/\s*-{4,}\s*$/.test(l),
  );
  if (underline !== -1)
    findings.push(
      finding(
        'header-cap',
        top + underline + 1,
        'File header has a subsection. Subsections are banned.',
      ),
    );

  for (const [n, line] of header.entries())
    if (!isBannerRule(line))
      findings.push(...checkContent(body(line), top + n + 1, { prose: false }));

  return { findings, next: end + 1 };
}

// ======== Comment content ===================================================

/**
 * Checks rules 9 to 14 and 16 on one comment line.
 *
 * @param text - The comment's text, marker already stripped
 * @param lineNo - Line the comment sits on, 1-based
 * @param options - `prose` skips rule 13, which rule 5 already covers in a header
 * @returns Findings the line breaks
 */
function checkContent(text, lineNo, options = {}) {
  if (!text) return [];

  const { prose = true } = options;
  const out = [];

  if (/\b(TODO|FIXME|XXX|HACK)\b/.test(text)) {
    if (!TODO_FORM.test(text))
      out.push(
        finding('todo-form', lineNo, `Marker must be \`${TODO_EXAMPLE}\`.`),
      );
    return out;
  }

  if (prose && text.length > COMMENT_MAX_CHARS)
    out.push(
      finding(
        'comment-length',
        lineNo,
        `Comment is ${text.length} chars, cap is ${COMMENT_MAX_CHARS}.`,
      ),
    );

  if (prose && /\.\s+\S/.test(text))
    out.push(
      finding(
        'comment-length',
        lineNo,
        'More than one sentence. One clause only.',
      ),
    );

  for (const ban of BANS)
    if (ban.re.test(text))
      out.push(finding(ban.rule, lineNo, `Comment mentions ${ban.label}.`));

  return out;
}

// ======== JSDoc =============================================================

/**
 * Checks rules 6 and 17 on one JSDoc block.
 *
 * @param lines - Every line of the file
 * @param start - Line the block opens on, 0-based
 * @param end - Line it closes on, 0-based
 * @returns Findings the block breaks
 */
function checkJsdoc(lines, start, end) {
  const out = [];
  let prose = 0;
  let capLine = start + 1;
  let openTag = null;

  for (let n = start; n <= end; n++) {
    const text = body(lines[n]);
    const tag = /^(@\w+)/.exec(text);

    if (tag) {
      openTag = tag[1];
      if (!ALLOWED_TAGS.has(openTag))
        out.push(
          finding('jsdoc-tags', n + 1, `\`${openTag}\` is not an allowed tag.`),
        );
      continue;
    }

    if (openTag && text) {
      out.push(
        finding('jsdoc-cap', n + 1, `\`${openTag}\` wraps onto a second line.`),
      );
      continue;
    }

    openTag = null;
    if (text) {
      prose++;
      if (prose === JSDOC_PROSE_MAX + 1) capLine = n + 1;
    }
    out.push(...checkContent(text, n + 1));
  }

  // Anchoring past the cap keeps the finding inside the span that grew the block.
  if (prose > JSDOC_PROSE_MAX)
    out.push(
      finding(
        'jsdoc-cap',
        capLine,
        `JSDoc has ${prose} prose lines, cap is ${JSDOC_PROSE_MAX}.`,
      ),
    );

  return out;
}

// ======== Declarations ======================================================

/**
 * Finds the JSDoc block above a declaration.
 *
 * @param lines - Every line of the file
 * @param n - Line the declaration starts on, 0-based
 * @returns `{ start, end, isDoc }`, or null when the declaration carries none
 */
function docAbove(lines, n) {
  let end = -1;

  for (let i = n - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue;
    if (lines[i].trim().endsWith('*/')) end = i;
    break;
  }

  if (end === -1) return null;

  for (let i = end; i >= 0; i--)
    if (lines[i].trim().startsWith('/*'))
      return { start: i, end, isDoc: lines[i].trim().startsWith('/**') };

  return null;
}

/**
 * Reads the name a `@param` tag documents.
 *
 * @param rest - Everything after the tag itself
 * @returns The name, or null when the tag names nothing
 */
function paramTagName(rest) {
  const m = /^\[?([A-Za-z_$][\w$.]*)/.exec(rest.replace(/^\{[^}]*\}\s*/, ''));

  return m ? m[1] : null;
}

/**
 * Checks rule 20 — the block documents the parameters, the return and the throws.
 *
 * @param lines - Every line of the file
 * @param n - Line the declaration starts on, 0-based
 * @param doc - The JSDoc block above it, as `docAbove` reads it
 * @param fn - The function beneath it, as `functionInfo` reads it
 * @returns Findings the block breaks
 */
function checkTagCoverage(lines, n, doc, fn) {
  const params = [];
  let hasReturns = false;
  let hasThrows = false;

  for (let i = doc.start; i <= doc.end; i++) {
    const m = /^@(\w+)\s*(.*)$/.exec(body(lines[i]));
    if (!m) continue;

    if (m[1] === 'param') params.push(paramTagName(m[2]));
    else if (m[1] === 'returns' || m[1] === 'return') hasReturns = true;
    else if (m[1] === 'throws' || m[1] === 'throw') hasThrows = true;
  }

  const out = [];
  const named = fn.params.filter((p) => p.name).map((p) => p.name);
  const loose = fn.params.length - named.length;
  // A dotted name documents a member of a destructured parameter, not one of its own.
  const tagged = params.filter((t) => t && !t.includes('.'));

  if (ALLOWED_TAGS.has('@param')) {
    for (const name of named)
      if (!tagged.includes(name))
        out.push(
          finding('jsdoc-tag-coverage', n + 1, `\`${name}\` has no @param.`),
        );

    const extra = tagged.filter((t) => !named.includes(t));
    for (const t of extra.slice(loose))
      out.push(
        finding(
          'jsdoc-tag-coverage',
          n + 1,
          `@param \`${t}\` names no parameter.`,
        ),
      );

    if (loose > 0 && tagged.length < fn.params.length)
      out.push(
        finding(
          'jsdoc-tag-coverage',
          n + 1,
          'A destructured parameter has no @param.',
        ),
      );
  }

  if (ALLOWED_TAGS.has('@returns') && fn.returns && !hasReturns)
    out.push(
      finding(
        'jsdoc-tag-coverage',
        n + 1,
        'Function returns a value but has no @returns.',
      ),
    );

  if (ALLOWED_TAGS.has('@throws') && fn.throws && !hasThrows)
    out.push(
      finding(
        'jsdoc-tag-coverage',
        n + 1,
        'Function throws but has no @throws.',
      ),
    );

  return out;
}

/**
 * Checks rules 2 and 20 on one declaration the scope binds to.
 *
 * @param lines - Every line of the file
 * @param n - Line the declaration starts on, 0-based
 * @param scope - What rule 2 binds to in this file
 * @param exported - Whether the declaration is exported
 * @returns Findings the declaration breaks
 */
function checkDeclaration(lines, n, scope, exported) {
  const fn = functionInfo(lines, n);
  if (!exported && !fn) return [];

  const doc = docAbove(lines, n);

  if (!doc)
    return [
      finding(
        'exported-jsdoc',
        n + 1,
        scope === 'all'
          ? 'Declaration has no JSDoc.'
          : 'Exported symbol has no JSDoc.',
      ),
    ];

  if (!fn || !doc.isDoc) return [];

  return checkTagCoverage(lines, n, doc, fn);
}

// ======== Properties ========================================================

/**
 * Checks rule 3 — every property carries a one-line, one-clause JSDoc.
 *
 * @param lines - Every line of the file
 * @param n - Line the property sits on, 0-based
 * @returns Findings the property breaks
 */
function checkProperty(lines, n) {
  const prev = lines[n - 1]?.trim() ?? '';

  if (/^\/\*\*.*\*\/$/.test(prev)) {
    if (/\.\s+\S/.test(body(prev)))
      return [
        finding(
          'property-jsdoc',
          n + 1,
          'Property JSDoc has a second sentence.',
        ),
      ];
    return [];
  }

  if (prev.endsWith('*/'))
    return [
      finding(
        'property-jsdoc',
        n + 1,
        'Property JSDoc must be the single-line `/** … */` form.',
      ),
    ];

  return [finding('property-jsdoc', n + 1, 'Property has no JSDoc.')];
}

// ============================================================================
// Main Export
// ============================================================================

/**
 * Scans one source file for comment-contract violations.
 *
 * @param source - File contents, or the incoming text of an edit
 * @param path - Repo-relative path, which decides the JSDoc scope
 * @returns Findings, each naming the rule number it breaks
 */
export function scan(source, path = '') {
  const lines = source.split('\n');
  const scope = scopeFor(path);
  const header = checkHeader(lines);

  const out = [...header.findings];
  const start = header.next;
  const code = codeLineCount(lines);

  let inBlock = false;
  let blockStart = 0;
  let isDoc = false;
  let run = 0;
  let runStart = 0;
  let depth = 0;
  let declDepth = null;

  for (let n = start; n < lines.length; n++) {
    const raw = lines[n];
    const trimmed = raw.trim();

    if (!inBlock && trimmed.startsWith('/*')) {
      inBlock = true;
      blockStart = n;
      isDoc = trimmed.startsWith('/**');
    }
    if (inBlock) {
      if (trimmed.includes('*/')) {
        inBlock = false;
        // A single-line block is a property doc, checked by rule 3 instead.
        if (isDoc && n > blockStart)
          out.push(...checkJsdoc(lines, blockStart, n));
      }
      continue;
    }

    if (isBannerRule(raw)) {
      if (code < BANNER_MIN_CODE && n > start)
        out.push(
          finding(
            'section-banner',
            n + 1,
            `Section banner in a ${code}-line file, minimum is ${BANNER_MIN_CODE}.`,
          ),
        );
      continue;
    }

    if (trimmed.startsWith('//')) {
      const text = body(raw);
      if (CODE_SHAPE.test(text))
        out.push(finding('no-commented-code', n + 1, 'Commented-out code.'));
      else out.push(...checkContent(text, n + 1));

      if (run === 0) runStart = n;
      run++;
      continue;
    }

    if (run > 1)
      out.push(
        finding(
          'logic-comment-length',
          runStart + 1,
          `Logic comment runs ${run} lines, cap is 1.`,
        ),
      );
    run = 0;

    const isExport = EXPORTED.test(trimmed);
    if (
      depth === 0 &&
      (isExport || (scope === 'all' && FN_BINDS.test(trimmed)))
    )
      out.push(...checkDeclaration(lines, n, scope, isExport));

    const { open, close } = braceCounts(raw);

    if (declDepth === null && DECLARATION.test(trimmed) && open)
      declDepth = depth;
    else if (declDepth !== null && depth + open - close <= declDepth)
      declDepth = null;
    else if (
      declDepth !== null &&
      depth === declDepth + 1 &&
      PROPERTY.test(trimmed)
    )
      out.push(...checkProperty(lines, n));

    // Clamping stops one miscounted line disabling exported-jsdoc for the rest of the file.
    depth = Math.max(0, depth + open - close);
  }

  // Filtering here, rather than at each check, keeps one place a rule can be off.
  return out.filter((f) => enabled(f.rule)).sort((a, b) => a.line - b.line);
}

// ============================================================================
// Comparing two versions
// ============================================================================

/**
 * Identifies a finding, digits stripped so a count in it cannot defeat a match.
 *
 * @param f - One finding
 * @returns A key two versions of the same finding share
 */
function key(f) {
  return `${f.rule}|${f.message.replace(/\d+/g, '#')}`;
}

/**
 * Finds violations one version introduces, ignoring those the other already had.
 *
 * @param before - File contents beforehand, empty for a new file
 * @param after - File contents afterwards
 * @param span - Lines the change wrote, or null for the whole file
 * @param path - Repo-relative path, which decides the JSDoc scope
 * @returns Findings surplus to `before` and inside `span`
 */
export function newFindings(before, after, span, path = '') {
  // An absent file scans as a missing header, which a new file must not inherit.
  const counts = new Map();
  for (const f of before ? scan(before, path) : [])
    counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);

  const inSpan = (f) =>
    !span || span.some((r) => f.line >= r.from && f.line <= r.to);
  const found = scan(after, path);

  // Untouched findings match first, leaving the newly written one exposed.
  for (const f of found.filter((f) => !inSpan(f))) {
    const remaining = counts.get(key(f)) ?? 0;
    if (remaining > 0) counts.set(key(f), remaining - 1);
  }

  const out = [];

  for (const f of found.filter(inSpan)) {
    const remaining = counts.get(key(f)) ?? 0;
    if (remaining > 0) {
      counts.set(key(f), remaining - 1);
      continue;
    }
    out.push(f);
  }

  return out;
}

// ============================================================================
// CLI
// ============================================================================

/**
 * Lists the files to scan.
 *
 * @param args - Paths the caller named, empty for the whole tree
 * @returns Repo-relative paths
 */
function targets(args) {
  if (args.length) return args;
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1 << 28 })
    .trim()
    .split('\n')
    .filter(governs);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const files = targets(process.argv.slice(2));
  let total = 0;

  let unreadable = 0;

  for (const file of files) {
    let source;
    // One bad path must not suppress the findings for every file after it.
    try {
      source = readFileSync(file, 'utf8');
    } catch (error) {
      console.error(`${file}  could not be read — ${error.message}`);
      unreadable++;
      continue;
    }

    const found = scan(source, file);
    total += found.length;
    for (const f of found)
      console.log(`${file}:${f.line}  [${f.rule}]  ${f.message}`);
  }

  console.log(`\n${total} finding(s) across ${files.length} file(s).`);
  process.exit(total > 0 || unreadable > 0 ? 1 : 0);
}
