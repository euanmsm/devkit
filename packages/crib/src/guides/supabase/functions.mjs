export const functions = {
  name: 'functions',
  description: 'Edge Functions — serve, deploy, logs',
  sections: [
    {
      title: 'functions — Edge Functions',
      items: [
        {
          kind: 'cmd',
          name: 'supabase functions new <name>',
          desc: 'Create function locally',
        },
        {
          kind: 'cmd',
          name: 'supabase functions deploy [<name>]',
          desc: 'Deploy to linked project',
          children: [
            {
              kind: 'flag',
              name: '--import-map <path>',
              desc: 'Import map file',
            },
            {
              kind: 'flag',
              name: '--no-verify-jwt',
              desc: 'Disable JWT verification',
            },
            { kind: 'flag', name: '--project-ref <ref>', desc: 'Project ref' },
            {
              kind: 'flag',
              name: '-j, --jobs <n>',
              desc: 'Parallel deploys (default 1)',
            },
            {
              kind: 'flag',
              name: '--prune',
              desc: 'Delete unmatched remote functions',
            },
            { kind: 'flag', name: '--use-api', desc: 'Bundle server-side' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase functions serve',
          desc: 'Serve locally',
          children: [
            { kind: 'flag', name: '--env-file <path>', desc: 'Env file path' },
            {
              kind: 'flag',
              name: '--import-map <path>',
              desc: 'Import map file',
            },
            {
              kind: 'flag',
              name: '--no-verify-jwt',
              desc: 'Disable JWT verification',
            },
            {
              kind: 'flag',
              name: '--inspect-mode <run|brk|wait>',
              desc: 'Debugger mode',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase functions list',
          desc: 'List deployed functions',
        },
        {
          kind: 'cmd',
          name: 'supabase functions delete <name>',
          desc: 'Delete from project',
        },
        {
          kind: 'cmd',
          name: 'supabase functions download [<name>]',
          desc: 'Download source code',
          children: [
            { kind: 'flag', name: '--use-api', desc: 'Unbundle server-side' },
          ],
        },
      ],
    },
  ],
};
