export const nodes = {
  name: 'nodes',
  description: 'Remote headless node hosts',
  sections: [
    {
      title: 'Nodes — Remote Headless Node Hosts',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw node run',
          desc: 'Run headless node host',
          children: [
            {
              kind: 'flag',
              name: '--host <gateway-host>',
              desc: 'Gateway host',
            },
            {
              kind: 'flag',
              name: '--port <port>',
              desc: 'Node port (default: 18789)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw node status|install|uninstall|stop|restart',
          desc: 'Node service management',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes status',
          desc: 'Show node connection status',
          children: [
            {
              kind: 'flag',
              name: '--connected',
              desc: 'Filter connected nodes only',
            },
            {
              kind: 'flag',
              name: '--last-connected <duration>',
              desc: 'Filter by last connection time',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes list',
          desc: 'List all paired nodes',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes pending',
          desc: 'List pending pairing requests',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes approve <requestId>',
          desc: 'Approve pairing request',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes reject <requestId>',
          desc: 'Reject pairing request',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes describe --node <id|name|ip>',
          desc: 'Get detailed node info',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes rename --node <id> --name <name>',
          desc: 'Rename a node',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes invoke --node <id> --command <cmd>',
          desc: 'Invoke node command',
          children: [
            {
              kind: 'flag',
              name: '--params <json>',
              desc: 'Command parameters',
            },
            {
              kind: 'flag',
              name: '--invoke-timeout <ms>',
              desc: 'Invocation timeout',
            },
            {
              kind: 'flag',
              name: '--idempotency-key <key>',
              desc: 'Idempotency key',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes notify --node <id>',
          desc: 'Send notification to node (macOS)',
          children: [
            {
              kind: 'flag',
              name: '--title <text>',
              desc: 'Notification title',
            },
            {
              kind: 'flag',
              name: '--body <text>',
              desc: 'Notification body',
            },
            { kind: 'flag', name: '--sound <name>', desc: 'Sound name' },
            {
              kind: 'flag',
              name: '--priority <level>',
              desc: 'passive | active | timeSensitive',
            },
            {
              kind: 'flag',
              name: '--delivery <method>',
              desc: 'system | overlay | auto',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes camera list',
          desc: 'List node cameras',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes camera snap',
          desc: 'Capture photo from node camera',
          children: [
            {
              kind: 'flag',
              name: '--facing <front|back|both>',
              desc: 'Camera facing',
            },
            {
              kind: 'flag',
              name: '--device-id <id>',
              desc: 'Specific camera device',
            },
            { kind: 'flag', name: '--max-width <px>', desc: 'Maximum width' },
            {
              kind: 'flag',
              name: '--quality <0-1>',
              desc: 'Quality setting',
            },
            { kind: 'flag', name: '--delay-ms <ms>', desc: 'Capture delay' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes camera clip',
          desc: 'Record video from node camera',
          children: [
            {
              kind: 'flag',
              name: '--facing <front|back>',
              desc: 'Camera facing',
            },
            {
              kind: 'flag',
              name: '--duration <ms|10s|1m>',
              desc: 'Recording duration',
            },
            { kind: 'flag', name: '--no-audio', desc: 'Disable audio' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas snapshot',
          desc: 'Capture node screen',
          children: [
            {
              kind: 'flag',
              name: '--format <png|jpg>',
              desc: 'Image format',
            },
            { kind: 'flag', name: '--max-width <px>', desc: 'Maximum width' },
            {
              kind: 'flag',
              name: '--quality <0-1>',
              desc: 'Quality setting',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas present --node <id>',
          desc: 'Display content on node screen',
          children: [
            {
              kind: 'flag',
              name: '--target <urlOrPath>',
              desc: 'URL or file path',
            },
            {
              kind: 'flag',
              name: '--x, --y, --width, --height <px>',
              desc: 'Position and size',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas hide',
          desc: 'Hide canvas display',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas navigate <url>',
          desc: 'Navigate node browser',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas eval --js <code>',
          desc: 'Execute JavaScript on node',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas a2ui push',
          desc: 'Push a2ui layout to node',
          children: [
            { kind: 'flag', name: '--jsonl <path>', desc: 'JSONL file path' },
            { kind: 'flag', name: '--text <text>', desc: 'Text layout' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes canvas a2ui reset',
          desc: 'Reset a2ui layout',
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes screen record',
          desc: 'Record node screen',
          children: [
            { kind: 'flag', name: '--screen <index>', desc: 'Screen index' },
            { kind: 'flag', name: '--duration <ms|10s>', desc: 'Duration' },
            { kind: 'flag', name: '--fps <n>', desc: 'Frames per second' },
            { kind: 'flag', name: '--no-audio', desc: 'Disable audio' },
            { kind: 'flag', name: '--out <path>', desc: 'Output file path' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw nodes location get',
          desc: 'Get node location',
          children: [
            {
              kind: 'flag',
              name: '--max-age <ms>',
              desc: 'Maximum location age',
            },
            {
              kind: 'flag',
              name: '--accuracy <level>',
              desc: 'coarse | balanced | precise',
            },
            {
              kind: 'flag',
              name: '--location-timeout <ms>',
              desc: 'Location timeout',
            },
          ],
        },
      ],
    },
  ],
};
