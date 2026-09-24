export const projects = {
  name: 'projects',
  description: 'Organisations and projects',
  sections: [
    {
      title: 'orgs / projects — Manage organizations and projects',
      items: [
        {
          kind: 'cmd',
          name: 'supabase orgs list',
          desc: 'List organizations',
        },
        {
          kind: 'cmd',
          name: 'supabase orgs create',
          desc: 'Create organization',
        },
        {
          kind: 'cmd',
          name: 'supabase projects list',
          desc: 'List projects',
        },
        {
          kind: 'cmd',
          name: 'supabase projects create [<name>]',
          desc: 'Create project',
          children: [
            { kind: 'flag', name: '--org-id <id>', desc: 'Organization' },
            {
              kind: 'flag',
              name: '--db-password <pw>',
              desc: 'Database password',
            },
            { kind: 'flag', name: '--region <region>', desc: 'Region' },
            { kind: 'flag', name: '--size <size>', desc: 'Instance size' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase projects delete [<ref>]',
          desc: 'Delete project',
        },
        {
          kind: 'cmd',
          name: 'supabase projects api-keys',
          desc: 'List API keys',
        },
      ],
    },
  ],
};
