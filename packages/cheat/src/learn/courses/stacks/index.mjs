import { theIdeaExercises } from './the-idea.ex.mjs';
import { firstStackExercises } from './first-stack.ex.mjs';
import { reviewLoopExercises } from './review-loop.ex.mjs';
import { landingExercises } from './landing.ex.mjs';

export const stacks = {
  name: 'stacks',
  title: 'stacks — Big changes as chains of small PRs',
  summary: 'Stacked PRs — building, fixing and landing chains of PRs',
  lessons: [
    {
      name: 'the-idea',
      description: 'Trunk, layers, and why small PRs review better',
      body: 'the-idea.md',
      reference: ['gh --stack'],
      exercises: theIdeaExercises,
    },
    {
      name: 'first-stack',
      description: 'From a clean main to a chain of open PRs',
      body: 'first-stack.md',
      reference: ['gh --stack'],
      exercises: firstStackExercises,
    },
    {
      name: 'review-loop',
      description: 'Fixing a middle layer and cascading it upward',
      body: 'review-loop.md',
      reference: ['gh --stack'],
      exercises: reviewLoopExercises,
    },
    {
      name: 'landing',
      description: 'Merging bottom-up, syncing, pruning, unstacking',
      body: 'landing.md',
      reference: ['gh --stack'],
      exercises: landingExercises,
    },
  ],
};
