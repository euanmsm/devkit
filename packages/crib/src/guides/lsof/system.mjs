export const system = {
  name: 'system',
  description: 'System-wide open file overview',
  sections: [
    {
      title: 'System Overview',
      items: [
        {
          kind: 'cmd',
          name: 'lsof -i -P | grep LISTEN',
          desc: 'All listening ports on the machine',
          children: [
            {
              kind: 'flag',
              name: '-P',
              desc: 'Show port numbers (not service names)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -p 12345',
          desc: 'All files/sockets open by PID 12345',
          children: [
            {
              kind: 'note',
              text: 'Useful for debugging what a specific process is doing',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -i -P -n',
          desc: 'All network connections (fast, no DNS lookup)',
          children: [
            {
              kind: 'flag',
              name: '-n',
              desc: 'Skip DNS resolution — much faster',
            },
          ],
        },
      ],
    },
  ],
};
