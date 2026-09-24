export const cron = {
  name: 'cron',
  description: 'Scheduled jobs',
  sections: [
    {
      title: 'Cron — Scheduled Jobs',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw cron list',
          desc: 'List all cron jobs',
          children: [
            { kind: 'flag', name: '--all', desc: 'Include inactive jobs' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw cron status',
          desc: 'Show cron scheduler status',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw cron add',
          desc: 'Add a new cron job (alias: create)',
          children: [
            {
              kind: 'flag',
              name: '--name <name>',
              desc: 'Job name (required)',
            },
            {
              kind: 'flag',
              name: '--at <schedule>',
              desc: 'One-time schedule',
            },
            {
              kind: 'flag',
              name: '--every <interval>',
              desc: 'Recurring interval (milliseconds)',
            },
            {
              kind: 'flag',
              name: '--cron <expression>',
              desc: "Cron expression (e.g. '0 9 * * 1')",
            },
            {
              kind: 'flag',
              name: '--system-event',
              desc: 'System event trigger',
            },
            {
              kind: 'flag',
              name: '--message <text>',
              desc: 'Message payload',
            },
            {
              kind: 'flag',
              name: '--model <id>',
              desc: 'Allowed model for job',
            },
            {
              kind: 'flag',
              name: '--announce',
              desc: 'Send output to specified destination',
            },
            {
              kind: 'flag',
              name: '--no-deliver',
              desc: 'Suppress output delivery',
            },
            {
              kind: 'flag',
              name: '--keep-after-run',
              desc: 'Retain one-shot job after execution',
            },
            {
              kind: 'flag',
              name: '--url, --token, --timeout, --expect-final',
              desc: 'RPC options',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw cron edit <id>',
          desc: 'Edit a cron job (patch fields)',
        },
        {
          kind: 'cmd',
          name: 'openclaw cron rm <id>',
          desc: 'Remove a cron job (aliases: remove, delete)',
        },
        {
          kind: 'cmd',
          name: 'openclaw cron enable <id>',
          desc: 'Enable a cron job',
        },
        {
          kind: 'cmd',
          name: 'openclaw cron disable <id>',
          desc: 'Disable a cron job',
        },
        {
          kind: 'cmd',
          name: 'openclaw cron run <id>',
          desc: 'Run a cron job now (debug)',
          children: [{ kind: 'flag', name: '--due', desc: 'Run only if due' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw cron runs --id <id>',
          desc: 'Show cron run history',
          children: [
            {
              kind: 'flag',
              name: '--limit <n>',
              desc: 'Maximum runs to show',
            },
          ],
        },
      ],
    },
  ],
};
