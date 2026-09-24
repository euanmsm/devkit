export const tasks = {
  name: 'tasks',
  description: 'Durable background tasks & flows',
  sections: [
    {
      title: 'Tasks — Durable Background Tasks',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw tasks list',
          desc: 'Show active and recent task runs',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks show <id>',
          desc: 'Show specific task run details',
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks notify <id>',
          desc: 'Change task notification policy',
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks cancel <id>',
          desc: 'Cancel running task',
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks audit',
          desc: 'Surface operational task issues',
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks maintenance',
          desc: 'Preview or apply task cleanup',
          children: [
            { kind: 'flag', name: '--apply', desc: 'Apply cleanup' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks flow list',
          desc: 'List active and recent Task Flow flows',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks flow show <lookup>',
          desc: 'Inspect flow by id or lookup key',
        },
        {
          kind: 'cmd',
          name: 'openclaw tasks flow cancel <lookup>',
          desc: 'Cancel running flow + active tasks',
        },
      ],
    },
  ],
};
