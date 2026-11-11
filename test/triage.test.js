import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL, triage } from '../web/shared/triage.js';

test('aucune mesure => à mesurer', () => assert.equal(triage({}).level, LEVEL.NONE));
test('poids seul ne déclenche pas de triage', () => assert.equal(triage({ weight: 80 }).level, LEVEL.NONE));
test('normal => vert', () => assert.equal(triage({ pulse: 72, temp: 36.8, sys: 120, dia: 80 }).level, LEVEL.GREEN));
test('fièvre modérée => orange', () => assert.equal(triage({ temp: 38.2 }).level, LEVEL.ORANGE));
test('HTA sévère => rouge', () => {
  const r = triage({ pulse: 80, sys: 185, dia: 95 });
  assert.equal(r.level, LEVEL.RED);
  assert.equal(r.reasons.length, 2);
});
test('le pire paramètre gagne', () => assert.equal(triage({ pulse: 135, temp: 38.5 }).level, LEVEL.RED));
test('bornes', () => {
  assert.equal(triage({ pulse: 100 }).level, LEVEL.GREEN);
  assert.equal(triage({ pulse: 101 }).level, LEVEL.ORANGE);
  assert.equal(triage({ temp: 39.5 }).level, LEVEL.RED);
});

test('IMC ≥ 30 => orange, glycémie ≥ 300 => rouge', () => {
  assert.equal(triage({ weight: 95, height: 170 }).level, LEVEL.ORANGE);
  assert.equal(triage({ weight: 70, height: 175 }).level, LEVEL.GREEN);
  assert.equal(triage({ glucose: 320 }).level, LEVEL.RED);
});

import { advice, ageYears } from '../web/shared/triage.js';
const NOW = new Date('2026-11-11T10:00:00');
test('âge calculé à la date du jour', () => {
  assert.equal(ageYears('1990-11-12', NOW), 35);
  assert.equal(ageYears('1990-11-11', NOW), 36);
  assert.equal(ageYears('', NOW), null);
});
test('seuils pédiatriques : pouls 115 normal chez un enfant de 8 ans, orange chez un adulte', () => {
  assert.equal(triage({ pulse: 115, birth_date: '2018-05-01' }, NOW).level, LEVEL.GREEN);
  assert.equal(triage({ pulse: 115, birth_date: '1980-05-01' }, NOW).level, LEVEL.ORANGE);
  assert.equal(triage({ pulse: 165, birth_date: '2018-05-01' }, NOW).level, LEVEL.RED);
});
test('IMC adulte non appliqué avant 18 ans', () => {
  assert.equal(triage({ weight: 70, height: 150, birth_date: '2014-01-01' }, NOW).level, LEVEL.NONE);
  assert.equal(triage({ weight: 70, height: 150, birth_date: '1980-01-01' }, NOW).level, LEVEL.ORANGE);
});
test('conseils automatiques selon valeurs et âge', () => {
  const a = advice({ sys: 150, dia: 85, birth_date: '1958-03-01' }, NOW).map((x) => x.text).join(' | ');
  assert.match(a, /Tension élevée/);
  assert.match(a, /risque de chute/); // 68 ans
  assert.match(a, /glycémie/i); // ≥ 45 ans sans glycémie
  assert.match(a, /colorectal/);
  assert.match(a, /vaccins/);
  assert.ok(advice({ glucose: 60 }, NOW).some((x) => x.tone === 'red'));
  assert.ok(advice({ pulse: 80, birth_date: '2015-01-01' }, NOW).some((x) => /Mineur/.test(x.text)));
  assert.equal(advice({ pulse: 72, temp: 36.8, birth_date: '2000-01-01' }, NOW).length, 0);
});
