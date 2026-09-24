export const system = {
  name: 'system',
  description: 'Events, heartbeat & presence',
  sections: [
    {
      title: 'System — Events, Heartbeat & Presence',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw system event',
          desc: 'Enqueue system event + trigger heartbeat',
          children: [
            {
              kind: 'flag',
              name: '--text <text>',
              desc: 'Event text (required)',
            },
            {
              kind: 'flag',
              name: '--mode <mode>',
              desc: 'now | next-heartbeat',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw system heartbeat last',
          desc: 'Show last heartbeat',
        },
        {
          kind: 'cmd',
          name: 'openclaw system heartbeat enable|disable',
          desc: 'Toggle heartbeat',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw system presence',
          desc: 'List system presence entries',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
      ],
    },
  ],
};
