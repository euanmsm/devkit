export const modes = {
  name: 'modes',
  description: 'Lists, counts, JSON, exit codes',
  sections: [
    {
      title: 'Output Modes',
      items: [
        {
          kind: 'cmd',
          name: 'rg -l PATTERN',
          desc: 'Just the paths that matched',
          children: [
            {
              kind: 'flag',
              name: '-l, --files-with-matches',
              desc: 'Stops reading each file at its first match',
            },
            {
              kind: 'flag',
              name: '--files-without-match',
              desc: 'The paths with no match at all',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg -c PATTERN',
          desc: 'Matching lines per file',
          children: [
            {
              kind: 'flag',
              name: '--count-matches',
              desc: 'Total matches, counting repeats on a line',
            },
            {
              kind: 'flag',
              name: '--include-zero',
              desc: 'List files with a count of 0 too',
            },
            {
              kind: 'note',
              text: '  -c together with -o behaves as --count-matches',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --files',
          desc: 'List what would be searched, and search nothing',
          children: [
            {
              kind: 'note',
              text: '  The way to test a glob or an ignore rule. Pipe it into rg again to find files by name.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --json PATTERN',
          desc: 'JSON Lines, for tooling',
          children: [
            {
              kind: 'note',
              text: '  Message types: begin, match, context, end, summary',
            },
            {
              kind: 'note',
              text: '  Valid UTF-8 arrives as text, anything else as base64 bytes',
            },
            {
              kind: 'note',
              text: '  Turns --stats on, ignores the formatting flags, and errors alongside -l, -c or --files',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg -q PATTERN',
          desc: 'Say nothing — the exit code is the answer',
        },
        {
          kind: 'cmd',
          name: 'rg --stats PATTERN',
          desc: 'Totals at the end: matches, files, bytes, time',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'These replace the normal output rather than decorating it, so pick one.',
        },
        {
          kind: 'note',
          text: '-c and -l can disagree on binary files: -c reads the whole file and may hit a NUL that -l stopped short of. --binary settles it.',
        },
      ],
    },
    {
      title: 'Exit Status & Diagnostics',
      items: [
        { kind: 'cmd', name: '0', desc: 'At least one match, and no errors' },
        { kind: 'cmd', name: '1', desc: 'No match, and no errors' },
        {
          kind: 'cmd',
          name: '2',
          desc: "An error — a bad regex, or a file it couldn't read",
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: "So testing rg -q in an if works, but a typo'd pattern takes the else branch too. Check for 2 explicitly when it matters.",
        },
        { kind: 'gap' },
        {
          kind: 'cmd',
          name: 'rg --debug PATTERN path',
          desc: 'Why was that file skipped?',
          children: [
            {
              kind: 'flag',
              name: '--trace',
              desc: "More again, when --debug isn't enough",
            },
            {
              kind: 'note',
              text: '  Names every skipped file and the rule that skipped it',
            },
          ],
        },
        {
          kind: 'flag',
          name: '--no-messages',
          desc: "Swallow can't-open-file errors",
        },
        {
          kind: 'flag',
          name: '--no-ignore-messages',
          desc: 'Swallow malformed-ignore-file errors',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Neither of those hides a bad pattern — you still hear about that.',
        },
      ],
    },
  ],
};
