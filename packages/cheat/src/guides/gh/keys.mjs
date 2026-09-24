export const keys = {
  name: 'keys',
  description: 'SSH and GPG keys',
  sections: [
    {
      title: 'ssh-key / gpg-key — Manage keys',
      items: [
        {
          kind: 'cmd',
          name: 'gh ssh-key add <file>',
          desc: 'Add SSH key',
          children: [
            { kind: 'flag', name: '-t, --title <text>', desc: 'Key title' },
            {
              kind: 'flag',
              name: '--type <authentication|signing>',
              desc: 'Key type',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh ssh-key list',
          desc: 'List SSH keys',
        },
        {
          kind: 'cmd',
          name: 'gh ssh-key delete <id>',
          desc: 'Delete SSH key',
        },
        {
          kind: 'cmd',
          name: 'gh gpg-key add <file>',
          desc: 'Add GPG key',
        },
        {
          kind: 'cmd',
          name: 'gh gpg-key list',
          desc: 'List GPG keys',
        },
        {
          kind: 'cmd',
          name: 'gh gpg-key delete <id>',
          desc: 'Delete GPG key',
        },
      ],
    },
  ],
};
