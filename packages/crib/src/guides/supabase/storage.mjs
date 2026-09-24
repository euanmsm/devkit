export const storage = {
  name: 'storage',
  description: 'Storage buckets and objects',
  sections: [
    {
      title: 'storage — Manage Storage objects',
      items: [
        { kind: 'note', text: 'Parent flags: --linked (default) / --local' },
        {
          kind: 'cmd',
          name: 'supabase storage ls [<path>]',
          desc: 'List objects',
          children: [
            {
              kind: 'flag',
              name: '-r, --recursive',
              desc: 'Recursive listing',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase storage cp <src> <dst>',
          desc: 'Copy objects',
          children: [
            { kind: 'flag', name: '-r, --recursive', desc: 'Recursive copy' },
            { kind: 'flag', name: '-j, --jobs <n>', desc: 'Parallel jobs' },
            {
              kind: 'flag',
              name: '--cache-control <header>',
              desc: 'Cache-Control header',
            },
            {
              kind: 'flag',
              name: '--content-type <type>',
              desc: 'Content-Type header',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase storage mv <src> <dst>',
          desc: 'Move objects',
          children: [
            { kind: 'flag', name: '-r, --recursive', desc: 'Recursive move' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase storage rm <file>...',
          desc: 'Remove objects',
          children: [
            { kind: 'flag', name: '-r, --recursive', desc: 'Recursive remove' },
          ],
        },
      ],
    },
  ],
};
