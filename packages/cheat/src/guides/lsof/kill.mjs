export const kill = {
  name: 'kill',
  description: 'Kill processes on a port',
  sections: [
    {
      title: 'Kill Processes on a Port',
      items: [
        {
          kind: 'cmd',
          name: 'lsof -ti :3000 | xargs kill',
          desc: 'Graceful kill (SIGTERM)',
          children: [
            {
              kind: 'note',
              text: '-t gives bare PIDs which pipe cleanly into kill',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'lsof -ti :3000 | xargs kill -9',
          desc: 'Force kill (SIGKILL)',
          children: [
            {
              kind: 'note',
              text: 'Use for zombie processes that survive SIGTERM',
            },
          ],
        },
      ],
    },
  ],
};
