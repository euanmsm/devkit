export const plugins = {
  name: 'plugins',
  description: 'Manage extensions',
  sections: [
    {
      title: 'Plugins — Manage Extensions',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw plugins list',
          desc: 'Discover installed plugins',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins inspect <id>',
          desc: 'Show plugin details (alias: info)',
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins install <spec>',
          desc: 'Install plugin (path | .tgz | npm-spec | plugin@marketplace)',
          children: [
            {
              kind: 'flag',
              name: '--force',
              desc: 'Overwrite existing install target',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins enable <id>',
          desc: 'Enable a plugin',
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins disable <id>',
          desc: 'Disable a plugin',
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins update <id>',
          desc: 'Update installed plugin',
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins doctor',
          desc: 'Report plugin load errors',
        },
        {
          kind: 'cmd',
          name: 'openclaw plugins marketplace list <marketplace>',
          desc: 'List marketplace entries before install',
        },
      ],
    },
  ],
};
