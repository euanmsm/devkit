// Which courses exist, and how to load one.
//
// The same arrangement as ../registry.mjs for guides: names and summaries live
// here so `crib learn` can print the list without loading any content, and
// each course is imported lazily behind a function.
//
// To add a course: create courses/<name>/ with an index.mjs exporting a
// Course, put its lesson .md files beside it, and add one line here. Keep the
// list alphabetical; a test enforces it.

/**
 * One course as the list screen knows it: a name, a line, a way to load.
 *
 * @typedef {object} CourseEntry
 * @property {string} name
 * @property {string} summary
 * @property {() => Promise<Course>} load
 */

/** Every course, alphabetical, content unloaded until asked for. */
export const courses = [
  {
    name: 'shell',
    summary: 'Your shell — line editing, history, globbing, jobs',
    load: async () => (await import('./courses/shell/index.mjs')).shell,
  },
  {
    name: 'stacks',
    summary: 'Stacked PRs — building, fixing and landing chains of PRs',
    load: async () => (await import('./courses/stacks/index.mjs')).stacks,
  },
];

/** The entry for an exact course name, if there is one. */
export function findCourse(name) {
  const want = name.toLowerCase();
  return courses.find((c) => c.name === want);
}

/**
 * Where a course's files live, by convention: a course named `shell` is in
 * courses/shell/. Deriving it here is what lets a course's index.mjs stay pure
 * data, with lesson bodies as bare filenames.
 */
export function courseDir(name) {
  return new URL(`./courses/${name}/`, import.meta.url);
}
