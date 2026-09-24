export const inference = {
  name: 'inference',
  description: 'Direct model, image, audio, TTS, video access',
  sections: [
    {
      title: 'Inference — Direct Model & Capability Access',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw infer list',
          desc: 'List available capabilities',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer inspect',
          desc: 'Inspect specific capability',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer model run --model <id>',
          desc: 'Execute model inference',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer model list',
          desc: 'List available models',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer model inspect',
          desc: 'Get model details',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer model providers',
          desc: 'List model providers',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer model auth login|logout|status',
          desc: 'Model provider auth',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer image generate --prompt <text>',
          desc: 'Generate image',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer image edit',
          desc: 'Edit/modify image',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer image describe',
          desc: 'Analyze/describe image',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer image describe-many',
          desc: 'Batch image analysis',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer image providers',
          desc: 'List image providers',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer audio transcribe',
          desc: 'Transcribe audio',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer audio providers',
          desc: 'List audio providers',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer tts convert',
          desc: 'Text-to-speech conversion',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer tts voices',
          desc: 'List available voices',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer tts providers|status|enable|disable|set-provider',
          desc: 'TTS management',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer video generate|describe|providers',
          desc: 'Video operations',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer web search|fetch|providers',
          desc: 'Web search and fetch',
        },
        {
          kind: 'cmd',
          name: 'openclaw infer embedding create|providers',
          desc: 'Embedding generation',
        },
      ],
    },
  ],
};
