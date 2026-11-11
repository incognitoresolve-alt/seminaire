import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_SITE, parseSite } from '../web/shared/site.js';

test('affiche : adresse publique acceptée, normalisée en origine https', () => {
  assert.equal(parseSite('seminaire-triage.abc.workers.dev'), 'https://seminaire-triage.abc.workers.dev');
  assert.equal(parseSite('  https://checksante.be/inscription  '), 'https://checksante.be');
  assert.equal(parseSite('HTTPS://CheckSante.be/'), 'https://checksante.be');
});

test('affiche : jamais localhost, réseau local, http, port ou identifiants (fail-closed)', () => {
  for (const bad of ['', '   ', 'localhost:8787', 'http://localhost:8787', 'https://localhost', '127.0.0.1', 'https://192.168.1.10',
    'https://10.0.0.2', 'https://172.20.0.1', 'https://[::1]', 'tablette.local', 'http://checksante.be', 'https://checksante.be:8443',
    'https://user:pw@checksante.be', 'javascript:alert(1)', 'ftp://checksante.be', 'checksante', 'https://a b.be']) {
    assert.equal(parseSite(bad), null, bad);
  }
});

test('affiche : le site officiel est une adresse valide', () => {
  assert.equal(parseSite(OFFICIAL_SITE), OFFICIAL_SITE);
});
