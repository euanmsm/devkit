export const misc = {
  name: 'misc',
  description: 'SSO, backups, snippets',
  sections: [
    {
      title: 'Other commands',
      items: [
        {
          kind: 'cmd',
          name: 'supabase sso info / list / show / add / update / remove',
          desc: 'Manage SSO providers',
        },
        {
          kind: 'cmd',
          name: 'supabase backups list',
          desc: 'List physical backups',
        },
        {
          kind: 'cmd',
          name: 'supabase backups restore',
          desc: 'Restore from PITR',
          children: [
            {
              kind: 'flag',
              name: '-t, --timestamp <secs>',
              desc: 'Recovery timestamp (epoch)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase snippets list / download',
          desc: 'Manage SQL snippets',
        },
        {
          kind: 'cmd',
          name: 'supabase encryption get-root-key / update-root-key',
          desc: 'Encryption keys',
        },
        {
          kind: 'cmd',
          name: 'supabase seed buckets',
          desc: 'Seed storage buckets from config',
        },
        {
          kind: 'cmd',
          name: 'supabase completion <bash|zsh|fish|powershell>',
          desc: 'Shell completions',
        },
      ],
    },
  ],
};
