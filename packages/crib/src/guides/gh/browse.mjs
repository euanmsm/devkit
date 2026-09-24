export const browse = {
  name: 'browse',
  description: 'Open repos, files and PRs in the browser',
  sections: [
    {
      title: 'browse — Open repository in browser',
      items: [
        {
          kind: 'cmd',
          name: 'gh browse [<number>|<path>|<sha>]',
          desc: 'Open issue/PR/file/commit',
          children: [
            {
              kind: 'flag',
              name: '-b, --branch <branch>',
              desc: 'Select branch',
            },
            {
              kind: 'flag',
              name: '-c, --commit [sha]',
              desc: 'Select commit (default: last)',
            },
            {
              kind: 'flag',
              name: '-n, --no-browser',
              desc: 'Print URL instead',
            },
            { kind: 'flag', name: '-a, --actions', desc: 'Open actions tab' },
            { kind: 'flag', name: '-p, --projects', desc: 'Open projects tab' },
            { kind: 'flag', name: '-r, --releases', desc: 'Open releases tab' },
            { kind: 'flag', name: '-s, --settings', desc: 'Open settings tab' },
            { kind: 'flag', name: '-w, --wiki', desc: 'Open wiki tab' },
            {
              kind: 'flag',
              name: '--blame',
              desc: 'Open blame view for a file',
            },
          ],
        },
      ],
    },
  ],
};
