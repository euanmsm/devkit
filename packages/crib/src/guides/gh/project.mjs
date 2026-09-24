export const project = {
  name: 'project',
  description: 'GitHub Projects (v2)',
  sections: [
    {
      title: 'project — Manage GitHub Projects (v2)',
      items: [
        {
          kind: 'cmd',
          name: 'gh project create',
          desc: 'Create a project',
          children: [
            { kind: 'flag', name: '--title <text>', desc: 'Project title' },
            { kind: 'flag', name: '--owner <login>', desc: 'Owner login' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project list',
          desc: 'List projects',
          children: [
            { kind: 'flag', name: '--owner <login>', desc: 'Owner login' },
            { kind: 'flag', name: '--closed', desc: 'Include closed' },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max projects (default 30)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project view <number>',
          desc: 'View a project',
          children: [
            { kind: 'flag', name: '--owner <login>', desc: 'Owner login' },
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project edit <number>',
          desc: 'Edit a project',
          children: [
            {
              kind: 'flag',
              name: '--title / -d, --description',
              desc: 'Set title/description',
            },
            { kind: 'flag', name: '--readme <text>', desc: 'Set readme' },
            {
              kind: 'flag',
              name: '--visibility <PUBLIC|PRIVATE>',
              desc: 'Set visibility',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project close / delete <number>',
          desc: 'Close/delete a project',
        },
        {
          kind: 'cmd',
          name: 'gh project item-add <number>',
          desc: 'Add issue/PR to project',
          children: [
            { kind: 'flag', name: '--url <url>', desc: 'Issue or PR URL' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project item-create <number>',
          desc: 'Create draft issue',
          children: [
            { kind: 'flag', name: '--title <text>', desc: 'Title' },
            { kind: 'flag', name: '--body <text>', desc: 'Body' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project item-edit',
          desc: 'Edit item field values',
        },
        {
          kind: 'cmd',
          name: 'gh project item-delete <number>',
          desc: 'Remove item',
        },
        {
          kind: 'cmd',
          name: 'gh project item-list <number>',
          desc: 'List items',
          children: [
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max items (default 30)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh project item-archive <number>',
          desc: 'Archive/unarchive item',
        },
        {
          kind: 'cmd',
          name: 'gh project field-create <number>',
          desc: 'Create a field',
        },
        {
          kind: 'cmd',
          name: 'gh project field-list <number>',
          desc: 'List fields',
        },
        {
          kind: 'cmd',
          name: 'gh project field-delete',
          desc: 'Delete a field',
        },
        {
          kind: 'cmd',
          name: 'gh project link / unlink <number>',
          desc: 'Link/unlink repo or team',
        },
      ],
    },
  ],
};
