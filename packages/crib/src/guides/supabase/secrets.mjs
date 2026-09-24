export const secrets = {
  name: 'secrets',
  description: 'Project secrets',
  sections: [
    {
      title: 'secrets — Manage project secrets',
      items: [
        {
          kind: 'cmd',
          name: 'supabase secrets list',
          desc: 'List all secrets',
        },
        {
          kind: 'cmd',
          name: 'supabase secrets set <NAME=VALUE>...',
          desc: 'Set secret(s)',
          children: [
            {
              kind: 'flag',
              name: '--env-file <path>',
              desc: 'Load from .env file',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase secrets unset <NAME>...',
          desc: 'Unset secret(s)',
        },
      ],
    },
  ],
};
