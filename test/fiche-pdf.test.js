import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildFichePdf, winAnsi } from '../web/fiche-pdf.js';
import { ficheModel } from '../web/shared/fiche-model.js';

const at = Date.UTC(2026, 10, 12, 9, 30);
const data = (patient = {}) => ({
  generated_at: at + 3600e3,
  patient: {
    id: 'a1b2', short_code: 'K7Q2', last_name: 'Łukasz-DIALLO', first_name: 'Awa Ève', birth_date: '1970-03-05', email: 'awa@exemple.be', phone: '0470 12 34 56',
    sys: 165, dia: 98, pulse: 88, spo2: 97, temp: 37.2, weight: 82.5, height: 170, triage: 3, alerts: 'douleur_thoracique,grossesse',
    practitioner: 'Inf. Marie Dupont', notes: 'Céphalées depuis 3 jours ✓ 🙂', gp_name: 'Dr Martin', gp_contact: '04 123 45 67', created_at: at, no_gp: 0, ...patient,
  },
  proof: {
    transmission: { at, text: 'J’autorise la transmission de mes données personnelles à mon médecin traitant.', channel: 'Formulaire en ligne' },
    entries: [
      { k: 'consultation', v: 1, at, kind: 'Consultation de prévention', channel: 'Formulaire en ligne', ok: true },
      { k: 'transmission', v: 1, at, kind: 'Transmission au médecin traitant', channel: 'Formulaire en ligne', ok: true },
      { k: 'eglise', v: 1, at, kind: 'Rapport à ICC Liège (fonction retirée)', channel: 'x', ok: true },
    ],
    seal: 'ab'.repeat(32), intact: true, legacy: false,
  },
});

test('winAnsi : caractères non encodables remplacés, accents français conservés', () => {
  assert.equal(winAnsi('Ève « été » – œuvre’s €'), 'Ève « été » – œuvre’s €');
  assert.equal(winAnsi('SpO₂ ≥ 95 ✓'), 'SpO2 >= 95 ');
  assert.equal(winAnsi('Łukasz 🙂 ɛɔ'), 'Lukasz ? eo');
});

test('modèle de fiche : même contenu que la page, ancien accord ICC exclu', () => {
  const m = ficheModel(data());
  assert.equal(m.fileName, 'Fiche-Lukasz-DIALLO-Awa-Eve-2026-11-12.pdf');
  assert.deepEqual(m.patient[0], ['Nom et prénom', 'Łukasz-DIALLO Awa Ève']);
  assert.ok(m.consult.some(([k, v]) => k === 'Tension artérielle' && v === '165/98 mmHg'));
  assert.ok(m.consult.some(([k, v]) => k === 'Priorité (triage indicatif)' && v === 'Rouge'));
  assert.equal(m.history.length, 2);
  assert.deepEqual(ficheModel(data({ sys: null, dia: null, pulse: null, spo2: null, temp: null, weight: null, height: null })).consult[0], ['Paramètres', 'Aucun paramètre relevé']);
});

test('PDF : valide, A4, titré, plusieurs pages si notes longues', async () => {
  const { bytes, fileName } = await buildFichePdf(data());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  assert.match(fileName, /\.pdf$/);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.match(doc.getTitle(), /Fiche médecin traitant/);
  const long = await buildFichePdf(data({ notes: 'Observation détaillée. '.repeat(400), no_gp: 1, gp_name: null }));
  assert.ok((await PDFDocument.load(long.bytes)).getPageCount() >= 2);
});
