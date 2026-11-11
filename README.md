# CheckSanté — Semaine de la santé · ICC Liège

Inscription, triage temps réel & questionnaire de prévention.

> Logo : croix médicale blanche sur fond bleu + check vert. **Ne jamais utiliser une croix rouge sur fond blanc** (emblème protégé, Conventions de Genève / loi belge du 4 juillet 1956).

Application temps réel pour les consultations de prévention (11–14 nov. 2026).
**Cloudflare Workers + D1 + Durable Objects**, front HTML/ES modules + Tailwind v4. Zéro framework, 2 dépendances runtime figées (`qrcode-generator`, `jsqr`).

## Pages

| URL | Public | Rôle |
|---|---|---|
| `/` | participants | Inscription (identité + accord consultation + transmission de ses données à un médecin qui pourra suivre son dossier) par l'accueil ; formulaire vidé aussitôt pour la personne suivante (aucun Pass, rien stocké sur la tablette) |
| `/questionnaire` | participants | Questionnaire de prévention **anonyme** (8 sections du PDF), IMC calculé en direct, repères affichés après envoi |
| `/staff` | soignants (PIN) | Liste temps réel triée par priorité, recherche instantanée par nom, fiche (vitaux, IMC, glycémie, périmètre abdo., notes), assignation Médecin 1 (mer. 11/11) / Médecin 2 (sam. 14/11), ajout manuel, stats questionnaire en direct |
| `/affiche` · `/affiche?cible=questionnaire` | accueil | Affiche imprimable avec QR d'entrée |
| `/partenaire?pour=public\|pro` | tous | Page **Publicité** du partenaire assurances + formulaire de recontact (opt-in distinct) |

## Optimisations « file d'attente »

Inscription **strictement individuelle** : un formulaire vierge par personne, aucun préremplissage ; les soignants retrouvent la personne par son nom.

| Point de friction | Solution |
|---|---|
| Date de naissance (sélecteur iOS à faire défiler) | Champ JJ/MM/AAAA au clavier numérique, « / » automatiques ; l'âge adapte les seuils et les conseils automatiques |
| Soignants qui appellent le même patient | Étapes **En attente → En consultation → Terminé** synchronisées en temps réel ; bouton **Patient suivant** = le plus prioritaire en attente (rouge > orange > à mesurer > vert, puis ancienneté), marqué « En consultation » pour tous |
| File qui ne se vide jamais | Vue « À traiter » par défaut ; « Terminé » ferme la fiche et retire le patient ; recherche toujours globale |
| Pilotage | Temps d'attente par patient (rouge ≥ 30 min), nombre en attente et attente moyenne en tête |
| Chargement en cascade sur réseau saturé | 1 seul fichier JS minifié par page (esbuild), préchargé |
| Coupure Wi-Fi | Service worker : les pages se rechargent hors ligne ; saisies soignants mises en file et renvoyées (outbox) |
| E-mails en double (même adresse partagée) | 1 seul e-mail check-up par adresse sur 7 jours |

## Architecture

```
navigateur ──HTTPS──► Worker (src/index.js) ──► D1 (patients, surveys)
     ▲                     │ après chaque écriture (waitUntil)
     └──── WebSocket ◄──── Durable Object Hub (hibernation, broadcast)
```
- **Optimistic UI** : chaque saisie s'applique localement à l'instant (triage recalculé côté client), part dans une *outbox* persistée (`localStorage`) et est envoyée en PATCH champ par champ (debounce 350 ms). Coupure Wi-Fi ⇒ rejouée au retour réseau.
- **Synchro** : WebSocket (push) + delta-sync `?since=` (fenêtre de chevauchement 5 s, dédup par `version`) + polling de secours 5 s si WebSocket indisponible.
- **Concurrence** : last-write-wins par champ ; triage serveur mis à jour conditionnellement à la `version`.
- **Code partagé** : `web/shared/{triage,validate}.js` utilisés par le navigateur ET le Worker (validation client UX + serveur sécurité, mêmes seuils).

> **Liste détaillée de tout ce qui reste à faire : [`docs/A-FAIRE.md`](docs/A-FAIRE.md)**

## Déploiement via le dashboard Cloudflare (dépôt GitHub connecté)

