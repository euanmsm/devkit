export const config = {
  name: 'config',
  description: 'Settings, aliases and extensions',
  sections: [
    {
      title: 'config — Manage gh configuration',
      items: [
        {
          kind: 'cmd',
          name: 'gh config get <key>',
          desc: 'Get a config value',
        },
        {
          kind: 'cmd',
          name: 'gh config set <key> <value>',
          desc: 'Set a config value',
        },
        {
          kind: 'cmd',
          name: 'gh config list',
          desc: 'List all config values',
          children: [
            {
              kind: 'flag',
              name: '-h, --host <host>',
              desc: 'Per-host setting',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh config clear-cache',
          desc: 'Clear API cache',
          children: [
            { kind: 'gap' },
            {
              kind: 'note',
              text: 'Keys: git_protocol, editor, prompt, pager, browser, http_unix_socket',
            },
          ],
        },
      ],
    },
    {
      title: 'alias — Manage command aliases',
      items: [
        {
          kind: 'cmd',
          name: 'gh alias set <name> <expansion>',
          desc: 'Create alias',
          children: [
            {
              kind: 'flag',
              name: '-s, --shell',
              desc: 'Pass through shell interpreter',
            },
            { kind: 'flag', name: '--clobber', desc: 'Overwrite existing' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh alias delete <name>',
          desc: 'Delete alias',
          children: [
            { kind: 'flag', name: '--all', desc: 'Delete all aliases' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh alias list',
          desc: 'List aliases',
        },
        {
          kind: 'cmd',
          name: 'gh alias import <file>',
          desc: 'Import aliases',
        },
      ],
    },
    {
      title: 'extension — Manage gh extensions',
      items: [
        {
          kind: 'cmd',
          name: 'gh extension install <repo>',
          desc: 'Install an extension',
          children: [
            { kind: 'flag', name: '--pin <tag|sha>', desc: 'Pin to version' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh extension upgrade [<name>]',
          desc: 'Upgrade extensions',
          children: [
            { kind: 'flag', name: '--all', desc: 'Upgrade all' },
            { kind: 'flag', name: '--dry-run', desc: 'Show what would change' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh extension remove <name>',
          desc: 'Remove extension',
        },
        {
          kind: 'cmd',
          name: 'gh extension list',
          desc: 'List installed',
        },
        {
          kind: 'cmd',
          name: 'gh extension search <query>',
          desc: 'Search extensions',
        },
        {
          kind: 'cmd',
          name: 'gh extension create [<name>]',
          desc: 'Scaffold extension',
        },
        {
          kind: 'cmd',
          name: 'gh extension browse',
          desc: 'Browse extensions',
        },
      ],
    },
  ],
};
