// The shape of a cheat sheet. Everything under src/guides/ is data in these
// types; nothing there knows how it will be printed.

/**
 * A single line of a cheat sheet.
 *
 * @typedef {(
 *   // A command, with its flags, subcommands and notes nested underneath.
 *   | { kind: "cmd"; name: string; desc: string; children?: Item[] }
 *   // An option belonging to the command above it.
 *   | { kind: "flag"; name: string; desc: string }
 *   // A subcommand belonging to the command above it.
 *   | { kind: "subcmd"; name: string; desc: string }
 *   // A free line of prose — a caveat, a default, a gotcha.
 *   | { kind: "note"; text: string }
 *   // A deliberate blank line, used to hold a trailing note apart.
 *   | { kind: "gap" }
 * )} Item
 */

/**
 * A headed group of items. Most topics have one; a few group several.
 *
 * @typedef {object} Section
 * @property {string} title Printed as the group heading, e.g. "pr — Manage pull requests".
 * @property {Item[]} items
 */

/**
 * One slice of a tool, reached by `crib <tool> --<name>`.
 *
 * @typedef {object} Topic
 * @property {string} name Lowercase, no spaces — this is what the user types.
 * @property {string} description One line, shown on the tool's menu.
 * @property {Section[]} sections
 */

/**
 * Everything known about one CLI.
 *
 * @typedef {object} Guide
 * @property {string} name Lowercase, no spaces — this is what the user types.
 * @property {string} title Printed in the banner, e.g. "gh — GitHub CLI".
 * @property {string} summary One line, shown on the no-argument screen.
 * @property {Item[]} intro Global flags and standing caveats, printed above the menu.
 * @property {Topic[]} topics
 * @property {boolean} [menu] Short guides can skip the menu and print in full — `crib lsof` does.
 *   Defaults to true.
 */
