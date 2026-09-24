export const codespace = {
  name: 'codespace',
  description: 'Create and connect to Codespaces',
  sections: [
    {
      title: 'codespace — Manage GitHub Codespaces',
      items: [
        {
          kind: 'cmd',
          name: 'gh codespace create',
          desc: 'Create a codespace',
          children: [
            { kind: 'flag', name: '-R, --repo <repo>', desc: 'Repository' },
            { kind: 'flag', name: '-b, --branch <branch>', desc: 'Branch' },
            {
              kind: 'flag',
              name: '-m, --machine <spec>',
              desc: 'Machine type',
            },
            { kind: 'flag', name: '-l, --location <region>', desc: 'Location' },
            {
              kind: 'flag',
              name: '-d, --display-name <name>',
              desc: 'Display name',
            },
            {
              kind: 'flag',
              name: '--idle-timeout <dur>',
              desc: 'Idle timeout',
            },
            {
              kind: 'flag',
              name: '--devcontainer-path <path>',
              desc: 'Devcontainer config',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace list',
          desc: 'List codespaces',
        },
        {
          kind: 'cmd',
          name: 'gh codespace view',
          desc: 'View codespace details',
        },
        {
          kind: 'cmd',
          name: 'gh codespace code',
          desc: 'Open in VS Code',
          children: [
            { kind: 'flag', name: '-w, --web', desc: 'Use web VS Code' },
            { kind: 'flag', name: '--insiders', desc: 'Use Insiders build' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace ssh',
          desc: 'SSH into codespace',
          children: [
            {
              kind: 'flag',
              name: '--config',
              desc: 'Write SSH config to stdout',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace cp <src> <dst>',
          desc: 'Copy files to/from',
          children: [
            { kind: 'flag', name: '-r, --recursive', desc: 'Recursive copy' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace stop',
          desc: 'Stop a codespace',
        },
        {
          kind: 'cmd',
          name: 'gh codespace delete',
          desc: 'Delete codespace(s)',
          children: [
            { kind: 'flag', name: '--all', desc: 'Delete all' },
            { kind: 'flag', name: '--days <n>', desc: 'Older than n days' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace edit',
          desc: 'Edit codespace settings',
        },
        {
          kind: 'cmd',
          name: 'gh codespace rebuild',
          desc: 'Rebuild codespace',
          children: [{ kind: 'flag', name: '--full', desc: 'Full rebuild' }],
        },
        {
          kind: 'cmd',
          name: 'gh codespace ports',
          desc: 'List forwarded ports',
        },
        {
          kind: 'cmd',
          name: 'gh codespace ports forward <r>:<l>',
          desc: 'Forward ports',
        },
        {
          kind: 'cmd',
          name: 'gh codespace ports visibility <p>:<v>',
          desc: 'Set port visibility',
        },
        {
          kind: 'cmd',
          name: 'gh codespace logs',
          desc: 'View codespace logs',
          children: [
            { kind: 'flag', name: '-f, --follow', desc: 'Follow logs' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh codespace jupyter',
          desc: 'Open Jupyter',
        },
      ],
    },
  ],
};
