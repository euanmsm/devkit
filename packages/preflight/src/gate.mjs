// ============================================================================
// Skill Gate
// ============================================================================
//
// PreToolUse hook. Blocks a tool call until the skills it needs have been
// loaded this session — by the tool's name when a tool rule matches, otherwise
// by the path of the file it writes. Fails open on any error.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';

import { compile, loadConfig, repoRoot } from '@euanmsm/devkit-core';

const CONFIG_NAME = 'preflight.json';

/** Anything other than an explicit deny lets the tool call through. */
function allow() {
  process.exit(0);
}

/**
 * Blocks the tool call, showing the agent which skills to load.
 *
 * @param reason - Which skills the edit needs first
 */
function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

/**
 * Locates the session transcript the hook payload belongs to.
 *
 * @param input - The hook payload
 * @returns Path to the transcript, or null when it cannot be found
 */
export function findTranscript(input) {
  if (input.transcript_path && existsSync(input.transcript_path))
    return input.transcript_path;

  const projects = join(homedir(), '.claude', 'projects');
  if (!input.session_id || !existsSync(projects)) return null;

  for (const dir of readdirSync(projects)) {
    const candidate = join(projects, dir, `${input.session_id}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Reads every skill loaded in a transcript.
 *
 * @param transcriptPath - Path to the session's JSONL transcript
 * @returns Skill names, one per Skill tool call
 */
export function loadedSkills(transcriptPath) {
  const raw = readFileSync(transcriptPath, 'utf8');
  const skills = new Set();

  for (const match of raw.matchAll(
    /"name":"Skill","input":\{"skill":"([^"]+)"/g,
  )) {
    skills.add(match[1]);
  }

  return skills;
}

/**
 * Names the skills a path requires.
 *
 * @param rel - Repo-relative path of the edited file
 * @param map - Parsed skill map
 * @returns Required skill names, empty when the path is ungoverned
 */
export function requiredFor(rel, map) {
  if (compile(map.exclude).some((p) => p.test(rel))) return [];

  const required = new Set();

  // First match wins, so the map lists the most specific pattern first.
  const hit = (map.primary ?? []).find((rule) => matches(rule.pattern, rel));
  if (hit) hit.skills.forEach((s) => required.add(s));

  for (const rule of map.universal ?? []) {
    if (matches(rule.pattern, rel)) rule.skills.forEach((s) => required.add(s));
  }

  return [...required];
}

/**
 * Names the skills a tool requires, whatever file it touches.
 *
 * @param tool - The tool name from the hook payload
 * @param map - Parsed skill map
 * @returns Required skill names, empty when no tool rule matches
 */
export function requiredForTool(tool, map) {
  // First match wins, like primary.
  const hit = (map.tools ?? []).find((rule) => matches(rule.pattern, tool));
  return hit ? [...hit.skills] : [];
}

/**
 * Finds what a tool call needs and what to call it in the deny message.
 *
 * @param input - The hook payload
 * @param map - Parsed skill map
 * @param root - Repository root
 * @returns The tool name or path, and its skills; null when nothing governs it
 */
function gateFor(input, map, root) {
  const tool = input?.tool_name ?? '';
  const toolSkills = requiredForTool(tool, map);
  if (toolSkills.length > 0) return { subject: tool, skills: toolSkills };

  const filePath = input?.tool_input?.file_path;
  if (!filePath) return null;

  const rel = relative(root, filePath);

  // A file in another checkout is not this repo's to govern.
  if (rel.startsWith('..')) return null;

  return { subject: rel, skills: requiredFor(rel, map) };
}

/**
 * Tests one path against one pattern.
 *
 * @param pattern - A regex from the config
 * @param rel - Repo-relative path
 * @returns Whether it matches, and false when the pattern will not compile
 */
function matches(pattern, rel) {
  return compile([pattern]).some((p) => p.test(rel));
}

/** Reads the hook payload and denies when a required skill is missing. */
export function main() {
  if (process.env.PREFLIGHT === 'off') allow();

  const input = JSON.parse(readFileSync(0, 'utf8'));

  // Outside a repository there is no map to read, so nothing is governed.
  let root;
  try {
    root = repoRoot();
  } catch {
    allow();
  }

  const map = loadConfig(CONFIG_NAME, null, root);
  if (!map) allow();

  const gate = gateFor(input, map, root);
  if (!gate || gate.skills.length === 0) allow();

  const transcript = findTranscript(input);
  if (!transcript) allow();

  const loaded = loadedSkills(transcript);
  const missing = gate.skills.filter((s) => !loaded.has(s));
  if (missing.length === 0) allow();

  const calls = missing.map((s) => `  Skill(skill: "${s}")`).join('\n');

  deny(
    `BLOCKED — ${gate.subject} is governed by convention skills you have not loaded this session.\n\n` +
      `Load them, then make this call again:\n${calls}\n\n` +
      `These skills hold the conventions this call must follow. Do not work around this by ` +
      `writing from memory. The mapping lives in .devkit/${CONFIG_NAME}.`,
  );
}
