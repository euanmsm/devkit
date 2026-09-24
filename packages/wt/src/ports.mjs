// ============================================================================
// Ports
// ============================================================================
//
// Resolves the host port each configured service binds in the current checkout.
// The main checkout keeps the base ports and a worktree shifts them by its slot.

import { repoRoot } from '@euanmsm/devkit-core';
import { loadWtConfig } from './config.mjs';
import { slotOf } from './slots.mjs';

/**
 * Works out how far this checkout's ports shift from the base ones.
 *
 * @param options - `root` of the checkout and an already loaded `config`
 * @returns The offset added to every base port
 */
export function offset({ root = repoRoot(), config } = {}) {
  const cfg = config ?? loadWtConfig(root);
  const name = cfg.ports.offsetEnv?.name;
  const fromEnv = name ? process.env[name]?.trim() : '';

  if (fromEnv && Number.isInteger(Number(fromEnv))) return Number(fromEnv);
  return slotOf(root) * cfg.ports.step;
}

/**
 * Resolves every configured service's port for a checkout.
 *
 * @param options - `root` of the checkout and an already loaded `config`
 * @returns Each service name mapped to its port
 */
export function ports({ root = repoRoot(), config } = {}) {
  const cfg = config ?? loadWtConfig(root);
  const shift = offset({ root, config: cfg });

  return Object.fromEntries(
    Object.entries(cfg.ports.services).map(([name, base]) => [
      name,
      base + shift,
    ]),
  );
}

/**
 * Resolves one service's port for a checkout.
 *
 * @param service - A name from `ports.services`
 * @param options - `root` of the checkout and an already loaded `config`
 * @returns The service's port
 * @throws When the config has no such service
 */
export function port(service, options = {}) {
  const all = ports(options);

  if (!(service in all)) {
    const known = Object.keys(all).join(', ') || 'none configured';
    throw new Error(`Unknown service "${service}". Known: ${known}.`);
  }

  return all[service];
}
