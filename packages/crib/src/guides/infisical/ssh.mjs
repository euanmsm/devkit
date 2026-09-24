export const ssh = {
  name: 'ssh',
  description: 'SSH certificate management',
  sections: [
    {
      title: 'ssh — SSH certificate management',
      items: [
        {
          kind: 'cmd',
          name: 'infisical ssh issue-credentials',
          desc: 'Issue SSH credentials',
          children: [
            {
              kind: 'flag',
              name: '--certificateTemplateId <id>',
              desc: 'Template ID',
            },
            { kind: 'flag', name: '--principals <list>', desc: 'Principals' },
            {
              kind: 'flag',
              name: '--certType <user|host>',
              desc: 'Certificate type (default: user)',
            },
            {
              kind: 'flag',
              name: '--keyAlgorithm <algo>',
              desc: 'Key algorithm (default: RSA_2048)',
            },
            { kind: 'flag', name: '--ttl <duration>', desc: 'Credential TTL' },
            { kind: 'flag', name: '--outFilePath <path>', desc: 'Output path' },
            { kind: 'flag', name: '--addToAgent', desc: 'Add to SSH agent' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical ssh sign-key',
          desc: 'Sign public key',
          children: [
            {
              kind: 'flag',
              name: '--certificateTemplateId <id>',
              desc: 'Template ID',
            },
            {
              kind: 'flag',
              name: '--publicKey <key>',
              desc: 'Public key string',
            },
            {
              kind: 'flag',
              name: '--publicKeyFilePath <path>',
              desc: 'Public key file',
            },
            { kind: 'flag', name: '--principals <list>', desc: 'Principals' },
            { kind: 'flag', name: '--ttl <duration>', desc: 'Certificate TTL' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical ssh connect',
          desc: 'SSH connect',
          children: [
            { kind: 'flag', name: '--hostname <host>', desc: 'Target host' },
            { kind: 'flag', name: '--login-user <user>', desc: 'Login user' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical ssh add-host',
          desc: 'Register SSH host',
          children: [
            {
              kind: 'flag',
              name: '--hostname <host>',
              desc: 'Hostname (required)',
            },
            {
              kind: 'flag',
              name: '--projectId <id>',
              desc: 'Project ID (required)',
            },
            {
              kind: 'flag',
              name: '--configure-sshd',
              desc: 'Update sshd_config',
            },
          ],
        },
      ],
    },
  ],
};
