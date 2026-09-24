export const branches = {
  name: 'branches',
  description: 'Preview branches',
  sections: [
    {
      title: 'branches — Preview branches',
      items: [
        { kind: 'note', text: 'Parent flag: --project-ref <ref>' },
        {
          kind: 'cmd',
          name: 'supabase branches create [<name>]',
          desc: 'Create preview branch',
          children: [
            { kind: 'flag', name: '--region <region>', desc: 'Deploy region' },
            { kind: 'flag', name: '--size <size>', desc: 'Instance size' },
            { kind: 'flag', name: '--persistent', desc: 'Persistent branch' },
            {
              kind: 'flag',
              name: '--with-data',
              desc: 'Clone production data',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase branches list',
          desc: 'List branches',
        },
        {
          kind: 'cmd',
          name: 'supabase branches get [<name>]',
          desc: 'Get branch details',
        },
        {
          kind: 'cmd',
          name: 'supabase branches delete [<name>]',
          desc: 'Delete branch',
        },
        {
          kind: 'cmd',
          name: 'supabase branches pause / unpause [<name>]',
          desc: 'Pause/unpause',
        },
        {
          kind: 'cmd',
          name: 'supabase branches update [<name>]',
          desc: 'Update branch',
          children: [
            { kind: 'flag', name: '--name <new-name>', desc: 'Rename' },
            {
              kind: 'flag',
              name: '--git-branch <branch>',
              desc: 'Change git association',
            },
            { kind: 'flag', name: '--persistent', desc: 'Toggle persistence' },
          ],
        },
      ],
    },
  ],
};
