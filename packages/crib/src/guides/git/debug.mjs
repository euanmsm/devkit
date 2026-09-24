export const debug = {
  name: 'debug',
  description: 'bisect, grep, reflog, fsck',
  sections: [
    {
      title: 'Debugging',
      items: [
        {
          kind: 'cmd',
          name: 'git bisect <subcommand>',
          desc: 'Binary search for bug',
          children: [
            {
              kind: 'subcmd',
              name: 'start [<bad>] [<good>...]',
              desc: 'Start bisecting',
            },
            { kind: 'subcmd', name: 'bad / new [<rev>]', desc: 'Mark as bad' },
            {
              kind: 'subcmd',
              name: 'good / old [<rev>]',
              desc: 'Mark as good',
            },
            {
              kind: 'subcmd',
              name: 'skip [<rev>...]',
              desc: 'Skip a revision',
            },
            {
              kind: 'subcmd',
              name: 'reset [<branch>]',
              desc: 'End bisect, return to branch',
            },
            {
              kind: 'subcmd',
              name: 'run <cmd>',
              desc: 'Auto-bisect with script',
            },
            {
              kind: 'subcmd',
              name: 'log / replay / visualize',
              desc: 'Session management',
            },
            {
              kind: 'flag',
              name: '--no-checkout',
              desc: "Don't checkout, use BISECT_HEAD",
            },
            {
              kind: 'flag',
              name: '--first-parent',
              desc: 'Follow only first parent',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git grep <pattern> [<path>...]',
          desc: 'Search tracked files',
          children: [
            {
              kind: 'flag',
              name: '-n, --line-number',
              desc: 'Show line numbers',
            },
            { kind: 'flag', name: '-c, --count', desc: 'Count matches' },
            {
              kind: 'flag',
              name: '-l, --files-with-matches',
              desc: 'Files only',
            },
            {
              kind: 'flag',
              name: '-L, --files-without-match',
              desc: 'Non-matching files',
            },
            {
              kind: 'flag',
              name: '-i, --ignore-case',
              desc: 'Case insensitive',
            },
            {
              kind: 'flag',
              name: '-w, --word-regexp',
              desc: 'Match at word boundaries',
            },
            {
              kind: 'flag',
              name: '-v, --invert-match',
              desc: 'Non-matching lines',
            },
            {
              kind: 'flag',
              name: '-E, --extended-regexp',
              desc: 'Extended regex',
            },
            { kind: 'flag', name: '-P, --perl-regexp', desc: 'Perl regex' },
            {
              kind: 'flag',
              name: '-F, --fixed-strings',
              desc: 'Literal match',
            },
            {
              kind: 'flag',
              name: '-A / -B / -C <n>',
              desc: 'Context lines (after/before/both)',
            },
            {
              kind: 'flag',
              name: '-W, --function-context',
              desc: 'Show entire function',
            },
            {
              kind: 'flag',
              name: '-p, --show-function',
              desc: 'Show function name',
            },
            { kind: 'flag', name: '--cached', desc: 'Search index' },
            {
              kind: 'flag',
              name: '--untracked',
              desc: 'Include untracked files',
            },
            {
              kind: 'flag',
              name: '--recurse-submodules',
              desc: 'Search submodules',
            },
            {
              kind: 'flag',
              name: '--and / --or / --not',
              desc: 'Boolean operators',
            },
            {
              kind: 'flag',
              name: '--all-match',
              desc: 'All patterns must match',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git reflog [show] [<ref>]',
          desc: 'Manage reference logs',
          children: [
            {
              kind: 'subcmd',
              name: 'show [<ref>]',
              desc: 'Show reflog (default)',
            },
            { kind: 'subcmd', name: 'expire', desc: 'Prune old entries' },
            {
              kind: 'subcmd',
              name: 'delete <entry>',
              desc: 'Delete specific entry',
            },
            { kind: 'subcmd', name: 'drop [<ref>]', desc: 'Drop all entries' },
            {
              kind: 'subcmd',
              name: 'exists <ref>',
              desc: 'Check if reflog exists',
            },
            {
              kind: 'flag',
              name: '--expire=<time>',
              desc: 'Prune entries older than',
            },
            {
              kind: 'flag',
              name: '-n, --dry-run',
              desc: 'Show what would be pruned',
            },
            {
              kind: 'note',
              text: 'Supports all git log flags for show subcommand',
            },
          ],
        },
      ],
    },
  ],
};
