export const auth = {
  name: 'auth',
  description: 'Log in, tokens, machine identities',
  sections: [
    {
      title: 'Authentication',
      items: [
        {
          kind: 'cmd',
          name: 'infisical login',
          desc: 'Authenticate with Infisical',
          children: [
            {
              kind: 'flag',
              name: '--method <method>',
              desc: 'user, universal-auth, kubernetes, azure, gcp-*, aws-iam, oidc-auth',
            },
            {
              kind: 'flag',
              name: '--email <email>',
              desc: 'Email (user method)',
            },
            {
              kind: 'flag',
              name: '--password <pw>',
              desc: 'Password (user method)',
            },
            { kind: 'flag', name: '-i, --interactive', desc: 'CLI login mode' },
            {
              kind: 'flag',
              name: '--client-id <id>',
              desc: 'Client ID (universal auth)',
            },
            {
              kind: 'flag',
              name: '--client-secret <secret>',
              desc: 'Client secret (universal auth)',
            },
            {
              kind: 'flag',
              name: '--machine-identity-id <id>',
              desc: 'Machine identity ID',
            },
            {
              kind: 'flag',
              name: '--organization-id <id>',
              desc: 'Org ID (user method)',
            },
            {
              kind: 'flag',
              name: '--jwt <token>',
              desc: 'JWT (oidc/jwt auth)',
            },
            { kind: 'flag', name: '--plain', desc: 'Output token only' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical logout',
          desc: 'Log out',
        },
        {
          kind: 'cmd',
          name: 'infisical init',
          desc: 'Link local project (creates .infisical.json)',
        },
        {
          kind: 'cmd',
          name: 'infisical user get',
          desc: 'Current profile info',
        },
        {
          kind: 'cmd',
          name: 'infisical user get token',
          desc: 'Get access token',
          children: [
            {
              kind: 'flag',
              name: '--plain',
              desc: 'Token only, no formatting',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical user switch',
          desc: 'Switch between profiles',
        },
        {
          kind: 'cmd',
          name: 'infisical user update domain',
          desc: 'Update profile domain',
        },
        {
          kind: 'cmd',
          name: 'infisical reset',
          desc: 'Delete all local Infisical data',
        },
      ],
    },
  ],
};
