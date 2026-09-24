// The lesson markdown subset: what parses, what is refused, and that every
// refusal names the file and line so authors find out at npm test.

import { deepEqual, equal, throws } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseLesson } from '../src/learn/markdown.mjs';

const parse = (source) => parseLesson(source, 'lesson.md');

describe('what the subset accepts', () => {
  it('headings', () => {
    deepEqual(parse('## Moving'), [{ kind: 'heading', text: 'Moving' }]);
  });

  it('joins a hard-wrapped paragraph back into one', () => {
    deepEqual(parse('One line\nwrapped by prettier.'), [
      { kind: 'para', text: 'One line wrapped by prettier.' },
    ]);
  });

  it('keeps inline bold and code markers for the renderer', () => {
    deepEqual(parse('Press `Ctrl-R` and **never** scroll.'), [
      { kind: 'para', text: 'Press `Ctrl-R` and **never** scroll.' },
    ]);
  });

  it('bullets, including one wrapped onto a continuation line', () => {
    deepEqual(parse('- first\n- second item\n  that wrapped'), [
      { kind: 'bullets', items: ['first', 'second item that wrapped'] },
    ]);
  });

  it('fenced code, verbatim, with the language tag ignored', () => {
    deepEqual(parse('```bash\neval "$(fzf --zsh)"   # comment\n```'), [
      { kind: 'code', lines: ['eval "$(fzf --zsh)"   # comment'] },
    ]);
  });

  it('rules', () => {
    deepEqual(parse('---'), [{ kind: 'rule' }]);
  });

  it('separates blocks on blank lines', () => {
    equal(parse('## Title\n\nA paragraph.\n\n- a bullet').length, 3);
  });

  it('does not mistake a pipe inside an inline code span for a table', () => {
    deepEqual(parse('Try `git branch | fzf` on any list.'), [
      { kind: 'para', text: 'Try `git branch | fzf` on any list.' },
    ]);
  });
});

describe('what the subset refuses', () => {
  const refusals = [
    ['h1 headings', '# Title', /only ## headings/],
    ['h3 headings', '### Deep', /only ## headings/],
    ['numbered lists', '1. first', /numbered lists/],
    ['star bullets', '* item', /written with -/],
    ['blockquotes', '> quoted', /blockquotes/],
    ['tables', '| a | b |', /tables/],
    ['links', 'see [docs](https://x)', /links and images/],
    ['images', '![alt](x.png)', /links and images/],
    ['nested bullets', '- outer\n  - inner', /don't nest/],
    ['unclosed code fences', '```\nstuck', /never closed/],
  ];

  for (const [name, source, why] of refusals) {
    it(name, () => {
      throws(parse.bind(null, source), why);
    });
  }

  it('names the file and line', () => {
    throws(() => parse('fine\n\n# not fine'), /lesson\.md:3: only ## headings/);
  });
});
