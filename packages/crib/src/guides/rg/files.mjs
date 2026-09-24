export const files = {
  name: 'files',
  description: 'Choosing which files get searched',
  sections: [
    {
      title: 'Globs & File Types',
      items: [
        {
          kind: 'cmd',
          name: "rg -g '*.ts' PATTERN",
          desc: 'Only files matching the glob',
          children: [
            { kind: 'flag', name: '-g, --glob GLOB', desc: 'Repeatable' },
            {
              kind: 'flag',
              name: '--iglob GLOB',
              desc: 'The same, matched case-insensitively',
            },
            {
              kind: 'flag',
              name: '--glob-case-insensitive',
              desc: 'Make every -g case-insensitive',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -g '!*.test.ts' PATTERN",
          desc: 'Exclude with a leading !',
        },
        {
          kind: 'cmd',
          name: "rg -g 'src/**' PATTERN",
          desc: 'Confine the search to one directory',
          children: [
            {
              kind: 'note',
              text: "  -g 'src' matches nothing — src/app.ts is not the glob src. The /** is what descends.",
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -g '*.{ts,tsx}' PATTERN",
          desc: 'Alternatives in braces — an rg extension',
        },
        { kind: 'gap' },
        {
          kind: 'cmd',
          name: 'rg -t py PATTERN',
          desc: 'Only files of a known type',
          children: [
            { kind: 'flag', name: '-t, --type TYPE', desc: 'Repeatable' },
            {
              kind: 'flag',
              name: '-T, --type-not TYPE',
              desc: 'Exclude a type',
            },
            {
              kind: 'flag',
              name: '-t all / -T all',
              desc: 'Only recognised files / only unrecognised ones',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --type-list',
          desc: 'Every type name and the globs behind it',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Globs use gitignore rules. A later -g beats an earlier one, and -g beats both file types and ignore files.',
        },
        {
          kind: 'note',
          text: 'Over 200 types are built in, and you can add your own — see cheat rg --config.',
        },
      ],
    },
    {
      title: 'Ignore Rules & Hidden Files',
      items: [
        {
          kind: 'cmd',
          name: 'rg -uuu PATTERN',
          desc: 'Search everything, the way grep -r would',
          children: [
            { kind: 'flag', name: '-u', desc: '= --no-ignore' },
            { kind: 'flag', name: '-uu', desc: '= --no-ignore --hidden' },
            {
              kind: 'flag',
              name: '-uuu',
              desc: '= --no-ignore --hidden --binary',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg --hidden -g '!.git' PATTERN",
          desc: 'Include dotfiles, but still not .git',
          children: [
            {
              kind: 'flag',
              name: '-., --hidden',
              desc: 'Yes, the short flag really is a dot',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --no-ignore PATTERN',
          desc: 'Disregard every ignore file',
          children: [
            {
              kind: 'flag',
              name: '--no-ignore-vcs',
              desc: 'Only skip .gitignore',
            },
            {
              kind: 'flag',
              name: '--no-ignore-dot',
              desc: 'Only skip .ignore and .rgignore',
            },
            {
              kind: 'flag',
              name: '--no-ignore-parent',
              desc: 'Only skip ignore files above you',
            },
            {
              kind: 'flag',
              name: '--no-ignore-global',
              desc: 'Only skip ~/.config/git/ignore',
            },
            {
              kind: 'flag',
              name: '--no-ignore-exclude',
              desc: 'Only skip .git/info/exclude',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --ignore-file PATH PATTERN',
          desc: 'Extra rules from a gitignore-shaped file',
        },
        {
          kind: 'cmd',
          name: 'rg --no-require-git PATTERN',
          desc: 'Honour .gitignore outside a git repo',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Precedence, weakest first: --ignore-file, global gitignore, .git/info/exclude, .gitignore, .ignore, .rgignore.',
        },
        {
          kind: 'note',
          text: 'So !foo in .rgignore un-ignores a foo that .gitignore had excluded.',
        },
        {
          kind: 'note',
          text: 'rg and git can disagree: a file that is gitignored but tracked is found by git grep and skipped by rg.',
        },
      ],
    },
    {
      title: 'Traversal & Awkward Files',
      items: [
        {
          kind: 'flag',
          name: '-d, --max-depth NUM',
          desc: 'Stop descending after NUM levels',
        },
        {
          kind: 'flag',
          name: '-L, --follow',
          desc: 'Follow symlinks, reporting loops',
        },
        {
          kind: 'flag',
          name: '--max-filesize 1M',
          desc: 'Skip anything bigger (K, M, G)',
        },
        {
          kind: 'flag',
          name: '--one-file-system',
          desc: "Don't cross mount points, like find -xdev",
        },
        {
          kind: 'flag',
          name: '-a, --text',
          desc: 'Search binaries as text — may spew escape codes',
        },
        {
          kind: 'flag',
          name: '--binary',
          desc: 'Gentler: read past a NUL until a match or EOF',
        },
        { kind: 'gap' },
        {
          kind: 'cmd',
          name: 'rg -z PATTERN logs/',
          desc: 'Search gz, bz2, xz, lz4, lzma, br and zst as it goes',
          children: [
            {
              kind: 'note',
              text: '  Needs the decompression binaries on PATH. Not an archive reader — a .tar.gz is one stream, not a tree.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg --pre CMD --pre-glob '*.pdf' PATTERN",
          desc: "Search a command's output instead of the file",
          children: [
            {
              kind: 'flag',
              name: '--pre CMD',
              desc: 'CMD gets the path as $1 and the file on stdin',
            },
            {
              kind: 'flag',
              name: '--pre-glob GLOB',
              desc: 'Limit which files pay for a process',
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: '-d 0 searches only the paths you named, so rg -d 0 dir/ finds nothing at all.',
        },
        {
          kind: 'note',
          text: "By default a NUL byte ends a file's search and rg warns that matches were suppressed.",
        },
      ],
    },
  ],
};
