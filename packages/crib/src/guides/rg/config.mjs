export const config = {
  name: 'config',
  description: 'Config file, custom types, ignore files',
  sections: [
    {
      title: 'The Config File',
      items: [
        {
          kind: 'cmd',
          name: 'export RIPGREP_CONFIG_PATH=$HOME/.ripgreprc',
          desc: 'Put this in your shell profile',
          children: [
            {
              kind: 'note',
              text: '  rg reads one config file, and only if this points at it. There is no default location.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --no-config PATTERN',
          desc: 'Ignore the config for one run',
        },
        { kind: 'gap' },
        {
          kind: 'cmd',
          name: 'A .ripgreprc worth starting from',
          desc: 'One shell argument per line',
          children: [
            {
              kind: 'flag',
              name: '--smart-case',
              desc: 'Case-sensitive only when you type a capital',
            },
            {
              kind: 'flag',
              name: '--hidden',
              desc: 'Stop hiding dotfiles from me',
            },
            {
              kind: 'flag',
              name: '--glob=!.git/*',
              desc: '…but still not .git',
            },
            {
              kind: 'flag',
              name: '--max-columns=200',
              desc: "Don't dump minified files at me",
            },
            {
              kind: 'flag',
              name: '--max-columns-preview',
              desc: 'Show the start of long lines anyway',
            },
            {
              kind: 'flag',
              name: '--type-add=web:*.{html,css,js}',
              desc: 'A type of your own',
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Whitespace is trimmed and # starts a comment. Its arguments go in front of yours, so anything you type on the command line wins.',
        },
        {
          kind: 'note',
          text: '-j 4 on one line is wrong, because a line is one argument. Write -j4, or -j and 4 on separate lines.',
        },
      ],
    },
    {
      title: 'Custom File Types',
      items: [
        {
          kind: 'cmd',
          name: "rg --type-add 'foo:*.foo' -t foo PATTERN",
          desc: 'Define a type and use it in the same run',
        },
        {
          kind: 'cmd',
          name: "rg --type-add 'src:include:ts,js,py' -t src PATTERN",
          desc: 'Build a type out of existing types',
          children: [
            {
              kind: 'note',
              text: "  Add globs to it as well by repeating the flag: --type-add 'src:*.vue'",
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg --type-clear py --type-add 'py:*.py' PATTERN",
          desc: "Replace a type's globs rather than adding to them",
        },
        {
          kind: 'cmd',
          name: "rg --type-list | rg '^py:'",
          desc: 'What does a type actually cover?',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: "Types don't persist — every invocation needs the flag, which is what the config file is for.",
        },
        {
          kind: 'note',
          text: 'Type names take letters and numbers only, no punctuation.',
        },
      ],
    },
    {
      title: 'Ignore Files',
      items: [
        {
          kind: 'cmd',
          name: '.ignore',
          desc: 'Hide things from rg and fd, but not from git',
          children: [
            {
              kind: 'note',
              text: '  The right place for generated files you keep in the repo but never want to search',
            },
          ],
        },
        {
          kind: 'cmd',
          name: '.rgignore',
          desc: 'rg only, and it outranks .ignore',
          children: [
            {
              kind: 'note',
              text: '  !foo here un-ignores a foo that .gitignore excluded',
            },
          ],
        },
        {
          kind: 'cmd',
          name: '~/.config/git/ignore',
          desc: 'Your global rules — rg honours these too',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'All of them are read from the current directory upwards, in that order of increasing authority.',
        },
      ],
    },
    {
      title: 'Setup',
      items: [
        {
          kind: 'cmd',
          name: 'rg --generate complete-zsh > ~/.zfunc/_rg',
          desc: 'Shell completions',
          children: [
            {
              kind: 'note',
              text: '  Also complete-bash, complete-fish, complete-powershell',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'rg --generate man > /usr/local/share/man/man1/rg.1',
          desc: 'Install the man page',
        },
        {
          kind: 'cmd',
          name: 'rg --version',
          desc: 'Version, CPU features, and whether PCRE2 is in',
        },
      ],
    },
  ],
};
