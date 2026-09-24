export const start = {
  name: 'start',
  description: 'init, login, link, local stack',
  sections: [
    {
      title: 'Quick Start',
      items: [
        {
          kind: 'cmd',
          name: 'supabase init',
          desc: 'Initialize local project',
          children: [
            {
              kind: 'flag',
              name: '--force',
              desc: 'Overwrite existing config.toml',
            },
            {
              kind: 'flag',
              name: '-i, --interactive',
              desc: 'Interactive IDE config',
            },
            {
              kind: 'flag',
              name: '--use-orioledb',
              desc: 'Use OrioleDB engine',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase login',
          desc: 'Authenticate with access token',
          children: [
            {
              kind: 'flag',
              name: '--token <token>',
              desc: 'Provide token directly',
            },
            { kind: 'flag', name: '--no-browser', desc: "Don't open browser" },
            {
              kind: 'flag',
              name: '--name <name>',
              desc: 'Store token under name',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase logout',
          desc: 'Log out and delete tokens',
        },
        {
          kind: 'cmd',
          name: 'supabase link',
          desc: 'Link to remote project',
          children: [
            { kind: 'flag', name: '--project-ref <ref>', desc: 'Project ref' },
            {
              kind: 'flag',
              name: '-p, --password <pw>',
              desc: 'Remote DB password',
            },
            {
              kind: 'flag',
              name: '--skip-pooler',
              desc: 'Use direct connection',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase unlink',
          desc: 'Unlink project',
        },
        {
          kind: 'cmd',
          name: 'supabase start',
          desc: 'Start local containers',
          children: [
            {
              kind: 'flag',
              name: '-x, --exclude <names>',
              desc: 'Skip containers (gotrue, realtime, ...)',
            },
            {
              kind: 'flag',
              name: '--ignore-health-check',
              desc: 'Ignore unhealthy services',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase stop',
          desc: 'Stop local containers',
          children: [
            { kind: 'flag', name: '--all', desc: 'Stop all instances' },
            {
              kind: 'flag',
              name: '--no-backup',
              desc: 'Delete all data volumes',
            },
            {
              kind: 'flag',
              name: '--project-id <id>',
              desc: 'Stop specific project',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase status',
          desc: 'Show container status',
          children: [
            {
              kind: 'flag',
              name: '--override-name <strings>',
              desc: 'Override variable names',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase services',
          desc: 'Show service versions',
        },
        {
          kind: 'cmd',
          name: 'supabase bootstrap [<template>]',
          desc: 'Bootstrap from template',
        },
      ],
    },
  ],
};
