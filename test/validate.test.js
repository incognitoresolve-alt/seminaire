import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVital, validateIdentity, validatePatch, validateSurvey } from '../web/shared/validate.js';

const ok = { last_name: 'Dupont-Élise', first_name: "Anne-Marie d'Arc", birth_date: '1980-02-29', email: 'A@b.fr', consent: true, doctor_consent: false };

test('identité valide + email normalisé', () => {
  const r = validateIdentity(ok);
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.value.email, 'a@b.fr');
});
test('consentement obligatoire', () => assert.ok(validateIdentity({ ...ok, consent: 'true' }).errors.consent));
test('date impossible refusée', () => assert.ok(validateIdentity({ ...ok, birth_date: '1981-02-29' }).errors.birth_date));
test('date future refusée', () => assert.ok(validateIdentity({ ...ok, birth_date: '2999-01-01' }).errors.birth_date));
test('injection HTML refusée', () => assert.ok(validateIdentity({ ...ok, last_name: '<script>' }).errors.last_name));
test('request_id doit être un UUID', () => assert.ok(validateIdentity({ ...ok, request_id: 'x' }).errors.request_id));

test('parseVital : virgule, arrondi, bornes', () => {
  assert.equal(parseVital('temp', '37,46'), 37.5);
  assert.equal(parseVital('pulse', '72'), 72);
  assert.equal(parseVital('pulse', ''), null);
  assert.ok(Number.isNaN(parseVital('pulse', '5')));
  assert.ok(Number.isNaN(parseVital('temp', 'abc')));
});

test('patch : whitelist stricte', () => {
  assert.ok(validatePatch({ pulse: 80, doctor: 2, notes: 'ok' }).ok);
  assert.ok(validatePatch({ pulse: null }).ok);
  assert.ok(validatePatch({ triage: 3 }).errors.triage);
  assert.ok(validatePatch({ 'pulse = 1; --': 1 }).errors);
  assert.ok(validatePatch({ doctor: 3 }).errors.doctor);
  assert.ok(validatePatch({ pulse: '80' }).errors.pulse);
  assert.ok(!validatePatch({}).ok);
  assert.ok(!validatePatch([]).ok);
});

test('transmission au médecin de la consultation (choix obligatoire)', () => {
  assert.ok(validateIdentity({ ...ok, doctor_consent: undefined }).errors.doctor_consent);
  assert.ok(validateIdentity({ ...ok, doctor_consent: 'oui' }).errors.doctor_consent);
  assert.ok(validateIdentity({ ...ok, doctor_consent: true }).ok);
  assert.ok(validatePatch({ doctor_consent: 0 }).ok);
  assert.ok(validatePatch({ gp_consent: 1 }).errors.gp_consent); // ancien champ refusé
});

test('questionnaire : taille en m ou cm, choix bornés', () => {
  assert.equal(validateSurvey({ height: '1,72' }).value.height, 1.72);
  assert.equal(validateSurvey({ height: '172' }).value.height, 1.72);
  assert.ok(validateSurvey({ activity_freq: '9' }).errors.activity_freq);
  assert.ok(validateSurvey({ screen_hours: '30' }).errors.screen_hours);
  assert.ok(validateSurvey({}).ok);
});

import { validateLead } from '../web/shared/validate.js';
test('lead partenaire : opt-in distinct, contact requis, intérêts whitelistés', () => {
  const base = { audience: 'pro', name: 'Jean Dupont', email: 'j@d.be', interests: ['plci'], consent: true };
  assert.ok(validateLead(base).ok);
  assert.ok(validateLead({ ...base, consent: undefined }).errors.consent);
  assert.ok(validateLead({ ...base, email: '' }).errors.email);
  assert.ok(validateLead({ ...base, interests: ['obseques'] }).errors.interests); // obsèques = public uniquement
  assert.ok(validateLead({ ...base, interests: ['rc_pro'] }).errors.interests); // non-vie : hors inscription FSMA
  assert.ok(validateLead({ ...base, audience: 'x' }).errors.audience);
});

import { toIsoDate } from '../web/shared/validate.js';
test('date JJ/MM/AAAA → ISO', () => {
  assert.equal(toIsoDate('05/03/1975'), '1975-03-05');
  assert.equal(toIsoDate('5/3/1975'), '1975-03-05');
  assert.equal(toIsoDate('1975-03-05'), '1975-03-05');
  assert.equal(toIsoDate('31/02/1975'), '1975-02-31'); // rejetée ensuite par validateIdentity
  assert.ok(validateIdentity({ ...ok, birth_date: toIsoDate('31/02/1975') }).errors.birth_date);
});
test('étape du parcours', () => {
  assert.ok(validatePatch({ stage: 2 }).ok);
  assert.ok(validatePatch({ stage: 5 }).errors.stage);
  assert.ok(validatePatch({ stage_at: 1 }).errors.stage_at); // horodatage réservé au serveur
});
