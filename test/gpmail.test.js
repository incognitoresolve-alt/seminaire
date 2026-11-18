import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gpMail, mailto } from '../web/shared/gpmail.js';

const base = { first_name: 'Awa', last_name: 'DIALLO', birth_date: '1970-03-05', created_at: Date.UTC(2026, 10, 12, 10), gp_name: 'Dr Martin', phone: '0470 12 34 56', triage: 3, no_gp: 0 };

test('e-mail médecin : trame d’appel adaptée à la couleur', () => {
  const r = gpMail(base);
  assert.match(r.subject, /DIALLO Awa \(né\(e\) le 05\/03\/1970\)/);
  assert.match(r.body, /^Bonjour Dr Martin,/);
  assert.match(r.body, /Priorité indicative : Rouge/);
  assert.match(r.body, /Proposition d’appel au patient/);
  assert.match(r.body, /ici le cabinet du Dr Martin/);
  assert.match(r.body, /vous voir rapidement/);
  assert.match(r.body, /12\/11\/2026/);
  assert.match(r.body, /Téléphone du patient : 0470 12 34 56/);
  assert.match(gpMail({ ...base, triage: 1 }).body, /Vert .*\n[\s\S]*prochaine visite/);
  assert.match(gpMail({ ...base, triage: null }).body, /À mesurer/);
});

test('e-mail médecin : nom absent ou sans « Dr », pas de médecin traitant', () => {
  assert.match(gpMail({ ...base, gp_name: null }).body, /^Bonjour Docteur,/);
  assert.match(gpMail({ ...base, gp_name: 'Martin' }).body, /^Bonjour Docteur Martin,/);
  assert.match(gpMail({ ...base, no_gp: 1 }).body, /n’avait pas de médecin traitant/);
  assert.doesNotMatch(gpMail({ ...base, phone: null }).body, /Téléphone/);
});

test('e-mail médecin : aucune publicité, lien mailto encodé et raisonnable', () => {
  const r = gpMail(base);
  assert.doesNotMatch(r.body, /FSMA|assurance|INAMI|épargne|obsèques|Publicité/i);
  const u = mailto('cabinet@exemple.be', r);
  assert.ok(u.startsWith('mailto:cabinet@exemple.be?subject='));
  assert.ok(!/[\n ]/.test(u));
  assert.ok(u.length < 3000, `lien trop long (${u.length})`);
});
