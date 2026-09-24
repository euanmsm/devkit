// The markdown subset lessons are written in, enforced rather than documented.
//
// Lessons are prose, and prose is miserable to author in template strings, so
// lesson bodies are .md files — but they are rendered here, not by a markdown
// library, and the subset is deliberately small: `##` headings, paragraphs
// with **bold** and `code` spans, `-` bullets, fenced code blocks, and `---`
// rules. Anything else throws a LessonSyntaxError naming the file and line,
// which the content tests turn into an `npm test` failure — an author finds
// out immediately, not when a reader hits a mangled screen.
//
// If the subset ever feels tight, simplify the lesson rather than extending
// the parser. That rule is what keeps content growth from becoming code
// growth (plan/architecture.md, "The scaling contract").

/**
 * One block of a lesson body. Inline `code` and **bold** stay in the text.
 *
 * @typedef {(
 *   | { kind: "heading"; text: string }
 *   | { kind: "para"; text: string }
 *   | { kind: "bullets"; items: string[] }
 *   | { kind: "code"; lines: string[] }
 *   | { kind: "rule" }
 * )} Block
 */

/** Thrown for anything outside the subset, with a `file:line` message. */
export class LessonSyntaxError extends Error {}

/**
 * Inline code spans are opaque: `git branch | fzf` must not read as a table
 * row. Each span is replaced by harmless padding of the same length before
 * the rejection patterns run.
 */
function maskInlineCode(line) {
  return line.replace(/`[^`]*`/g, (span) => 'x'.repeat(span.length));
}

/** What we refuse, and the message that explains the refusal. */
const REJECTIONS = [
  { pattern: /^#(?!#\s)/, why: 'only ## headings are supported' },
  { pattern: /^###/, why: 'only ## headings are supported' },
  { pattern: /^\s+-\s/, why: "bullets don't nest" },
  { pattern: /^[*+]\s/, why: 'bullets are written with -' },
  { pattern: /^\d+\.\s/, why: "numbered lists aren't supported" },
  { pattern: /^>/, why: "blockquotes aren't supported" },
  { pattern: /^\|/, why: "tables aren't supported" },
  { pattern: /!?\[[^\]]*\]\(/, why: "links and images aren't supported" },
];

/**
 * Parses a lesson body into blocks, throwing on anything outside the subset.
 * `where` is the path used in error messages, so failures read `file:line`.
 *
 * Paragraph and bullet lines are joined with spaces, so prettier hard-wrapping
 * the source is harmless — the text reflows to the reader's width at render
 * time, never the author's.
 */
export function parseLesson(source, where) {
  const lines = source.split('\n');
  const blocks = [];

  /** The paragraph or bullet list currently being gathered, if any. */
  let open = null;
  const close = () => {
    if (open) blocks.push(open);
    open = null;
  };
  const fail = (index, why) => {
    throw new LessonSyntaxError(`${where}:${index + 1}: ${why}`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code first: everything inside is verbatim and exempt from checks.
    if (line.startsWith('```')) {
      close();
      const body = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].startsWith('```')) {
          closed = true;
          break;
        }
        body.push(lines[i]);
      }
      if (!closed) fail(i - body.length - 1, 'code block is never closed');
      blocks.push({ kind: 'code', lines: body });
      continue;
    }

    if (line.trim() === '') {
      close();
      continue;
    }

    if (/^##\s/.test(line)) {
      close();
      blocks.push({ kind: 'heading', text: line.slice(2).trim() });
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      close();
      blocks.push({ kind: 'rule' });
      continue;
    }

    if (line.startsWith('- ')) {
      const item = line.slice(2).trim();
      if (open?.kind === 'bullets') open.items.push(item);
      else {
        close();
        open = { kind: 'bullets', items: [item] };
      }
      continue;
    }

    // An indented line under a bullet is that bullet wrapped by prettier —
    // unless it's an indented `- `, which is a nested list and rejected above.
    if (open?.kind === 'bullets' && /^\s/.test(line)) {
      const rejected = REJECTIONS.find((r) =>
        r.pattern.test(maskInlineCode(line)),
      );
      if (rejected) fail(i, rejected.why);
      open.items[open.items.length - 1] += ' ' + line.trim();
      continue;
    }

    const rejected = REJECTIONS.find((r) =>
      r.pattern.test(maskInlineCode(line)),
    );
    if (rejected) fail(i, rejected.why);

    if (open?.kind === 'para') open.text += ' ' + line.trim();
    else {
      close();
      open = { kind: 'para', text: line.trim() };
    }
  }

  close();
  return blocks;
}
