export const env = {
  name: 'env',
  description: 'Environment variables gh reads',
  sections: [
    {
      title: 'Environment variables',
      items: [
        {
          kind: 'cmd',
          name: 'GH_TOKEN / GITHUB_TOKEN',
          desc: 'Auth token',
        },
        {
          kind: 'cmd',
          name: 'GH_HOST',
          desc: 'Default GitHub hostname',
        },
        {
          kind: 'cmd',
          name: 'GH_REPO',
          desc: 'Default repo (OWNER/REPO)',
        },
        {
          kind: 'cmd',
          name: 'GH_EDITOR',
          desc: 'Text editor',
        },
        {
          kind: 'cmd',
          name: 'GH_PAGER',
          desc: 'Pager for output',
        },
        {
          kind: 'cmd',
          name: 'GH_BROWSER / BROWSER',
          desc: 'Web browser',
        },
        {
          kind: 'cmd',
          name: 'GH_DEBUG',
          desc: 'Enable debug logging',
        },
        {
          kind: 'cmd',
          name: 'GH_NO_UPDATE_NOTIFIER',
          desc: 'Disable update notifications',
        },
        {
          kind: 'cmd',
          name: 'GH_PROMPT_DISABLED',
          desc: 'Disable interactive prompts',
        },
        {
          kind: 'cmd',
          name: 'NO_COLOR',
          desc: 'Disable color output',
        },
      ],
    },
  ],
};
