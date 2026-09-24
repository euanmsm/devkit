// Reading a lesson's prose off disk and parsing it.

import { readFile } from 'node:fs/promises';
import { courseDir } from './registry.mjs';
import { parseLesson } from './markdown.mjs';

/**
 * Loads and parses one lesson body. Throws when the file is missing or the
 * markdown steps outside the subset — the caller decides whether that becomes
 * a failing test or a clean "this lesson is broken" screen.
 */
export async function loadLessonBody(courseName, lesson) {
  const url = new URL(lesson.body, courseDir(courseName));
  const source = await readFile(url, 'utf8');
  return parseLesson(source, `${courseName}/${lesson.body}`);
}
