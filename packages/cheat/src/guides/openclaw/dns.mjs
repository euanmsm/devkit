export const dns = {
  name: 'dns',
  description: 'Wide-area discovery',
  sections: [
    {
      title: 'DNS — Wide-Area Discovery',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw dns setup',
          desc: 'Wide-area discovery DNS helper',
          children: [
            {
              kind: 'flag',
              name: '--domain <domain>',
              desc: 'Domain to configure',
            },
            {
              kind: 'flag',
              name: '--apply',
              desc: 'Install/update CoreDNS config',
            },
          ],
        },
      ],
    },
  ],
};
