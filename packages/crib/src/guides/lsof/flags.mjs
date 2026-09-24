export const flags = {
  name: 'flags',
  description: 'Flag reference',
  sections: [
    {
      title: 'Flag Reference',
      items: [
        {
          kind: 'flag',
          name: '-i [proto][@host][:port]',
          desc: 'Filter by network address',
        },
        {
          kind: 'flag',
          name: '-t',
          desc: 'Terse: PIDs only, no header — for piping',
        },
        {
          kind: 'flag',
          name: '-P',
          desc: 'Port numbers instead of service names',
        },
        { kind: 'flag', name: '-n', desc: 'No DNS resolution (faster)' },
        {
          kind: 'flag',
          name: '-p <PID>',
          desc: 'Filter to specific process ID',
        },
        {
          kind: 'flag',
          name: '-sTCP:STATE',
          desc: 'Filter by TCP state (LISTEN, ESTABLISHED, CLOSED)',
        },
        { kind: 'flag', name: '-c <name>', desc: 'Filter by process name' },
        {
          kind: 'flag',
          name: '+D <dir>',
          desc: 'All open files under a directory (recursive)',
        },
      ],
    },
  ],
};
