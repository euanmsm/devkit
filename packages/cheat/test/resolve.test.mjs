import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAll, normalise, resolveTopic } from '../src/resolve.mjs';

const topics = [
  { name: 'browse', description: '', sections: [] },
  { name: 'branch', description: '', sections: [] },
  { name: 'pr', description: '', sections: [] },
];

describe('normalise', () => {
  it('strips a leading -- and lowercases', () => {
    equal(normalise('--PR'), 'pr');
    equal(normalise('pr'), 'pr');
    equal(normalise('--pr'), 'pr');
  });

  it('leaves dashes inside a name alone', () => {
    equal(normalise('--ssh-key'), 'ssh-key');
  });
});

describe('resolveTopic', () => {
  it('finds an exact name', () => {
    deepEqual(resolveTopic(topics, 'pr'), { status: 'found', name: 'pr' });
  });

  it('accepts the flag form and any casing', () => {
    deepEqual(resolveTopic(topics, '--PR'), { status: 'found', name: 'pr' });
  });

  it('accepts a prefix that matches only one topic', () => {
    deepEqual(resolveTopic(topics, '--bro'), {
      status: 'found',
      name: 'browse',
    });
  });

  it('reports a prefix that matches several rather than guessing', () => {
    deepEqual(resolveTopic(topics, '--br'), {
      status: 'ambiguous',
      matches: ['browse', 'branch'],
    });
  });

  it('prefers an exact name over the prefixes it also matches', () => {
    const withOverlap = [
      { name: 'pr', description: '', sections: [] },
      { name: 'project', description: '', sections: [] },
    ];
    deepEqual(resolveTopic(withOverlap, 'pr'), { status: 'found', name: 'pr' });
  });

  it('reports an unknown name', () => {
    deepEqual(resolveTopic(topics, '--nope'), { status: 'unknown' });
  });
});

describe('isAll', () => {
  it('accepts both forms', () => {
    equal(isAll('all'), true);
    equal(isAll('--all'), true);
    equal(isAll('--ALL'), true);
  });

  it('rejects anything else', () => {
    equal(isAll('allocate'), false);
  });
});
