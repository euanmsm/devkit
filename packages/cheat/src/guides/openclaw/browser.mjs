export const browser = {
  name: 'browser',
  description: 'Headless browser automation',
  sections: [
    {
      title: 'Browser — Headless Browser Automation',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw browser status',
          desc: 'Show browser status',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser start / stop',
          desc: 'Start or stop browser',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser reset-profile',
          desc: 'Reset browser profile',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser tabs',
          desc: 'List open tabs',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser open <url>',
          desc: 'Open URL in browser',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser focus <targetId>',
          desc: 'Focus a browser tab',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser close [targetId]',
          desc: 'Close a browser tab',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser profiles',
          desc: 'List browser profiles',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser create-profile',
          desc: 'Create new browser profile',
          children: [
            { kind: 'flag', name: '--name <name>', desc: 'Profile name' },
            { kind: 'flag', name: '--color <hex>', desc: 'Profile color' },
            { kind: 'flag', name: '--cdp-url <url>', desc: 'CDP URL' },
            {
              kind: 'flag',
              name: '--driver <existing-session>',
              desc: 'Driver mode',
            },
            {
              kind: 'flag',
              name: '--user-data-dir <path>',
              desc: 'User data directory',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser delete-profile --name <name>',
          desc: 'Delete browser profile',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser screenshot [targetId]',
          desc: 'Capture screenshot',
          children: [
            { kind: 'flag', name: '--full-page', desc: 'Capture full page' },
            { kind: 'flag', name: '--ref <ref>', desc: 'Element reference' },
            {
              kind: 'flag',
              name: '--element <selector>',
              desc: 'CSS selector',
            },
            { kind: 'flag', name: '--type <png|jpeg>', desc: 'Image type' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser snapshot',
          desc: 'Get accessibility snapshot',
          children: [
            {
              kind: 'flag',
              name: '--format <aria|ai>',
              desc: 'Snapshot format',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
            { kind: 'flag', name: '--limit <n>', desc: 'Result limit' },
            { kind: 'flag', name: '--interactive', desc: 'Interactive mode' },
            { kind: 'flag', name: '--compact', desc: 'Compact output' },
            { kind: 'flag', name: '--depth <n>', desc: 'Tree depth' },
            { kind: 'flag', name: '--selector <sel>', desc: 'CSS selector' },
            { kind: 'flag', name: '--out <path>', desc: 'Output file' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser navigate <url>',
          desc: 'Navigate to URL',
          children: [
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser resize <width> <height>',
          desc: 'Resize browser window',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser click <ref>',
          desc: 'Click element',
          children: [
            { kind: 'flag', name: '--double', desc: 'Double-click' },
            {
              kind: 'flag',
              name: '--button <left|right|middle>',
              desc: 'Mouse button',
            },
            {
              kind: 'flag',
              name: '--modifiers <csv>',
              desc: 'Keyboard modifiers',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser type <ref> <text>',
          desc: 'Type text into element',
          children: [
            {
              kind: 'flag',
              name: '--submit',
              desc: 'Submit form after typing',
            },
            { kind: 'flag', name: '--slowly', desc: 'Slow typing animation' },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser press <key>',
          desc: 'Press keyboard key',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser hover <ref>',
          desc: 'Hover over element',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser drag <startRef> <endRef>',
          desc: 'Drag element',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser select <ref> <values...>',
          desc: 'Select dropdown option(s)',
        },
        {
          kind: 'cmd',
          name: 'openclaw browser upload <paths...>',
          desc: 'Upload files',
          children: [
            { kind: 'flag', name: '--ref <ref>', desc: 'Element reference' },
            {
              kind: 'flag',
              name: '--input-ref <ref>',
              desc: 'Input element reference',
            },
            {
              kind: 'flag',
              name: '--element <selector>',
              desc: 'CSS selector',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
            {
              kind: 'flag',
              name: '--timeout-ms <ms>',
              desc: 'Upload timeout',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser fill',
          desc: 'Fill form fields',
          children: [
            {
              kind: 'flag',
              name: '--fields <json>',
              desc: 'Field data JSON',
            },
            {
              kind: 'flag',
              name: '--fields-file <path>',
              desc: 'Field data file',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser dialog',
          desc: 'Handle browser dialogs',
          children: [
            {
              kind: 'flag',
              name: '--accept / --dismiss',
              desc: 'Accept or dismiss dialog',
            },
            {
              kind: 'flag',
              name: '--prompt <text>',
              desc: 'Prompt response',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
            {
              kind: 'flag',
              name: '--timeout-ms <ms>',
              desc: 'Dialog timeout',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser wait',
          desc: 'Wait for page state',
          children: [
            { kind: 'flag', name: '--time <ms>', desc: 'Wait duration' },
            {
              kind: 'flag',
              name: '--text <value>',
              desc: 'Wait for text to appear',
            },
            {
              kind: 'flag',
              name: '--text-gone <value>',
              desc: 'Wait for text to disappear',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser evaluate --fn <code>',
          desc: 'Execute JavaScript',
          children: [
            { kind: 'flag', name: '--ref <ref>', desc: 'Element reference' },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser console',
          desc: 'Read browser console output',
          children: [
            {
              kind: 'flag',
              name: '--level <error|warn|info>',
              desc: 'Filter level',
            },
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw browser pdf',
          desc: 'Generate PDF from page',
          children: [
            { kind: 'flag', name: '--target-id <id>', desc: 'Target tab' },
          ],
        },
      ],
    },
  ],
};
