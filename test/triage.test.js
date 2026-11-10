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
