import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFeedback, validateFeedbackPatch } from '../web/shared/validate.js';

const RID = '7f3c2b9a-1d2e-4f5a-9b8c-7d6e5f4a3b2c';
const ok = { role: 'soignant', kind: 'proposition', message: 'Prévoir une 3e chaise\nà l’accueil', request_id: RID };

test('remarques : message minimal valide, nom et contact facultatifs', () => {
  const r = validateFeedback(ok);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.value.message, 'Prévoir une 3e chaise\nà l’accueil'); // saut de ligne conservé
  assert.equal(r.value.name, null);
  assert.equal(r.value.contact, null);
  const full = validateFeedback({ ...ok, name: 'Marie N’Diaye', contact: ' Marie@Exemple.BE ' });
  assert.equal(full.ok, true);
  assert.equal(full.value.name, "Marie N'Diaye");
  assert.equal(full.value.contact, 'marie@exemple.be');
  assert.equal(validateFeedback({ ...ok, contact: '0467 12 34 56' }).ok, true);
});

test('remarques : refus des champs invalides (fail-closed)', () => {
  const bad = (patch, field) => assert.ok(validateFeedback({ ...ok, ...patch }).errors[field], `${field} ${JSON.stringify(patch)}`);
  bad({ role: '' }, 'role');
  bad({ role: 'toString' }, 'role'); // pas de clé héritée du prototype
  bad({ role: 'admin' }, 'role');
  bad({ kind: 'spam' }, 'kind');
  bad({ message: '  ' }, 'message');
  bad({ message: 'ok' }, 'message');
  bad({ name: '<script>' }, 'name');
  bad({ contact: 'pas un contact' }, 'contact');
  bad({ request_id: 'x' }, 'request_id');
  bad({ request_id: undefined }, 'request_id');
});

test('remarques : texte borné et caractères de contrôle retirés', () => {
  const r = validateFeedback({ ...ok, message: `a\u0000b${'x'.repeat(5000)}` });
  assert.equal(r.ok, true);
  assert.equal(r.value.message.length, 3000);
  assert.ok(!r.value.message.includes('\u0000'));
});

test('remarques : mise à jour admin limitée à statut + notes', () => {
  assert.deepEqual(validateFeedbackPatch({ status: 'traite' }).value, { status: 'traite' });
  assert.equal(validateFeedbackPatch({ status: 'supprime' }).ok, false);
  assert.equal(validateFeedbackPatch({ message: 'modifié' }).ok, false);
  assert.deepEqual(validateFeedbackPatch({ admin_notes: '  ' }).value, { admin_notes: null });
});
