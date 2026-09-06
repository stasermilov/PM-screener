import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyExclusion } from '../src/exclude.js';

test('excludes X / Twitter post markets', () => {
  assert.equal(classifyExclusion('How many times will Elon tweet this week?').id, 'x-posts');
  assert.equal(classifyExclusion('Number of Trump Truth Social posts in July').id, 'x-posts');
  assert.equal(classifyExclusion('Elon Musk posts on X before Friday?').id, 'x-posts');
});

test('excludes Trump insult / nickname markets', () => {
  assert.equal(classifyExclusion('Will Trump insult Zelensky at the summit?').id, 'trump-insults');
  assert.equal(classifyExclusion('Which nickname will Trump use for DeSantis?').id, 'trump-insults');
});

test('excludes "word said during an event" markets', () => {
  assert.equal(classifyExclusion("How many times will Powell say 'inflation'?").id, 'said-during-event');
  assert.equal(classifyExclusion("Will Elon say 'Mars' on the Q2 earnings call?").id, 'said-during-event');
  assert.equal(classifyExclusion("Will a guest say 'AGI' on the All-In podcast?").id, 'said-during-event');
});

test('keeps normal markets and reports the matched phrase', () => {
  assert.equal(classifyExclusion('Will there be a US recession in 2026?'), null);
  assert.equal(classifyExclusion('China x India military clash by year end?'), null);
  const hit = classifyExclusion('How many times will Elon tweet this week?');
  assert.ok(/tweet/i.test(hit.matched));
  assert.equal(hit.label, 'X / Twitter post');
});

test('supports custom extra keywords', () => {
  const hit = classifyExclusion('Champions League final winner?', ['champions league']);
  assert.equal(hit.id, 'custom');
  assert.ok(hit.label.includes('champions league'));
  assert.equal(classifyExclusion('Champions League final winner?', []), null);
});
