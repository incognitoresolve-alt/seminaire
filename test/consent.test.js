import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_TEXTS, CURRENT, formatHash, makeEntry, verifyEntry } from '../web/shared/consent.js';
import { validateIdentity, validatePatch } from '../web/shared/validate.js';

const PID = '0b6f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e';

test('preuve : texte affiché = texte enregistré, versions actuelles présentes', () => {
  for (const kind of Object.values(CURRENT)) for (const tv of Object.values(kind)) assert.ok(CONSENT_TEXTS[tv], tv);
  assert.match(CONSENT_TEXTS[CURRENT.transmission.self], /mon médecin traitant/);
  assert.match(CONSENT_TEXTS['T1-self'], /un médecin qui pourra suivre mon dossier/); // ancienne version conservée
});

test('preuve : empreinte SHA-256 vérifiable, toute modification détectée', async () => {
  const e = await makeEntry(PID, 'transmission', 1, 'self', 'T2-self', 1762870320000);
  assert.match(e.h, /^[0-9a-f]{64}$/);
  assert.equal(await verifyEntry(PID, e), true);
  assert.equal(await verifyEntry(PID, { ...e, v: 0 }), false); // décision inversée
  assert.equal(await verifyEntry(PID, { ...e, at: e.at + 60000 }), false); // date modifiée
  assert.equal(await verifyEntry(PID, { ...e, tv: 'T1-self' }), false); // autre texte
  assert.equal(await verifyEntry('autre-dossier', e), false); // copiée sur un autre patient
  assert.equal(await verifyEntry(PID, { ...e, h: undefined }), false);
  assert.equal(formatHash('abcdef0123456789'), 'ABCD EF01 2345 6789');
});

const base = { last_name: 'Diallo', first_name: 'Awa', birth_date: '1985-04-12', email: 'awa@exemple.be', consent: true };

test('médecin traitant : nom gardé seulement si la transmission est autorisée', () => {
  const yes = validateIdentity({ ...base, doctor_consent: true, gp_name: ' Dr. Jean-Marc  Lambert ' });
  assert.equal(yes.ok, true, JSON.stringify(yes.errors));
  assert.equal(yes.value.gp_name, 'Dr. Jean-Marc Lambert');
  assert.equal(validateIdentity({ ...base, doctor_consent: true }).value.gp_name, null); // facultatif
  assert.equal(validateIdentity({ ...base, doctor_consent: false, gp_name: 'Dr Lambert' }).value.gp_name, null); // minimisation
  assert.ok(validateIdentity({ ...base, doctor_consent: true, gp_name: '<script>' }).errors.gp_name);
});

test('médecin traitant : modification sur la fiche soignant validée', () => {
  assert.deepEqual(validatePatch({ gp_name: 'Dr Lambert' }).value, { gp_name: 'Dr Lambert' });
  assert.deepEqual(validatePatch({ gp_name: null }).value, { gp_name: null });
  assert.deepEqual(validatePatch({ gp_name: '  ' }).value, { gp_name: null });
  assert.ok(validatePatch({ gp_name: 42 }).errors.gp_name);
  assert.ok(validatePatch({ gp_name: 'x'.repeat(81) }).errors.gp_name);
});
