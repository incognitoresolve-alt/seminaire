# CheckSanté — ce qui reste à faire

Durées indicatives. Ordre recommandé : A → B → C → D → E (aujourd'hui), F → G (avant l'ouverture), H (pendant), I (après).

---

## A. GitHub — créer la branche `main` (2 min)

Le dépôt n'a qu'une branche : `ccr-7e184915-u0pmfk`. Cloudflare déploiera depuis `main`.

1. github.com → dépôt **seminaire**.
2. Menu déroulant des branches (en haut à gauche, affiche `ccr-7e184915-u0pmfk`) → taper `main` → **Create branch main from ccr-7e184915-u0pmfk**.
3. **Settings → General → Default branch** → icône ⇄ → choisir `main` → **Update**.

> Les futures modifications arriveront sur `ccr-7e184915-u0pmfk` : pour les mettre en ligne, **Pull requests → New** (base `main` ← compare `ccr-…`) → **Merge**.

---

## B. Cloudflare — base de données D1 (5 min)

1. dash.cloudflare.com → **Storage & Databases → D1 SQL Database → Create**.
2. Nom : `seminaire` · Location : **Western Europe (WEUR)** (ou juridiction **EU** si proposée) → **Create**.
3. Sur la page de la base, copier le **Database ID** (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. GitHub → branche `main` → fichier `wrangler.toml` → ✏️ (Edit) → ligne 17 :
   `database_id = "00000000-0000-0000-0000-000000000000"` → remplacer par l'ID copié → **Commit changes**.

### Créer les tables (FACULTATIF : l'application les crée toute seule au premier accès)
5. D1 → `seminaire` → onglet **Console**.
6. Pour chaque fichier, **dans cet ordre** : `migrations/0001_init.sql`, `0002_partner_leads.sql`, `0003_lead_mail.sql`, `0004_stage.sql`, `0005_doctor_consent.sql`
   - GitHub → ouvrir le fichier → bouton **Raw** → tout copier → coller dans la console → **Execute**.
   - Si la console refuse plusieurs instructions d'un coup : exécuter les blocs `CREATE …;` / `ALTER …;` un par un.
   - Ne lancer chaque fichier **qu'une fois** (relancer 0003/0004 donne « duplicate column » : sans gravité, déjà fait).
7. Vérifier : `SELECT name FROM sqlite_master WHERE type='table';` → doit lister `patients`, `surveys`, `partner_leads`.

---

## C. Cloudflare — déployer le Worker depuis GitHub (10 min)

1. **Workers & Pages → Create → Workers → Import a repository**.
2. Connecter GitHub (autoriser l'application Cloudflare sur le dépôt **seminaire**).
3. Réglages :
   | Champ | Valeur |
   |---|---|
   | Project name | `seminaire-triage` (**exactement**, = `name` de `wrangler.toml`) |
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | `/` |
4. **Save and Deploy** → suivre les logs : doit finir par *Success*. Node 22 est imposé par le fichier `.node-version`.
5. Noter l'adresse : `https://seminaire-triage.<ton-sous-domaine>.workers.dev`.

> Si le build échoue sur `database_id` : l'étape B.4 n'est pas faite sur `main`.

---

## D. Secrets (5 min) — sans eux l'accès soignants est bloqué (sécurité)

Worker `seminaire-triage` → **Settings → Variables and Secrets → Add** → Type **Secret** :

| Nom | Valeur | Comment la créer |
|---|---|---|
| `STAFF_PIN` | code d'accès soignants, **8 caractères minimum** | ex. 8 chiffres aléatoires (pas une date de naissance). À donner **uniquement** aux soignants |
| `SESSION_SECRET` | 32+ caractères aléatoires | Mac/Linux : `openssl rand -base64 48` ; sinon générateur de mot de passe (64 caractères) |
| `BREVO_API_KEY` | clé API Brevo | voir étape E (facultatif) |
| `MAIL_FROM` | ex. `checkup@checksante.be` | voir étape E (facultatif) |

Les secrets s'appliquent immédiatement (nouvelle version déployée automatiquement).

---

## E. Domaine + e-mails Brevo (20–30 min, facultatif mais recommandé)

### E1. Domaine (à décider AVANT d'imprimer les affiches)
1. Acheter `checksante.be` (ou autre) : Cloudflare **Domain Registration**, ou chez un registrar puis **Add a site** dans Cloudflare.
2. Worker → **Settings → Domains & Routes → Add → Custom domain** → `checksante.be`.
3. **SSL/TLS → Edge Certificates** : *Always Use HTTPS* = ON · *Minimum TLS* = 1.2.

> Sans domaine : l'adresse `workers.dev` fonctionne, mais les e-mails automatiques ne sont pas possibles (Brevo exige un domaine à soi).

### E2. Brevo (e-mail automatique « check-up couverture »)
1. Créer un compte sur brevo.com (gratuit, 300 e-mails/jour). **Faire la demande aujourd'hui** : l'activation de l'envoi peut demander une validation du compte.
2. **Senders, Domains & Dedicated IPs → Domains → Add a domain** → `checksante.be` → Brevo affiche des enregistrements DNS (code Brevo, DKIM, DMARC).
3. Cloudflare → domaine → **DNS → Records → Add record** : recopier **chacun** (type, nom, valeur), proxy **désactivé** (nuage gris) → revenir dans Brevo → **Verify** (vert partout).
4. **Senders → Add a sender** : nom `Boris Y. AKOE · CheckSanté`, e-mail `checkup@checksante.be`.
5. **SMTP & API → API Keys → Generate** → copier la clé.
6. Secrets (étape D) : `BREVO_API_KEY` = la clé · `MAIL_FROM` = `checkup@checksante.be`.

Sans Brevo : les demandes de check-up sont enregistrées quand même ; tu leur écris toi-même (modèle : `docs/modele-email-checkup.md`).

---

## F. Contenus à finaliser (15 min, éditables directement sur GitHub)

| Fichier | À faire |
|---|---|
| `public/confidentialite.html` | remplacer `[adresse]` (adresse d'ICC Liège) et `[email-contact]` (2 fois) |
| `web/shared/triage.js` | **faire valider les seuils par les médecins** ; modifier les nombres si besoin (tableau dans le README) |
| `web/staff.js` (ligne `const DOCTORS`) | si souhaité, mettre le nom des médecins : `label: 'Dr Dupont · Mer. 11/11'` |
| `web/shared/partner.js` | `address: ''` → ton adresse pro si tu veux l'afficher (facultatif) |

Chaque commit sur `main` redéploie automatiquement (≈ 1 min).

---

## G. Tests en ligne + nettoyage (20 min) — impératif avant l'ouverture

| # | Test | Résultat attendu |
|---|---|---|
| 1 | Ouvrir `https://<adresse>/api/health` | `{"ok":true}` |
| 2 | S'inscrire depuis un téléphone en 4G, puis un autre en Wi-Fi | Pass affiché en moins de 1 s |
| 3 | `/staff` sur 2 tablettes, saisir le PIN | pastille verte **Temps réel**, les inscrits apparaissent |
| 4 | **Scanner** le Pass avec un **iPhone** puis un **Android** (autoriser la caméra) | la fiche s'ouvre |
| 5 | Saisir pouls 135 sur une tablette | **Rouge** immédiat, visible sur l'autre tablette |
| 6 | **Patient suivant** sur A, puis sur B | A et B ouvrent deux patients différents |
| 7 | **Terminé** | la fiche se ferme, le patient quitte « À traiter » |
| 8 | Remplir `/questionnaire` | bouton **Questionnaire** côté soignants : réponse comptée |
| 9 | S'inscrire en cochant le check-up (si Brevo) | e-mail reçu (vérifier les spams) ; le lien « Ne plus recevoir » fonctionne |
| 10 | Mauvais PIN 11 fois | « Trop d'essais, patientez une minute » |
| 11 | Couper le Wi-Fi d'une tablette, saisir, rallumer | « Enregistré ✓ » après retour du réseau |

**Puis effacer toutes les données de test** (D1 → Console) :
```sql
DELETE FROM patients;
DELETE FROM surveys;
DELETE FROM partner_leads;
```

### Impression
- Ouvrir `https://<adresse>/affiche` → **Imprimer** (A4 ou A3, plusieurs exemplaires : entrée, file d'attente, chaises).
- Idem `https://<adresse>/affiche?cible=questionnaire` (salle de présentation).
- **Scanner une affiche imprimée** avec un téléphone pour vérifier.

---

## H. Jour J — organisation (11–14/11)

**Matériel**
- Tablettes chargées + multiprises ; veille d'écran désactivée (Réglages → Affichage → Verrouillage auto : Jamais).
- Sur chaque tablette : ouvrir `/staff`, **Partager → Sur l'écran d'accueil** (ouverture en un geste).
- Partage de connexion 4G de secours pour les tablettes soignants.
- Quelques formulaires papier de consentement + bouton **Ajouter manuellement** (cocher l'accord une fois le papier signé).

**Briefing soignants (5 min)**
- Code PIN : ne jamais le donner aux participants.
- Flux : **Scanner** (ou recherche nom / code de secours) → saisir les mesures → assigner **Médecin 1 / Médecin 2** → **Patient suivant** → **Terminé**.
- Couleurs = aide indicative, le jugement clinique prime.
- Tablette laissée sans surveillance : 🔒 **Verrouiller**.

**Pendant**
- Surveiller l'en-tête « N en attente · attente moy. » ; temps en rouge = plus de 30 min.
- Problème après une mise à jour : Worker → **Deployments** → version précédente → **Rollback**.
- Journaux d'erreurs : Worker → **Observability / Logs**.

---

## I. Après l'événement

1. **Dossiers par médecin** (uniquement les personnes qui ont autorisé la transmission) — D1 Console :
   ```sql
   SELECT doctor, last_name, first_name, birth_date, pulse, temp, sys, dia, glucose, weight, height, waist, notes, triage
   FROM patients WHERE doctor_consent = 1 AND doctor IS NOT NULL AND deleted_at IS NULL ORDER BY doctor, triage DESC;
   ```
   `doctor` = 1 (Médecin 1, mercredi) ou 2 (Médecin 2, samedi). Transmettre **par un moyen sécurisé** (eHealthBox, messagerie santé), **jamais par Gmail**.
2. **Contacts check-up** (toi uniquement) :
   ```sql
   SELECT datetime(created_at/1000,'unixepoch') AS date, name, email, phone, interests, mailed_at IS NOT NULL AS email_envoye
   FROM partner_leads ORDER BY created_at;
   ```
   Une relance maximum, « STOP » = suppression (`docs/modele-email-checkup.md`).
3. **Sécurité** : supprimer ou changer le secret `STAFF_PIN` → plus aucun accès soignants.
4. **Effacement** : automatique (patients et questionnaires après 30 jours, contacts après 180 jours). Pour tout effacer plus tôt : mêmes `DELETE` qu'en G.
