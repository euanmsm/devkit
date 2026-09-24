export const misc = {
  name: 'misc',
  description: 'status, label, ruleset, completion',
  sections: [
    {
      title: 'Other commands',
      items: [
        {
          kind: 'cmd',
          name: 'gh status',
          desc: 'Dashboard: notifications, PRs, issues',
          children: [
            { kind: 'flag', name: '-o, --org <org>', desc: 'Filter by org' },
            {
              kind: 'flag',
              name: '-e, --exclude <repos>',
              desc: 'Exclude repos',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh label create <name>',
          desc: 'Create a label',
          children: [
            { kind: 'flag', name: '-c, --color <hex>', desc: 'Color' },
            {
              kind: 'flag',
              name: '-d, --description <text>',
              desc: 'Description',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh label list',
          desc: 'List labels',
        },
        {
          kind: 'cmd',
          name: 'gh label edit <name>',
          desc: 'Edit a label',
        },
        {
          kind: 'cmd',
          name: 'gh label delete <name>',
          desc: 'Delete a label',
        },
        {
          kind: 'cmd',
          name: 'gh label clone <repo>',
          desc: 'Clone labels from repo',
        },
        {
          kind: 'cmd',
          name: 'gh ruleset list',
          desc: 'List rulesets',
        },
        {
          kind: 'cmd',
          name: 'gh ruleset view [<id>]',
          desc: 'View a ruleset',
        },
        {
          kind: 'cmd',
          name: 'gh ruleset check',
          desc: 'Check rules for current branch',
        },
        {
          kind: 'cmd',
          name: 'gh completion -s <shell>',
          desc: 'Generate shell completions',
        },
      ],
    },
  ],
};
