export const approvals = {
  name: 'approvals',
  description: 'Exec approval policy',
  sections: [
    {
      title: 'Approvals — Exec Approval Policy',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw approvals get',
          desc: 'Fetch exec approvals snapshot + policy',
          children: [
            { kind: 'flag', name: '--node <node>', desc: 'Target node' },
            { kind: 'flag', name: '--gateway', desc: 'Query gateway' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw approvals set',
          desc: 'Replace approvals with JSON',
          children: [
            { kind: 'flag', name: '--file <path>', desc: 'JSON file path' },
            { kind: 'flag', name: '--stdin', desc: 'Read from stdin' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw approvals allowlist add|remove',
          desc: 'Edit per-agent exec allowlist',
          children: [
            {
              kind: 'flag',
              name: '--agent <id>',
              desc: "Agent (defaults to '*')",
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
      ],
    },
  ],
};
