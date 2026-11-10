import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTasks, parseFlashcards, parseMockTest } from '../src/tasks.js';
import { Cascade } from '../src/router.js';
import { loadConfig } from '../src/config.js';
import { SEED_LESSONS } from '../src/seed-data.js';

function nanoCascade(text) {
  const nano = async () => ({ text, latencyMs: 5 });
  nano.availability = async () => 'readily';
  return new Cascade({ config: loadConfig({}, {}), lessons: SEED_LESSONS, nano, online: () => true });
}
const noNanoCascade = () => {
  const nano = async () => ({ text: '', latencyMs: 1 });
  nano.availability = async () => 'no';
  return new Cascade({ config: loadConfig({}, {}), lessons: SEED_LESSONS, nano, online: () => true });
};

test('parseFlashcards reads Q:/A: pairs', () => {
  const cards = parseFlashcards('Q: What is 2+2?\nA: 4\nQ: Capital of France?\nA: Paris');
  assert.deepEqual(cards, [{ front: 'What is 2+2?', back: '4' }, { front: 'Capital of France?', back: 'Paris' }]);
});

test('parseMockTest reads numbered questions with answers', () => {
  const items = parseMockTest('Q1. What is a loop?\nAnswer: A repetition construct.\nQ2. Define a variable.\nAnswer: A named storage location.');
  assert.equal(items.length, 2);
  assert.match(items[1].answer, /named storage/);
});

test('flashcards task returns structured cards from a model answer', async () => {
  const tasks = createTasks(nanoCascade('Q: What is RSA?\nA: A public-key cryptosystem.\nQ: What is DH?\nA: A key-exchange protocol.'));
  const r = await tasks.flashcards('RSA and Diffie-Hellman');
  assert.equal(r.cards.length, 2);
  assert.equal(r.decision.tier, 'nano');
});

test('mockTest assembles real questions from the seeded practice bank when no AI tier exists', async () => {
  const tasks = createTasks(noNanoCascade());
  const r = await tasks.mockTest('classes and objects in python', { count: 3 });
  assert.ok(r.items.length >= 1, 'practice-bank questions assembled');
  assert.ok(r.items[0].question.length > 10);
});

test('photoProblem without an image routes as a deep text task', async () => {
  const tasks = createTasks(noNanoCascade());
  const r = await tasks.photoProblem('A photo shows: model a BankAccount class whose balance cannot go negative');
  assert.equal(r.decision.complexity, 'deep');
  assert.ok(r.answer.length > 20);
});

test('workedSolution returns a stepped answer from the bank when offline tiers only', async () => {
  const tasks = createTasks(noNanoCascade());
  const r = await tasks.workedSolution('BankAccount class deposit withdraw balance never negative');
  assert.match(r.answer, /worked example|lesson bank/i);
});
