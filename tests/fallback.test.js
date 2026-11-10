import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchLessons, answerFromBank, summarizeText, flashcardsFromText, tokenize } from '../src/fallback.js';
import { SEED_LESSONS } from '../src/seed-data.js';

test('seed bank integrity: lessons carry the fields the app depends on', () => {
  assert.ok(SEED_LESSONS.length >= 30, `expected >=30 lessons, got ${SEED_LESSONS.length}`);
  for (const l of SEED_LESSONS) {
    assert.ok(l.id && l.title && l.subject && typeof l.intro === 'string');
    assert.ok(Array.isArray(l.keyFacts) && Array.isArray(l.practice) && Array.isArray(l.workedExamples));
  }
  const subjects = new Set(SEED_LESSONS.map((l) => l.subject));
  assert.ok(subjects.size >= 5);
});

test('search finds the Python classes lesson for a classes question', () => {
  const hits = searchLessons('classes and objects in python', SEED_LESSONS, 1);
  assert.equal(hits.length, 1);
  assert.match(hits[0].lesson.title, /Classes And Objects/i);
});

test('answerFromBank names its source lesson and admits misses honestly', () => {
  const hit = answerFromBank('What is a class in Python?', SEED_LESSONS);
  assert.match(hit.text, /offline lesson bank/i);
  const miss = answerFromBank('zzzqqq nonexistent topic', SEED_LESSONS);
  assert.equal(miss.lesson, null);
  assert.match(miss.text, /could not find/i);
});

test('extractive summary keeps the densest sentences', () => {
  const text = 'Photosynthesis is how plants make food. It uses sunlight and water. The weather today is sunny and warm in Phoenix. Photosynthesis produces oxygen as a byproduct. Plants rely on photosynthesis to grow.';
  const s = summarizeText(text, 2);
  assert.match(s, /Photosynthesis/);
  assert.equal(s.split('.').filter(Boolean).length, 2);
});

test('cloze flashcards are built from definitional sentences', () => {
  const cards = flashcardsFromText('A compiler is a program that translates source code into machine code. It reads the whole program first.', SEED_LESSONS);
  assert.ok(cards.length >= 1);
  assert.match(cards[0].front, /compiler/i);
});

test('tokenize strips stopwords and punctuation', () => {
  assert.deepEqual(tokenize('What is the RSA algorithm?'), ['rsa', 'algorithm']);
});
