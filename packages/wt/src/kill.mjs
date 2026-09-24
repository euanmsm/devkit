// ============================================================================
// Kill
// ============================================================================
//
// Stops what a worktree is running: listeners on its ports, its Docker
// containers and, on request, every process working inside its folder.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadWtConfig, worktreesDir } from './config.mjs';
import { checkoutRoot, mainRoot, real, worktrees } from './git.mjs';
import { readRecord, slotOf } from './slots.mjs';
import { supabaseMappings } from './supabase/project.mjs';
import { ownProjectId, stopStack } from './supabase/stack.mjs';

// Matches the processes behind Docker's published ports, which wt never signals.
const DOCKER = /docker|vpnkit|orbstack|colima|limactl|rootlesskit/i;

// Matches shells, editors and agent sessions, which `--all` never signals.
const PROTECTED =
  /^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|login)$|^(code|cursor|electron|vim|nvim|vi|claude)$|^(code|cursor) helper/i;

const GRACE_MS = 5000;

// ============================================================================
// Finding
// ============================================================================

/**
 * Lists a worktree's ports, leaving out any the main checkout uses.
 *
 * @param config - The loaded config
 * @param slot - The worktree's slot, at least 1
 * @returns Each port and the service or stack it belongs to
 */
export function lanePorts(config, slot) {
  const shift = slot * config.ports.step;
  const main = new Set(Object.values(config.ports.services));
  const out = Object.entries(config.ports.services).map(([label, base]) => ({
    port: base + shift,
    label,
  }));

  if (config.supabase) {
    for (const [from, to] of supabaseMappings(config.supabase, slot)) {
      main.add(from);
      out.push({ port: to, label: 'supabase' });
    }
  }

  return out.filter(({ port }) => !main.has(port));
}

/**
 * Reads `lsof -F pcn` output into one entry per process.
 *
 * @param text - What lsof printed
 * @returns Each process's id, command and file names
 */
export function parseLsof(text) {
  const procs = [];
  let current = null;

  for (const line of text.split('\n')) {
    const field = line[0];
    const value = line.slice(1);

    if (field === 'p') {
      current = { pid: Number(value), command: '', names: [] };
      procs.push(current);
    } else if (current && field === 'c') {
      current.command = value;
    } else if (current && field === 'n') {
      current.names.push(value);
    }
  }

  return procs;
}

/**
 * Reads the host ports each container publishes from `docker ps` output.
 *
 * @param text - Lines of `<name>|<ports>`
 * @returns Each container's name and host ports
 */
export function parseDockerPorts(text) {
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, published = ''] = line.split('|');
      const ports = new Set();

      // Matches a host port or host port range before `->`.
      for (const m of published.matchAll(/:(\d+)(?:-(\d+))?->/g)) {
        const from = Number(m[1]);
        const to = m[2] ? Number(m[2]) : from;
        for (let p = from; p <= to; p++) ports.add(p);
      }

      return { name, ports: [...ports] };
    });
}

/**
 * Runs a lookup tool, returning its output or null when it is missing.
 *
 * @param program - The tool
 * @param args - Its arguments
 * @returns What it printed, or null when it could not start
 */
function probe(program, args) {
  const result = spawnSync(program, args, { encoding: 'utf8' });
  return result.error ? null : (result.stdout ?? '');
}

/**
 * Lists the processes listening on any of the ports.
 *
 * @param ports - Port numbers
 * @returns Each listener's id, command and the ports it holds
 */
export function portHolders(ports) {
  if (ports.length === 0) return [];

  const wanted = new Set(ports);
  const out = probe('lsof', [
    '-nP',
    '+c',
    '0',
    `-iTCP:${ports.join(',')}`,
    '-sTCP:LISTEN',
    '-Fpcn',
  ]);
  if (out === null) {
    console.warn(
      '  Warning: lsof is not installed, so ports were not checked.',
    );
    return [];
  }

  return parseLsof(out)
    .map(({ pid, command, names }) => ({
      pid,
      command,
      ports: [...new Set(names.map((n) => Number(n.split(':').at(-1))))].filter(
        (p) => wanted.has(p),
      ),
    }))
    .filter((p) => p.ports.length > 0);
}

/**
 * Lists the running containers publishing any of the ports.
 *
 * @param ports - Port numbers
 * @returns Each container's name and the ports it holds
 */
