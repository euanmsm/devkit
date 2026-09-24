import { search } from './search.mjs';
import { files } from './files.mjs';
import { output } from './output.mjs';
import { modes } from './modes.mjs';
import { regex } from './regex.mjs';
import { pcre2 } from './pcre2.mjs';
import { recipes } from './recipes.mjs';
import { config } from './config.mjs';

export const rg = {
  name: 'rg',
  title: 'rg — ripgrep',
  summary: 'ripgrep — recursive search',
  intro: [
    { kind: 'note', text: 'rg [OPTIONS] PATTERN [PATH ...]' },
    {
      kind: 'note',
      text: 'Recursive from the current directory, skipping gitignored files, hidden files, binaries and symlinks. rg -uuu turns all four off.',
    },
    { kind: 'gap' },
    {
      kind: 'flag',
      name: '-i / -S',
      desc: 'Ignore case / only when all-lowercase',
    },
    {
      kind: 'flag',
      name: '-w / -F',
      desc: 'Whole words / literal text, not a regex',
    },
    {
      kind: 'flag',
      name: '-g GLOB / -t TYPE',
      desc: 'Restrict which files are searched',
    },
    { kind: 'flag', name: '-l / -c', desc: 'Just the paths / just the counts' },
    { kind: 'flag', name: '-C NUM / -A / -B', desc: 'Surrounding lines' },
    {
      kind: 'flag',
      name: '-o / -r TEXT',
      desc: 'Only the match / rewrite it on the way out',
    },
    {
      kind: 'flag',
      name: '-U / -P',
      desc: 'Match across lines / PCRE2 for look-around',
    },
    {
      kind: 'flag',
      name: '--files / --debug',
      desc: 'What would be searched, and why not',
    },
  ],
  topics: [search, files, output, modes, regex, pcre2, recipes, config],
};
