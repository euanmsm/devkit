export const inspect = {
  name: 'inspect',
  description: 'log, diff, show, blame, shortlog',
  sections: [
    {
      title: 'Inspection & Comparison',
      items: [
        {
          kind: 'cmd',
          name: 'git log [<options>] [<revision>] [-- <path>]',
          desc: 'Show commit logs',
          children: [
            {
              kind: 'flag',
              name: '--oneline',
              desc: 'Short format (SHA + subject)',
            },
            { kind: 'flag', name: '--graph', desc: 'ASCII art graph' },
            { kind: 'flag', name: '--all', desc: 'All refs' },
            {
              kind: 'flag',
              name: '--pretty=<format>',
              desc: 'oneline, short, medium, full, format:...',
            },
            {
              kind: 'flag',
              name: '--format=<format>',
              desc: 'Alias for --pretty',
            },
            { kind: 'flag', name: '--abbrev-commit', desc: 'Short SHA' },
            {
              kind: 'flag',
              name: '--date=<format>',
              desc: 'relative, short, iso, rfc, human, unix',
            },
            {
              kind: 'flag',
              name: '--author=<pattern>',
              desc: 'Filter by author',
            },
            {
              kind: 'flag',
              name: '--committer=<pattern>',
              desc: 'Filter by committer',
            },
            {
              kind: 'flag',
              name: '--grep=<pattern>',
              desc: 'Filter by message',
            },
            { kind: 'flag', name: '--invert-grep', desc: 'Invert grep match' },
            {
              kind: 'flag',
              name: '-i, --regexp-ignore-case',
              desc: 'Case-insensitive',
            },
            {
              kind: 'flag',
              name: '-E, --extended-regexp',
              desc: 'Extended regex',
            },
            {
              kind: 'flag',
              name: '-n, --max-count=<n>',
              desc: 'Limit to n commits',
            },
            { kind: 'flag', name: '--skip=<n>', desc: 'Skip n commits' },
            {
              kind: 'flag',
              name: '--since / --after=<date>',
              desc: 'Commits after date',
            },
            {
              kind: 'flag',
              name: '--until / --before=<date>',
              desc: 'Commits before date',
            },
            {
              kind: 'flag',
              name: '--merges / --no-merges',
              desc: 'Only/no merge commits',
            },
            {
              kind: 'flag',
              name: '--first-parent',
              desc: 'Follow only first parent',
            },
            {
              kind: 'flag',
              name: '--follow',
              desc: 'Follow renames (single file)',
            },
            {
              kind: 'flag',
              name: '--source',
              desc: 'Show which ref reached commit',
            },
            {
              kind: 'flag',
              name: '--left-right',
              desc: 'Mark symmetric diff sides',
            },
            { kind: 'flag', name: '--topo-order', desc: 'Topological order' },
            { kind: 'flag', name: '--reverse', desc: 'Reverse order' },
            { kind: 'flag', name: '-p, --patch', desc: 'Show diff' },
            { kind: 'flag', name: '--stat', desc: 'Show diffstat' },
            {
              kind: 'flag',
              name: '--name-only / --name-status',
              desc: 'Changed files',
            },
            {
              kind: 'flag',
              name: '--show-signature',
              desc: 'Show GPG signature',
            },
            {
              kind: 'flag',
              name: '-g, --walk-reflogs',
              desc: 'Walk reflog entries',
            },
            {
              kind: 'flag',
              name: '--decorate[=short|full|no]',
              desc: 'Ref decoration',
            },
            {
              kind: 'flag',
              name: '-S<string> / -G<regex>',
              desc: 'Pickaxe search',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git show <object>',
          desc: 'Show object details',
          children: [
            {
              kind: 'note',
              text: 'Commits: log + diff. Tags: tag msg + object. Trees: names. Blobs: contents.',
            },
            {
              kind: 'note',
              text: 'Supports all git log format and diff flags',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git shortlog [<options>]',
          desc: 'Summarize log output',
          children: [
            { kind: 'flag', name: '-n, --numbered', desc: 'Sort by count' },
            { kind: 'flag', name: '-s, --summary', desc: 'Count only' },
            { kind: 'flag', name: '-e, --email', desc: 'Show emails' },
            {
              kind: 'flag',
              name: '--group=<type>',
              desc: 'Group by: author, committer, trailer:<field>',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git describe [<commit>]',
          desc: 'Human-readable name from tag',
          children: [
            {
              kind: 'flag',
              name: '--tags',
              desc: 'Use any tag (including lightweight)',
            },
            { kind: 'flag', name: '--all', desc: 'Use any ref' },
            {
              kind: 'flag',
              name: '--exact-match',
              desc: 'Only exact tag match',
            },
            { kind: 'flag', name: '--contains', desc: 'Find tag after commit' },
            { kind: 'flag', name: '--long', desc: 'Always long format' },
            {
              kind: 'flag',
              name: '--dirty[=<mark>]',
              desc: 'Append dirty suffix',
            },
            { kind: 'flag', name: '--abbrev=<n>', desc: 'Abbreviation length' },
            {
              kind: 'flag',
              name: '--match <glob>',
              desc: 'Only matching tags',
            },
            {
              kind: 'flag',
              name: '--exclude <glob>',
              desc: 'Exclude matching tags',
            },
            {
              kind: 'flag',
              name: '--first-parent',
              desc: 'Follow only first parent',
            },
            {
              kind: 'flag',
              name: '--always',
              desc: 'Show abbrev SHA if no tag',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git blame <file>',
          desc: 'Show per-line authorship',
          children: [
            { kind: 'flag', name: '-L <start>,<end>', desc: 'Line range' },
            { kind: 'flag', name: '-L :<funcname>', desc: 'Function range' },
            { kind: 'flag', name: '-p, --porcelain', desc: 'Machine format' },
            { kind: 'flag', name: '-e, --show-email', desc: 'Show email' },
            { kind: 'flag', name: '-w', desc: 'Ignore whitespace' },
            {
              kind: 'flag',
              name: '-M[<n>]',
              desc: 'Detect moved lines within file',
            },
            {
              kind: 'flag',
              name: '-C[<n>]',
              desc: 'Detect lines from other files',
            },
            {
              kind: 'flag',
              name: '--ignore-rev <rev>',
              desc: 'Ignore revision',
            },
            {
              kind: 'flag',
              name: '--ignore-revs-file <file>',
              desc: 'File of revisions to ignore',
            },
            { kind: 'flag', name: '--color-by-age', desc: 'Color by line age' },
            { kind: 'flag', name: '--date <format>', desc: 'Date format' },
            { kind: 'flag', name: '--show-stats', desc: 'Show statistics' },
          ],
        },
      ],
    },
  ],
};
