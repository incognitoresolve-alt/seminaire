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

import { ageYears, news2 } from '../web/shared/triage.js';
import { NOTE, RAPPEL, analyse } from '../web/shared/assistant.js';
import { SOURCES } from '../web/shared/sources.js';
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

test('NEWS2 (RCP 2017) : barème par paramètre', () => {
  assert.deepEqual(news2({ rr: 22, pulse: 115, temp: 38.5 }), { score: 5, n: 3, max3: false });
  assert.equal(news2({ spo2: 91 }).max3, true);
  assert.equal(news2({ sys: 120, pulse: 72, rr: 16, spo2: 98, temp: 36.8 }).score, 0);
});
const lvl = (p) => analyse(p, NOW).level;
test('assistant : niveaux d’urgence', () => {
  assert.equal(lvl({ alerts: 'douleur_thoracique' }), 'urgence');
  assert.equal(lvl({ spo2: 91, birth_date: '1980-01-01' }), 'urgence');
  assert.equal(lvl({ spo2: 93, birth_date: '1980-01-01' }), 'urgence_medicale');
  assert.equal(lvl({ sys: 185, dia: 95, birth_date: '1980-01-01' }), 'urgence_medicale');
  assert.equal(lvl({ sys: 150, dia: 85, birth_date: '1980-01-01' }), 'consultation');
  assert.equal(lvl({ temp: 38.4, birth_date: '1980-01-01' }), 'surveillance');
  assert.equal(lvl({ pulse: 72, temp: 36.8, sys: 118, dia: 76, birth_date: '1980-01-01' }), 'rassurant');
  assert.equal(lvl({}), 'incomplet');
  assert.equal(lvl({ temp: 38.2, birth_date: '2026-10-01' }), 'urgence'); // nourrisson < 3 mois
  assert.equal(lvl({ sys: 145, dia: 92, alerts: 'grossesse', birth_date: '1995-01-01' }), 'urgence_medicale');
  assert.equal(lvl({ rr: 22, pulse: 115, temp: 38.5, birth_date: '1980-01-01' }), 'urgence_medicale'); // NEWS2 = 5
});
test('assistant : format obligatoire et sources réelles', () => {
  const a = analyse({ sys: 150, dia: 85, birth_date: '1958-03-01' }, NOW);
  assert.match(NOTE, /strictement indicative et éducative/);
  assert.match(RAPPEL, /fournies à titre indicatif et éducatif/);
  assert.ok(a.label.startsWith('CONSULTATION RAPIDE'));
  assert.ok(a.understood.includes('68 ans'));
  assert.ok(a.actions.length >= 2 && a.actions.length <= 5);
  assert.ok(a.sources.some((x) => x.id === 'ESC_HTA') && a.sources.some((x) => x.id === 'BE_112'));
  assert.ok(a.prevention.some((x) => /colorectal/.test(x.text)) && a.prevention.some((x) => /grippe/.test(x.text)));
  // toutes les sources citées existent, et seules les sources « APP » n'ont pas d'URL
  for (const x of Object.values(SOURCES)) assert.ok(x.tier === 'APP' ? !x.url : x.url.startsWith('https://'));
});
test('assistant : aucune prescription ni dose', () => {
  const all = [];
  for (const p of [{ glucose: 50 }, { glucose: 60 }, { temp: 39.8 }, { sys: 190, dia: 115 }, { alerts: 'douleur_thoracique,avc' }]) {
    const a = analyse({ ...p, birth_date: '1970-01-01' }, NOW);
    all.push(...a.findings.map((f) => f.text), ...a.actions);
  }
  assert.ok(!/\b\d+\s?(mg|g|ml|comprimé)\b(?!\/dL)/i.test(all.join(' ')), 'aucune dose');
  assert.ok(!/paracétamol|ibuprofène|aspirine|insuline/i.test(all.join(' ')), 'aucun médicament');
});