export function dockerContainers(ports) {
  const out = probe('docker', ['ps', '--format', '{{.Names}}|{{.Ports}}']);
  if (!out) return [];

  const wanted = new Set(ports);
  return parseDockerPorts(out)
    .map((c) => ({ ...c, ports: c.ports.filter((p) => wanted.has(p)) }))
    .filter((c) => c.ports.length > 0);
}

/**
 * Lists the ids of this process and every process above it.
 *
 * @returns The ids never to signal
 */
function ancestors() {
  const parent = new Map();
  const out = probe('ps', ['-A', '-o', 'pid=,ppid=']) ?? '';

  for (const line of out.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid) parent.set(pid, ppid);
  }

  const chain = new Set();
  for (
    let pid = process.pid;
    pid > 1 && !chain.has(pid);
    pid = parent.get(pid)
  ) {
    chain.add(pid);
  }
  return chain;
}

/**
 * True for a shell, editor or agent session, judged by name and command line.
 *
 * @param command - The process's short name
 * @param line - Its full command line
 * @returns Whether `--all` leaves it alone
 */
export function isProtected(command, line = '') {
  return PROTECTED.test(command) || /\bclaude\b/i.test(line);
}

/**
 * Lists the processes whose working folder is inside a worktree.
 *
 * @param root - The worktree's real path
 * @returns Each process's id and command, protected ones left out
 */
export function folderProcesses(root) {
  const out = probe('lsof', ['-a', '-d', 'cwd', '+c', '0', '-Fpcn']);
  if (out === null) return [];

  const inside = parseLsof(out).filter(({ names }) =>
    names.some((n) => n === root || n.startsWith(root + sep)),
  );
  if (inside.length === 0) return [];

  const skip = ancestors();
  const lines = new Map();
  const ps =
    probe('ps', [
      '-o',
      'pid=,command=',
      '-p',
      inside.map((p) => p.pid).join(','),
    ]) ?? '';
  for (const line of ps.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (m) lines.set(Number(m[1]), m[2]);
  }

  return inside
    .filter(
      ({ pid, command }) =>
        !skip.has(pid) && !isProtected(command, lines.get(pid)),
    )
    .map(({ pid, command }) => ({ pid, command }));
}

// ============================================================================
// Stopping
// ============================================================================

/**
 * Keeps the processes still running, counting an unreaped zombie as gone.
 *
 * @param pids - Process ids
 * @returns The ids still running
 */
function living(pids) {
  const exists = pids.filter((pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code === 'EPERM';
    }
  });
  if (exists.length === 0) return [];

  const out = probe('ps', ['-o', 'pid=,stat=', '-p', exists.join(',')]) ?? '';
  const zombies = new Set(
    out
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter(([, stat]) => stat?.startsWith('Z'))
      .map(([pid]) => Number(pid)),
  );
  return exists.filter((pid) => !zombies.has(pid));
}

/**
 * Sends each process `SIGTERM`, then `SIGKILL` to any still up after the grace.
 *
 * @param pids - Process ids
 * @param graceMs - How long to wait before forcing
 * @returns The ids that needed `SIGKILL`
 */
export async function stopPids(pids, graceMs = GRACE_MS) {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process exited between the lookup and the signal.
    }
  }

  const deadline = Date.now() + graceMs;
  let left = living(pids);

  while (left.length > 0 && Date.now() < deadline) {
    await sleep(100);
    left = living(left);
  }

  for (const pid of left) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The process exited after the last check.
    }
  }

  return left;
}

/**
 * Stops what one worktree is running, printing a line for each thing found.
 *
 * @param root - The worktree's real path
 * @param config - The loaded config
 * @param slot - The worktree's slot, at least 1
 * @param options - `folder` for `--all`, `stack` of keep-data or skip, `dryRun`
 * @returns How many things were found running
 */
