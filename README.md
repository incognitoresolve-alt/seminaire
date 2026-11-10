# CheckSanté — Semaine de la santé · ICC Liège

Inscription, triage temps réel & questionnaire de prévention.

> Logo : croix médicale blanche sur fond bleu + check vert. **Ne jamais utiliser une croix rouge sur fond blanc** (emblème protégé, Conventions de Genève / loi belge du 4 juillet 1956).

Application temps réel pour les consultations de prévention (11–14 nov. 2026).
**Cloudflare Workers + D1 + Durable Objects**, front HTML/ES modules + Tailwind v4. Zéro framework, 2 dépendances runtime figées (`qrcode-generator`, `jsqr`).

## Pages

| URL | Public | Rôle |
|---|---|---|
| `/` | participants | Inscription (identité + accord consultation + transmission médecin traitant) → **Pass Patient** (QR + code de secours 6 car.) |
| `/questionnaire` | participants | Questionnaire de prévention **anonyme** (8 sections du PDF), IMC calculé en direct, repères affichés après envoi |
| `/staff` | soignants (PIN) | Liste temps réel triée par priorité, recherche instantanée, scanner QR, fiche (vitaux, IMC, glycémie, périmètre abdo., notes), assignation Médecin 1 (mer. 11/11) / Médecin 2 (sam. 14/11), ajout manuel, stats questionnaire en direct |
| `/affiche` · `/affiche?cible=questionnaire` | accueil | Affiche imprimable avec QR d'entrée |
| `/partenaire?pour=public\|pro` | tous | Page **Publicité** du partenaire assurances + formulaire de recontact (opt-in distinct) |

## Architecture

```
navigateur ──HTTPS──► Worker (src/index.js) ──► D1 (patients, surveys)
     ▲                     │ après chaque écriture (waitUntil)
     └──── WebSocket ◄──── Durable Object Hub (hibernation, broadcast)
```
- **Optimistic UI** : chaque saisie s'applique localement à l'instant (triage recalculé côté client), part dans une *outbox* persistée (`localStorage`) et est envoyée en PATCH champ par champ (debounce 350 ms). Coupure Wi-Fi ⇒ rejouée au retour réseau.
- **Synchro** : WebSocket (push) + delta-sync `?since=` (fenêtre de chevauchement 5 s, dédup par `version`) + polling de secours 5 s si WebSocket indisponible.
- **Concurrence** : last-write-wins par champ ; triage serveur mis à jour conditionnellement à la `version`.
- **Code partagé** : `public/js/shared/{triage,validate}.js` utilisés par le navigateur ET le Worker (validation client UX + serveur sécurité, mêmes seuils).

## Déploiement via le dashboard Cloudflare (dépôt GitHub connecté)

