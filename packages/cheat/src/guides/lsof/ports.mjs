export const ports = {
  name: 'ports',
  description: 'Find what is using a port',
  sections: [
    {
      title: 'Port Diagnostics',
      items: [
        {
          kind: 'cmd',
          name: 'lsof -i :3000',
          desc: 'Show all processes using port 3000',
          children: [
            {
              kind: 'note',
              text: 'Shows PID, process name, user, socket state (LISTEN/CLOSED/etc)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -ti :3000',
          desc: 'PIDs only (terse) — pipe into kill',
          children: [
            {
              kind: 'flag',
              name: '-t',
              desc: 'Terse output: only PIDs, no headers',
            },
            {
              kind: 'flag',
              name: '-i :PORT',
              desc: 'Filter to network connections on PORT',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -i :3000 -sTCP:LISTEN',
          desc: 'Only actively LISTENING processes',
          children: [
            {
              kind: 'note',
              text: 'Filters out stale CLOSED sockets — use this to check if a port is free',
            },
            {
              kind: 'flag',
              name: '-sTCP:LISTEN',
              desc: 'Filter by TCP socket state',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -i :3000,:3001,:5432',
          desc: 'Check multiple ports at once',
        },
      ],
    },
  ],
};