export async function stopWorktree(
  root,
  config,
  slot,
  { folder = false, stack = 'keep-data', dryRun = false } = {},
) {
  const verb = dryRun ? 'Would stop' : 'Stopping';
  const lane = lanePorts(config, slot);
  const ports = lane.map((l) => l.port);
  const labels = new Map(lane.map((l) => [l.port, l.label]));
  let found = 0;

  const id = stack === 'keep-data' ? ownProjectId(root, slot) : null;
  const running = id
    ? (probe('docker', ['ps', '--format', '{{.Names}}']) ?? '')
        .split('\n')
        .some((n) => n.endsWith(`_${id}`))
    : false;

  if (running) {
    found += 1;
    console.log(`  ${verb} Supabase stack ${id}, data kept`);
    if (!dryRun) await stopStack(root, slot, false);
  }

  const containers = dockerContainers(ports);
  if (containers.length > 0) {
    found += containers.length;
    for (const c of containers)
      console.log(`  ${verb} container ${c.name} on :${c.ports.join(', :')}`);
    if (!dryRun)
      spawnSync('docker', ['stop', ...containers.map((c) => c.name)], {
        stdio: 'ignore',
      });
  }

  const covered = new Set(containers.flatMap((c) => c.ports));
  const targets = new Map();

  for (const holder of portHolders(ports)) {
    if (DOCKER.test(holder.command)) {
      const loose = holder.ports.filter((p) => !covered.has(p));
      if (!dryRun && loose.length > 0) {
        console.log(
          `  Left :${loose.join(', :')} alone, held by Docker itself (${holder.command})`,
        );
      }
      continue;
    }

    const where = holder.ports.map((p) => `${labels.get(p)} :${p}`).join(', ');
    targets.set(
      holder.pid,
      `${holder.command} (pid ${holder.pid}) on ${where}`,
    );
  }

  if (folder) {
    for (const { pid, command } of folderProcesses(root)) {
      if (!targets.has(pid))
        targets.set(pid, `${command} (pid ${pid}) in the folder`);
    }
  }

  found += targets.size;
  for (const line of targets.values()) console.log(`  ${verb} ${line}`);

  if (!dryRun && targets.size > 0) {
    const forced = await stopPids([...targets.keys()]);
    if (forced.length > 0)
      console.log(`  Forced ${forced.length} that ignored SIGTERM`);
  }

  if (found === 0) console.log('  Nothing running.');
  return found;
}

// ============================================================================
// Command
// ============================================================================

/**
 * Finds a linked worktree by its name under the worktrees folder.
 *
 * @param name - The worktree's name
 * @param options - The loaded `config`, the `main` checkout and a `cwd` in the repo
 * @returns The worktree's real path and its branch
 * @throws When no worktree has that name
 */
export function findWorktree(name, { config, main, cwd }) {
  const path = real(join(worktreesDir(config, main), name));
  const entry = worktrees(cwd).find((w) => real(w.path) === path);

  if (!entry || path === main)
    throw new Error(`No worktree named ${name} at ${path}.`);
  return { path, branch: entry.branch };
}

/**
 * Lists the worktrees a kill applies to.
 *
 * @param options - The worktree `name`, whether `every` one, and `cwd`
 * @returns The config and each target's name, path and slot
 * @throws When no target is named from the main checkout, or one has no slot
 */
function targets({ name, every, cwd }) {
  const main = mainRoot(cwd);
  const config = loadWtConfig(checkoutRoot(cwd), main);

  if (every) {
    const list = worktrees(cwd)
      .slice(1)
      .map((w) => real(w.path))
      .filter((path) => path !== main && existsSync(path))
      .map((path) => ({
        name: readRecord(path)?.name ?? basename(path),
        path,
        slot: slotOf(path),
      }))
      .filter((t) => t.slot > 0);
    return { config, list };
  }

  let path;
  if (name) {
    path = findWorktree(name, { config, main, cwd }).path;
  } else {
    path = checkoutRoot(cwd);
    if (path === main)
      throw new Error('Name a worktree, or run wt kill inside one.');
  }

  const slot = slotOf(path);
  if (slot === 0)
    throw new Error(`${path} has no slot, so it has no ports of its own.`);

  return {
    config,
    list: [{ name: readRecord(path)?.name ?? basename(path), path, slot }],
  };
}

/**
 * Stops what one or every worktree is running.
 *
 * @param options - The worktree `name`, whether `every` one, `all` for folder processes, `dryRun`, and `cwd`
 * @throws When the target cannot be found
 */
export async function kill({
  name,
  every = false,
  all = false,
  dryRun = false,
  cwd = process.cwd(),
}) {
  const { config, list } = targets({ name, every, cwd });
  if (list.length === 0) console.log('No worktrees to stop.');

  for (const t of list) {
    console.log(`${t.name} (slot ${t.slot}):`);
    await stopWorktree(t.path, config, t.slot, { folder: all, dryRun });
  }
}
