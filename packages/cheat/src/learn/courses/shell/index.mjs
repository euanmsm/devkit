import { lineEditorExercises } from './line-editor.ex.mjs';
import { historyExercises } from './history.ex.mjs';

export const shell = {
  name: 'shell',
  title: 'shell — Your shell, properly',
  summary: 'Your shell — line editing, history, globbing, jobs',
  lessons: [
    {
      name: 'line-editor',
      description: "The keys that edit the line you're typing",
      body: 'line-editor.md',
      exercises: lineEditorExercises,
    },
    {
      name: 'history',
      description: 'Ctrl-R, history settings, !$ and friends',
      body: 'history.md',
      exercises: historyExercises,
    },
  ],
};
