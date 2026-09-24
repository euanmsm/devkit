export const auth = {
  name: 'auth',
  description: 'Log in, tokens, scopes, account switching',
  sections: [
    {
      title: 'auth — Authenticate gh and git with GitHub',
      items: [
        {
          kind: 'cmd',
          name: 'gh auth login',
          desc: 'Authenticate with a GitHub host',
          children: [
            {
              kind: 'flag',
              name: '-p, --git-protocol <ssh|https>',
              desc: 'Protocol for git operations',
            },
            {
              kind: 'flag',
              name: '-h, --hostname <host>',
              desc: 'GitHub instance hostname',
            },
            {
              kind: 'flag',
              name: '-s, --scopes <strings>',
              desc: 'Additional OAuth scopes',
            },
            {
              kind: 'flag',
              name: '-w, --web',
              desc: 'Open browser to authenticate',
            },
            {
              kind: 'flag',
              name: '--with-token',
              desc: 'Read token from stdin',
            },
            {
              kind: 'flag',
              name: '--skip-ssh-key',
              desc: 'Skip SSH key generate/upload',
            },
            {
              kind: 'flag',
              name: '--insecure-storage',
              desc: 'Save credentials in plain text',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth logout',
          desc: 'Remove authentication',
          children: [
            {
              kind: 'flag',
              name: '-h, --hostname <host>',
              desc: 'Hostname to log out of',
            },
            {
              kind: 'flag',
              name: '-u, --user <user>',
              desc: 'Account to log out of',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth refresh',
          desc: 'Fix or expand permission scopes',
          children: [
            {
              kind: 'flag',
              name: '-s, --scopes <strings>',
              desc: 'Scopes to add',
            },
            {
              kind: 'flag',
              name: '-r, --remove-scopes <strings>',
              desc: 'Scopes to remove',
            },
            {
              kind: 'flag',
              name: '--reset-scopes',
              desc: 'Reset to default minimum scopes',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth status',
          desc: 'Display auth state',
          children: [
            {
              kind: 'flag',
              name: '-t, --show-token',
              desc: 'Display auth token',
            },
            {
              kind: 'flag',
              name: '--json <fields>',
              desc: 'Output JSON (fields: hosts)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth switch',
          desc: 'Switch active GitHub account',
          children: [
            { kind: 'flag', name: '-h, --hostname <host>', desc: 'Hostname' },
            {
              kind: 'flag',
              name: '-u, --user <user>',
              desc: 'Account to switch to',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth token',
          desc: 'Print auth token',
          children: [
            { kind: 'flag', name: '-h, --hostname <host>', desc: 'Hostname' },
            { kind: 'flag', name: '-u, --user <user>', desc: 'Account' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh auth setup-git',
          desc: 'Configure git to use gh as credential helper',
          children: [
            {
              kind: 'flag',
              name: '-h, --hostname <host>',
              desc: 'Hostname to configure',
            },
          ],
        },
      ],
    },
  ],
};
