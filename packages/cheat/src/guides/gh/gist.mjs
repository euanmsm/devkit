export const gist = {
  name: 'gist',
  description: 'Create and manage gists',
  sections: [
    {
      title: 'gist — Manage gists',
      items: [
        {
          kind: 'cmd',
          name: 'gh gist create [<files>...]',
          desc: 'Create a gist',
          children: [
            { kind: 'flag', name: '-d, --desc <text>', desc: 'Description' },
            {
              kind: 'flag',
              name: '-f, --filename <name>',
              desc: 'Filename for stdin',
            },
            { kind: 'flag', name: '-p, --public', desc: 'Public gist' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh gist list',
          desc: 'List your gists',
          children: [
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max gists (default 10)',
            },
            {
              kind: 'flag',
              name: '--public / --secret',
              desc: 'Filter visibility',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh gist view <id|url>',
          desc: 'View a gist',
          children: [
            {
              kind: 'flag',
              name: '-f, --filename <name>',
              desc: 'View specific file',
            },
            { kind: 'flag', name: '-r, --raw', desc: 'Print raw content' },
            { kind: 'flag', name: '--files', desc: 'List file names' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh gist edit <id|url>',
          desc: 'Edit a gist',
          children: [
            { kind: 'flag', name: '-a, --add <file>', desc: 'Add a file' },
            {
              kind: 'flag',
              name: '-f, --filename <name>',
              desc: 'File to edit',
            },
            {
              kind: 'flag',
              name: '-r, --remove <file>',
              desc: 'Remove a file',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh gist clone <id|url> [<dir>]',
          desc: 'Clone a gist',
        },
        {
          kind: 'cmd',
          name: 'gh gist delete <id|url>',
          desc: 'Delete a gist',
        },
      ],
    },
  ],
};
