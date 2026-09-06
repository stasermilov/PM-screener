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

test('excludes "mentions" markets', () => {
  assert.equal(classifyExclusion('Trump mentions by cable news today?').id, 'mentions');
  assert.equal(classifyExclusion('How many times will Biden be mentioned?').id, 'mentions');
  assert.equal(classifyExclusion('Elon Musk mention count this week').id, 'mentions');
  const hit = classifyExclusion('Trump mentions by cable news today?');
  assert.equal(hit.label, 'Mentions market');
  assert.ok(/mentions?/i.test(hit.matched));
});

test('excludes midterms / house elections markets', () => {
  assert.equal(classifyExclusion('2026 US midterms prediction').id, 'midterms-elections');
  assert.equal(classifyExclusion('Who wins the midterm elections?').id, 'midterms-elections');
  assert.equal(classifyExclusion('House election results by state').id, 'midterms-elections');
  const hit = classifyExclusion('2026 midterms winner');
  assert.equal(hit.label, 'Midterms / House elections');
  assert.ok(/midterms?/i.test(hit.matched));
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
