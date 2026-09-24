export const search = {
  name: 'search',
  description: 'Running a search: patterns, case, whole words',
  sections: [
    {
      title: 'Running a Search',
      items: [
        {
          kind: 'cmd',
          name: 'rg PATTERN',
          desc: 'Search below the current directory',
        },
        {
          kind: 'cmd',
          name: 'rg PATTERN src/ file.ts',
          desc: 'Search only these paths',
          children: [
            {
              kind: 'note',
              text: '  A path named on the command line overrides every glob and ignore rule',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'command | rg PATTERN',
          desc: 'Search stdin instead of files',
          children: [
            {
              kind: 'note',
              text: "  With no path given, rg reads stdin whenever stdin isn't a terminal — so in a script or cron job, rg PATTERN alone can hang forever. Name a path, even if it is just a dot.",
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg -e PATTERN -e PATTERN',
          desc: 'Several patterns — a line matching any one is printed',
          children: [
            {
              kind: 'flag',
              name: '-e, --regexp PATTERN',
              desc: 'Repeatable, and how you match a leading dash',
            },
            {
              kind: 'flag',
              name: '-f, --file PATTERNFILE',
              desc: 'One pattern per line; - reads stdin',
            },
            {
              kind: 'note',
              text: '  With -e or -f, every positional argument becomes a path to search',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -- '-foo'",
          desc: 'Match a pattern that starts with a dash',
        },
      ],
    },
    {
      title: 'Case, Words & Literals',
      items: [
        { kind: 'flag', name: '-i, --ignore-case', desc: 'Ignore case' },
        {
          kind: 'flag',
          name: '-S, --smart-case',
          desc: 'Ignore case unless you type a capital',
        },
        {
          kind: 'flag',
          name: '-s, --case-sensitive',
          desc: 'Force case sensitivity — the default',
        },
        {
          kind: 'flag',
          name: '-w, --word-regexp',
          desc: 'Only matches sitting at word boundaries',
        },
        {
          kind: 'flag',
          name: '-x, --line-regexp',
          desc: 'Only when the whole line matches',
        },
        {
          kind: 'flag',
          name: '-F, --fixed-strings',
          desc: 'Literal text — nothing needs escaping',
        },
        {
          kind: 'flag',
          name: '-v, --invert-match',
          desc: "Print the lines that don't match",
        },
        {
          kind: 'flag',
          name: '-m, --max-count NUM',
          desc: 'Stop after NUM matching lines per file',
        },
        {
          kind: 'flag',
          name: '--stop-on-nonmatch',
          desc: 'Stop at the first non-match after a match',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: '(?i) inside a pattern beats -i, -S and -s for that pattern alone.',
        },
        {
          kind: 'note',
          text: '-S counts a pattern as lowercase only if it holds a literal: \\w is not, a\\w is.',
        },
        {
          kind: 'note',
          text: '-v inverts lines, not files. For files with no match at all, use --files-without-match.',
        },
      ],
    },
    {
      title: 'Multiline & Regex Engines',
      items: [
        {
          kind: 'cmd',
          name: "rg -U 'foo\\nbar'",
          desc: 'Let one match span several lines',
          children: [
            {
              kind: 'flag',
              name: '-U, --multiline',
              desc: 'Allow \\n inside a match',
            },
            {
              kind: 'flag',
              name: '--multiline-dotall',
              desc: 'Make . cross line breaks too',
            },
            {
              kind: 'note',
              text: '  Even under -U, a . stops at \\n until you add (?s). Without -U a \\n in the pattern is an error.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -P '(?<=const )\\w+'",
          desc: 'PCRE2 — look-around and backreferences',
          children: [
            {
              kind: 'flag',
              name: '-P, --pcre2',
              desc: 'Same as --engine=pcre2',
            },
            {
              kind: 'flag',
              name: '--engine default|pcre2|auto',
              desc: 'auto falls back to PCRE2 per pattern',
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'flag',
          name: '--crlf',
          desc: 'Treat CRLF as one line ending, so $ lands right',
        },
        {
          kind: 'flag',
          name: '--null-data',
          desc: 'Split input on NUL rather than newline',
        },
        {
          kind: 'flag',
          name: '-E, --encoding ENC',
          desc: 'Force an encoding; auto only sniffs a BOM',
        },
        {
          kind: 'flag',
          name: '--no-unicode',
          desc: 'Make \\w \\s \\d \\b ASCII-only, often faster',
        },
        {
          kind: 'flag',
          name: '-j, --threads NUM',
          desc: 'Thread count; -j1 also caps memory use',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Multiline is slower and needs each file held whole in memory. Leave it off unless a match really does cross lines.',
        },
      ],
    },
  ],
};
