export const vault = {
  name: 'vault',
  description: 'Token storage backend',
  sections: [
    {
      title: 'vault — Token storage backend',
      items: [
        {
          kind: 'cmd',
          name: 'infisical vault set <file|auto>',
          desc: 'Configure vault backend',
          children: [
            {
              kind: 'note',
              text: 'file = plaintext file, auto = system keyring',
            },
          ],
        },
      ],
    },
  ],
};
