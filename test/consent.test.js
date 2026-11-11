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

test('inscription inchangée : aucun champ médecin traitant (saisi ensuite par le soignant)', () => {
  const r = validateIdentity({ ...base, doctor_consent: true, gp_name: 'Dr Lambert', gp_contact: 'x' });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal('gp_name' in r.value, false);
  assert.equal('gp_contact' in r.value, false);
});

test('médecin traitant : nom et coordonnées saisis sur la fiche soignant, validés', () => {
  assert.deepEqual(validatePatch({ gp_name: 'Dr Lambert' }).value, { gp_name: 'Dr Lambert' });
  assert.deepEqual(validatePatch({ gp_name: null }).value, { gp_name: null });
  assert.deepEqual(validatePatch({ gp_name: '  ' }).value, { gp_name: null });
  assert.ok(validatePatch({ gp_name: 42 }).errors.gp_name);
  assert.ok(validatePatch({ gp_name: 'x'.repeat(81) }).errors.gp_name);
  assert.deepEqual(validatePatch({ gp_contact: ' 04 222 33 44 · cabinet@exemple.be ' }).value, { gp_contact: '04 222 33 44 · cabinet@exemple.be' });
  assert.deepEqual(validatePatch({ gp_address: 'Rue X 1\n4000 Liège' }).value, { gp_address: 'Rue X 1\n4000 Liège' });
  assert.deepEqual(validatePatch({ gp_contact: '' }).value, { gp_contact: null });
  assert.ok(validatePatch({ gp_contact: 'x'.repeat(201) }).errors.gp_contact);
  assert.ok(validatePatch({ gp_address: 12 }).errors.gp_address);
  assert.equal(validatePatch({ gp_contact: 'a\u0000b' }).value.gp_contact.includes('\u0000'), false);
});

test('envois manuels : e-mail du médecin traitant validé', async () => {
  const { validateEmail } = await import('../web/shared/validate.js');
  assert.deepEqual(validateEmail(' Cabinet.Renard@Exemple.be '), { ok: true, value: 'cabinet.renard@exemple.be' });
  assert.deepEqual(validateEmail(''), { ok: true, value: null });
  assert.deepEqual(validateEmail(null), { ok: true, value: null });
  assert.equal(validateEmail('pas-un-email').ok, false);
  assert.equal(validateEmail('a@b.be?cc=x@y.be').ok, false); // pas d'injection d'en-tête mailto
  assert.equal(validateEmail(42).ok, false);
  assert.deepEqual(validatePatch({ gp_email: 'Cabinet@Exemple.be' }).value, { gp_email: 'cabinet@exemple.be' });
  assert.ok(validatePatch({ gp_email: 'cabinet' }).errors.gp_email);
});