1. **Fusionner la branche de travail dans `main`** (ou choisir cette branche comme branche de production à l'étape 4).
2. **Créer la base D1** : *Storage & Databases → D1 → Create* · nom `seminaire` · emplacement **Western Europe** (ou juridiction UE).
   Copier son **Database ID** dans `wrangler.toml` (`database_id = "…"`), commit, push.
3. **Créer les tables** : D1 → `seminaire` → *Console* → coller puis exécuter le contenu de
   `migrations/0001_init.sql`, `0002_partner_leads.sql`, `0003_lead_mail.sql`, `0004_stage.sql`, puis `0005_doctor_consent.sql` (dans cet ordre). **Facultatif** : l'application crée et met à jour ses tableaux toute seule au premier accès.
4. **Connecter le dépôt** : *Workers & Pages → Create → Import a repository* → `seminaire`.
   - Nom du Worker : **`seminaire-triage`** (doit correspondre à `name` dans `wrangler.toml`)
   - Build command : `npm run build`
   - Deploy command : `npx wrangler deploy`
5. **Secrets** : Worker → *Settings → Variables and Secrets* → type **Secret** :
   - `STAFF_PIN` : **8 caractères minimum** (sinon l'accès staff est refusé, par sécurité)
   - `SESSION_SECRET` : 32+ caractères aléatoires (ex. `openssl rand -base64 48`)
   - `BREVO_API_KEY` + `MAIL_FROM` : e-mail automatique « check-up couverture » (voir ci-dessous). Sans eux, aucun e-mail n'est envoyé ; les demandes restent enregistrées.
6. *(Optionnel)* domaine perso : Worker → *Settings → Domains & Routes*, puis activer *SSL/TLS → Edge Certificates → Always Use HTTPS*.
7. **Vérifier** : `https://<worker>/api/health` → `{"ok":true}` ; inscription test ; `/staff` sur 2 appareils (pastille « Temps réel »).

## Structure

```
src/            Worker (API, D1, Durable Object, e-mail)
web/            sources front (modules ES) ; web/shared/ = code partagé navigateur + Worker
public/         fichiers servis (HTML, _headers, logo) ; public/dist + sw.js générés par `npm run build`
migrations/     schéma D1 (0001 → 0004)
scripts/build.mjs  bundle esbuild + service worker versionné
```

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

## Seuils de triage (`web/shared/triage.js`)

| Paramètre | Orange | Rouge |
|---|---|---|
| Pouls (bpm) | < 50 ou > 100 | < 40 ou > 130 |
| Température (°C) | < 36 ou ≥ 38 | < 35 ou ≥ 39,5 |
| Systolique (mmHg) | < 100 ou ≥ 140 | < 90 ou ≥ 180 |
| Diastolique (mmHg) | < 50 ou ≥ 90 | ≥ 110 |
| Glycémie capillaire (mg/dL) | < 70 ou ≥ 200 | < 54 ou ≥ 300 |
| IMC (poids/taille²) | < 18,5 ou ≥ 30 | — |

Le pire paramètre l'emporte ; aucune mesure = « À mesurer ». **Seuils indicatifs à faire valider par l'équipe médicale.**

**Adaptation à l'âge** (date de naissance) : seuils pédiatriques pour le pouls et la tension (1–5 ans, 6–11 ans) ; IMC adulte non appliqué avant 18 ans.
**Conseils automatiques** (fiche soignant, indicatifs) selon les valeurs ET l'âge : tension, pouls, fièvre, hypo/hyperglycémie, IMC, périmètre abdominal ; prévention selon l'âge (glycémie dès 45 ans, cholestérol dès 40 ans, dépistage colorectal 50–74 ans, vaccins dès 65 ans).

## Assistant médical éducatif (fiche soignant)

Moteur de règles **déterministe** (`web/shared/assistant.js`) — aucune IA générative, aucune donnée envoyée à un tiers.
Format imposé : 1. Note importante · 2. Niveau d'urgence (112 / urgence médicale / consultation 24–72 h / surveillance / probablement rassurant) · 3. Ce que j'ai compris · 4. Interprétation indicative · 5. Ce qu'il faut faire · 6. Quand contacter un professionnel · 7. Sources · 8. Rappel final.

- Paramètres : pouls, **respiration**, **SpO2**, température, tension, glycémie, IMC, périmètre abdominal ; **signes d'alerte** cochables (douleur thoracique, essoufflement, malaise, confusion, AVC, saignement → 112) ; contexte **grossesse**.
- Âge : nourrisson (mois), enfant 1–5 / 6–11 ans, adulte ; **score NEWS2** (RCP 2017) chez l'adulte.
- Sources (`web/shared/sources.js`, vérifiées le 11/11/2026) : RCP NEWS2, ESC 2024, NHS (SpO2), NICE NG143 et NG133, ADA 2025, OMS (diabète, IMC), Ligue Cardiologique Belge, 112.be, 1733, CCRef/Bruprev, CSS (grippe), vaccination-info.be. Références internationales signalées comme telles.
- Seuils **sans source officielle** marqués « Seuil de prudence CheckSanté » (tension de l'enfant, glycémie ≥ 300, fièvre adulte ≥ 39,5) : **à valider par les médecins**.
- Aucune prescription ni dose (test automatique).

## Sécurité & conformité

- **Accès staff** : PIN d'événement → cookie `__Host-` HttpOnly/Secure/SameSite=Strict signé HMAC (14 h). Changer `STAFF_PIN` ou `SESSION_SECRET` révoque toutes les sessions et ferme les WebSockets. Fail-closed si secrets absents (503).
- Anti-CSRF / cross-site WebSocket : contrôle strict de l'en-tête `Origin`.
- CSP stricte (`script-src 'self'`, aucun inline), HSTS, X-Frame-Options DENY, Permissions-Policy (caméra, micro, géolocalisation désactivés).
- Rate limiting natif par IP (inscription 120/min — un Wi-Fi partagé = une IP —, login 10/min, API 1200/min).
- Honeypot + idempotence (`request_id`) : double-clic ou réseau instable ⇒ jamais de doublon.
- Minimisation : e-mail et téléphone chargés uniquement à l'ouverture d'une fiche ; sans accord de transmission, aucune assignation à un médecin n'est possible (contrôle serveur) ; le questionnaire ne stocke ni identité ni IP.
- Droit à l'effacement (bouton fiche) : données écrasées immédiatement ; cron quotidien purge tout après `RETENTION_DAYS` (30 j).
- Logs Workers sans PII ; `/api/health` pour l'uptime monitoring.
- RGPD (Belgique) : données de santé (art. 9) ⇒ consentement explicite recueilli, D1 en juridiction UE. Compléter `[adresse]`/`[email-contact]` dans `confidentialite.html` et tenir le registre des traitements.

## Partenaire assurances (publicité)

Configuration unique : `web/shared/partner.js` (`enabled: false` masque tout, front et API).
Renseigné : Boris Y. AKOE, sous-agent pour Comopolis, FSMA n° 0803.683.897.
**Inscription FSMA = assurance-vie uniquement (IDD ILP/OLP)** : ne pas annoncer de produits non-vie tant que l'inscription n'est pas étendue.

Encarts identifiés « Publicité » (pratique commerciale loyale, CDE art. VI.97–VI.100) uniquement :
pied de l'inscription, fin du questionnaire (après les repères), bas de la liste staff (version « soignants », masquable).
**Jamais** dans une fiche patient, un résultat de triage ou les stats. Aucun ciblage selon les données de santé.

Demandes de contact : table `partner_leads` isolée (aucune jointure possible avec patients/questionnaires), purge à 180 j.
Check-up couverture : case facultative (non pré-cochée, distincte du consentement médical) dans le formulaire d’inscription ; cochée = demande de contact (nom/e-mail/téléphone uniquement). Modèle d'e-mail conforme : `docs/modele-email-checkup.md`.

**E-mail automatique** : chaque personne qui a donné son accord reçoit aussitôt l'e-mail « Votre check-up couverture gratuit » (mentions FSMA, désinscription en un clic → suppression immédiate des coordonnées). Personne d'autre ne reçoit d'e-mail.
Mise en place (≈ 10 min) :
1. Compte gratuit sur brevo.com (UE, 300 e-mails/jour).
2. *Senders, Domains* → ajouter **un domaine que tu possèdes** (ex. `checksante.be`) et copier les enregistrements DNS (DKIM/SPF) dans Cloudflare DNS. Une adresse `@gmail.com` ne peut pas servir d'expéditeur (rejetée par Gmail/Brevo) : les réponses arrivent quand même sur `yaoakoe.pro@gmail.com` (Reply-To).
3. *SMTP & API → API keys* → créer une clé.
4. Secrets du Worker : `BREVO_API_KEY` = la clé, `MAIL_FROM` = ex. `checkup@checksante.be`.

**Page `/admin`** — une seule page, la clé tapée détermine l'accès (cloisonnement RGPD) :
- `ADMIN_KEY` (organisateur / responsable médical) → **Corbeille** : les dossiers supprimés par les soignants y restent `TRASH_DAYS` (30) jours, puis sont effacés automatiquement ; *Restaurer*, *Supprimer définitivement* (droit à l'effacement), *Tout restaurer*, *Vider*, *Tout mettre à la corbeille* (ex. effacer les tests). Les changements apparaissent en temps réel sur les tablettes.
- `PARTNER_KEY` (partenaire) → **Mes contacts** (mini-CRM), jamais la corbeille. Les deux clés peuvent être saisies l'une après l'autre (« Ajouter une clé »).
- `/espace-partenaire` redirige vers `/admin`.

**Mes contacts (mini-CRM)** — cloisonné des soignants et de la corbeille :
statut de suivi (Nouveau / Contacté / Rendez-vous / Client), notes, téléphone et e-mail cliquables, export CSV Excel (anti-injection de formules), bouton STOP = effacement.
Après l'accord, la personne peut préciser en un geste son moment préféré et son sujet (dans le périmètre de son consentement).

**Bilan anonyme** — espace soignants → *Bilan* : inscriptions par jour, tranches d'âge, triage, taux d'accord, intérêt check-up, attente moyenne ; groupes < 5 masqués (k-anonymat) ; export CSV réutilisable librement (données non personnelles).

Export SQL (alternative) :
```bash
npx wrangler d1 execute seminaire --remote --command "SELECT datetime(created_at/1000,'unixepoch') AS date, audience, name, email, phone, interests, message FROM partner_leads ORDER BY created_at" --json > leads.json
```

## Checklist jour J

1. `npm run deploy`, vérifier `/api/health`.
2. Imprimer `/affiche` et `/affiche?cible=questionnaire`.
3. Communiquer le PIN aux soignants uniquement ; ouvrir `/staff` sur chaque tablette (pastille « Temps réel » verte).
4. Le formulaire papier de consentement reste utilisable : en saisie manuelle, cocher l'accord une fois le papier signé.
