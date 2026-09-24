export const output = {
  name: 'output',
  description: 'Context, line numbers, replacement, colour',
  sections: [
    {
      title: 'Context & Layout',
      items: [
        {
          kind: 'cmd',
          name: 'rg -C 3 PATTERN',
          desc: 'Show 3 lines either side of each match',
          children: [
            {
              kind: 'flag',
              name: '-A, --after-context NUM',
              desc: 'Lines after',
            },
            {
              kind: 'flag',
              name: '-B, --before-context NUM',
              desc: 'Lines before',
            },
            {
              kind: 'flag',
              name: '--context-separator SEP',
              desc: 'Between runs of context; default --',
            },
            {
              kind: 'flag',
              name: '--no-context-separator',
              desc: 'Drop the separator entirely',
            },
            {
              kind: 'note',
              text: '  -A and -B each override half of -C whatever the order, so -A2 -C1 means -A2 -B1',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --passthru PATTERN file',
          desc: 'Print every line, highlighting the matches',
        },
        { kind: 'gap' },
        {
          kind: 'flag',
          name: '-n, --line-number',
          desc: 'Line numbers; on by default on a terminal',
        },
        { kind: 'flag', name: '-N, --no-line-number', desc: 'Turn them off' },
        {
          kind: 'flag',
          name: '--column',
          desc: 'Column of the first match; implies -n',
        },
        {
          kind: 'flag',
          name: '-b, --byte-offset',
          desc: 'Byte offset of the line',
        },
        {
          kind: 'flag',
          name: '-H, --with-filename',
          desc: 'Always show the path',
        },
        { kind: 'flag', name: '-I, --no-filename', desc: 'Never show it' },
        {
          kind: 'flag',
          name: '--heading / --no-heading',
          desc: 'Path above its matches, or on every line',
        },
        {
          kind: 'flag',
          name: '--trim',
          desc: 'Strip leading whitespace from printed lines',
        },
        {
          kind: 'flag',
          name: '-M, --max-columns NUM',
          desc: 'Omit lines longer than this',
        },
        {
          kind: 'flag',
          name: '--max-columns-preview',
          desc: 'Show the start of them rather than nothing',
        },
        {
          kind: 'flag',
          name: '--vimgrep',
          desc: 'One line per match: path:line:col:text',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Piping switches from headings to the grep shape by itself, which is why rg foo | cat looks different.',
        },
        {
          kind: 'note',
          text: '--vimgrep repeats a line in full for each match on it, so output can balloon. Prefer --json for tooling.',
        },
      ],
    },
    {
      title: 'Extracting & Rewriting',
      items: [
        {
          kind: 'cmd',
          name: 'rg -o PATTERN',
          desc: 'Print just the matched text, one per line',
        },
        {
          kind: 'cmd',
          name: "rg 'v(\\d+)' -r 'version $1'",
          desc: 'Rewrite matches on the way out',
          children: [
            {
              kind: 'flag',
              name: '-r, --replace TEXT',
              desc: '$1, ${1}, $name, and $0 for the whole match',
            },
            {
              kind: 'note',
              text: '  Prints only — no file is ever touched. Preview a rename here, then apply it with sed.',
            },
            {
              kind: 'note',
              text: '  Single-quote it, or the shell eats $1. $$ gives a literal $, and ${1}a appends to group 1.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg -0 -l PATTERN | xargs -0 CMD',
          desc: 'NUL-terminate paths so odd filenames survive',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: '-r replaces the match, not the line. Match the whole line if that is what you meant.',
        },
      ],
    },
    {
      title: 'Colour, Sorting & Buffering',
      items: [
        {
          kind: 'cmd',
          name: 'rg -p PATTERN | less -R',
          desc: 'Keep the pretty output through a pipe',
          children: [
            {
              kind: 'flag',
              name: '-p, --pretty',
              desc: '= --color=always --heading --line-number',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg --colors 'match:fg:magenta' PATTERN",
          desc: 'Restyle one part of the output',
          children: [
            {
              kind: 'flag',
              name: '{type}:{attribute}:{value}',
              desc: 'path, line, column, match or highlight',
            },
            {
              kind: 'flag',
              name: '{type}:none',
              desc: 'Clear every setting for that type',
            },
            {
              kind: 'note',
              text: '  attribute is fg, bg or style; value is a colour name, 256-colour 33, or 0,128,255',
            },
            {
              kind: 'note',
              text: '  highlight styles the non-matching text on a matching line — useful against context lines',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --hyperlink-format vscode PATTERN',
          desc: 'Make paths clickable in the terminal',
          children: [
            {
              kind: 'note',
              text: '  Aliases: default, none, cursor, file, grep+, kitty, macvim, textmate, vscode, vscodium',
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'flag',
          name: '--color never|auto|always|ansi',
          desc: 'When to colourise',
        },
        {
          kind: 'flag',
          name: '--sort path|modified|accessed|created',
          desc: 'Deterministic order',
        },
        { kind: 'flag', name: '--sortr SORTBY', desc: 'The same, descending' },
        {
          kind: 'flag',
          name: '--line-buffered',
          desc: 'Flush each match at once, for live pipelines',
        },
        {
          kind: 'flag',
          name: '--block-buffered',
          desc: 'The opposite, and the default when piped',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Any sorting drops rg to a single thread, so leave it off unless you need the order.',
        },
        {
          kind: 'note',
          text: '--color=auto also stands down for NO_COLOR, TERM=dumb, --vimgrep and --json.',
        },
      ],
    },
  ],
};