1. **Fusionner la branche de travail dans `main`** (ou choisir cette branche comme branche de production à l'étape 4).
2. **Créer la base D1** : *Storage & Databases → D1 → Create* · nom `seminaire` · emplacement **Western Europe** (ou juridiction UE).
   Copier son **Database ID** dans `wrangler.toml` (`database_id = "…"`), commit, push.
3. **Créer les tables** : D1 → `seminaire` → *Console* → coller puis exécuter le contenu de
   `migrations/0001_init.sql`, puis celui de `migrations/0002_partner_leads.sql`.
4. **Connecter le dépôt** : *Workers & Pages → Create → Import a repository* → `seminaire`.
   - Nom du Worker : **`seminaire-triage`** (doit correspondre à `name` dans `wrangler.toml`)
   - Build command : `npm run build`
   - Deploy command : `npx wrangler deploy`
5. **Secrets** : Worker → *Settings → Variables and Secrets* → type **Secret** :
   - `STAFF_PIN` : **8 caractères minimum** (sinon l'accès staff est refusé, par sécurité)
   - `SESSION_SECRET` : 32+ caractères aléatoires (ex. `openssl rand -base64 48`)
6. *(Optionnel)* domaine perso : Worker → *Settings → Domains & Routes*, puis activer *SSL/TLS → Edge Certificates → Always Use HTTPS*.
7. **Vérifier** : `https://<worker>/api/health` → `{"ok":true}` ; inscription test ; `/staff` sur 2 appareils (pastille « Temps réel »).

## Installation (ligne de commande)

```bash
npm ci
npx wrangler login
npx wrangler d1 create seminaire --jurisdiction eu      # copier database_id dans wrangler.toml
npx wrangler secret put STAFF_PIN                        # code d'accès soignants (≥ 6 chiffres)
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
npm run db:migrate
npm run deploy
```

Dev local :
```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev              # http://localhost:8787  (staff : /staff, PIN 24681357)
npm test                 # tests unitaires triage/validation
```

Domaine perso : décommenter `routes` dans `wrangler.toml`, activer *Always Use HTTPS* dans Cloudflare.

## Seuils de triage (`public/js/shared/triage.js`)

| Paramètre | Orange | Rouge |
|---|---|---|
| Pouls (bpm) | < 50 ou > 100 | < 40 ou > 130 |
| Température (°C) | < 36 ou ≥ 38 | < 35 ou ≥ 39,5 |
| Systolique (mmHg) | < 100 ou ≥ 140 | < 90 ou ≥ 180 |
| Diastolique (mmHg) | < 50 ou ≥ 90 | ≥ 110 |
| Glycémie capillaire (mg/dL) | < 70 ou ≥ 200 | < 54 ou ≥ 300 |
| IMC (poids/taille²) | < 18,5 ou ≥ 30 | — |

Le pire paramètre l'emporte ; aucune mesure = « À mesurer ». **Seuils indicatifs à faire valider par l'équipe médicale.**

## Sécurité & conformité

- **Accès staff** : PIN d'événement → cookie `__Host-` HttpOnly/Secure/SameSite=Strict signé HMAC (14 h). Changer `STAFF_PIN` ou `SESSION_SECRET` révoque toutes les sessions et ferme les WebSockets. Fail-closed si secrets absents (503).
- Anti-CSRF / cross-site WebSocket : contrôle strict de l'en-tête `Origin`.
- CSP stricte (`script-src 'self'`, aucun inline), HSTS, X-Frame-Options DENY, Permissions-Policy (caméra seulement).
- Rate limiting natif par IP (inscription 120/min — un Wi-Fi partagé = une IP —, login 10/min, API 1200/min).
- Honeypot + idempotence (`request_id`) : double-clic ou réseau instable ⇒ jamais de doublon.
- Minimisation : e-mail, téléphone et coordonnées du médecin traitant chargés uniquement à l'ouverture d'une fiche ; supprimés si la transmission est refusée ; le questionnaire ne stocke ni identité ni IP.
- Droit à l'effacement (bouton fiche) : données écrasées immédiatement ; cron quotidien purge tout après `RETENTION_DAYS` (30 j).
- Logs Workers sans PII ; `/api/health` pour l'uptime monitoring.
- RGPD (Belgique) : données de santé (art. 9) ⇒ consentement explicite recueilli, D1 en juridiction UE. Compléter `[adresse]`/`[email-contact]` dans `confidentialite.html` et tenir le registre des traitements.

## Partenaire assurances (publicité)

Configuration unique : `public/js/shared/partner.js` (`enabled: false` masque tout, front et API).
Renseigné : Boris Y. AKOE, sous-agent pour Comopolis, FSMA n° 0803.683.897.
**Inscription FSMA = assurance-vie uniquement (IDD ILP/OLP)** : ne pas annoncer de produits non-vie tant que l'inscription n'est pas étendue.

Encarts identifiés « Publicité » (pratique commerciale loyale, CDE art. VI.97–VI.100) uniquement :
pied de l'inscription, fin du questionnaire (après les repères), bas de la liste staff (version « soignants », masquable).
**Jamais** dans une fiche patient, un Pass, un résultat de triage ou les stats. Aucun ciblage selon les données de santé.

Demandes de contact : table `partner_leads` isolée (aucune jointure possible avec patients/questionnaires), purge à 180 j.
Check-up couverture : case facultative (non pré-cochée, distincte du consentement médical) dans le formulaire d’inscription ; cochée = demande de contact (nom/e-mail/téléphone uniquement). Modèle d'e-mail conforme : `docs/modele-email-checkup.md`.

Export pour le partenaire :
```bash
npx wrangler d1 execute seminaire --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS date, audience, name, email, phone, interests, message FROM partner_leads ORDER BY created_at" --json > leads.json
```

## Checklist jour J

1. `npm run deploy`, vérifier `/api/health`.
2. Imprimer `/affiche` et `/affiche?cible=questionnaire`.
3. Communiquer le PIN aux soignants uniquement ; ouvrir `/staff` sur chaque tablette (pastille « Temps réel » verte).
4. Le formulaire papier de consentement reste utilisable : en saisie manuelle, cocher l'accord une fois le papier signé.
