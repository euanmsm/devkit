import { global } from './global.mjs';
import { setup } from './setup.mjs';
import { gateway } from './gateway.mjs';
import { channels } from './channels.mjs';
import { messages } from './messages.mjs';
import { skills } from './skills.mjs';
import { plugins } from './plugins.mjs';
import { models } from './models.mjs';
import { agents } from './agents.mjs';
import { config } from './config.mjs';
import { cron } from './cron.mjs';
import { memory } from './memory.mjs';
import { sessions } from './sessions.mjs';
import { security } from './security.mjs';
import { diagnostics } from './diagnostics.mjs';
import { browser } from './browser.mjs';
import { inference } from './inference.mjs';
import { nodes } from './nodes.mjs';
import { devices } from './devices.mjs';
import { tasks } from './tasks.mjs';
import { backup } from './backup.mjs';
import { update } from './update.mjs';
import { sandbox } from './sandbox.mjs';
import { hooks } from './hooks.mjs';
import { approvals } from './approvals.mjs';
import { webhooks } from './webhooks.mjs';
import { acp } from './acp.mjs';
import { tui } from './tui.mjs';
import { system } from './system.mjs';
import { dns } from './dns.mjs';
import { reset } from './reset.mjs';
import { env } from './env.mjs';
import { paths } from './paths.mjs';

export const openclaw = {
  name: 'openclaw',
  title: 'OpenClaw — Self-Hosted AI Assistant CLI',
  summary: 'OpenClaw self-hosted AI assistant',
  intro: [
    { kind: 'note', text: 'Config: ~/.openclaw/openclaw.json' },
    { kind: 'note', text: 'Docs:   https://docs.openclaw.ai/cli' },
    {
      kind: 'note',
      text: 'VPS:    ssh openclaw-vps (Tailscale: 100.106.143.32)',
    },
    { kind: 'gap' },
  ],
  topics: [
    global,
    setup,
    gateway,
    channels,
    messages,
    skills,
    plugins,
    models,
    agents,
    config,
    cron,
    memory,
    sessions,
    security,
    diagnostics,
    browser,
    inference,
    nodes,
    devices,
    tasks,
    backup,
    update,
    sandbox,
    hooks,
    approvals,
    webhooks,
    acp,
    tui,
    system,
    dns,
    reset,
    env,
    paths,
  ],
};
