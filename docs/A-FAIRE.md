# CheckSanté — ce qui reste à faire

> ## ✅ Mise à jour du 11/11 : ce qu'il te reste à faire (le code est prêt)
> 📄 **Version PDF interactive** (cases à cocher, liens cliquables) : `docs/Reste-a-faire-CheckSante.pdf` (régénérer : `python3 scripts/reste_a_faire_pdf.py docs/Reste-a-faire-CheckSante.pdf`).
>
> **Déjà fait** : site officiel `seminaire-triage.incognitoresolve.workers.dev`, affiches PDF (`docs/affiches/`), page « Remarques » des intervenants, branche `main`, base D1 (ID saisi dans `wrangler.toml`), tableaux créés automatiquement, version téléphone + glassmorphism, accords qui scintillent, affiches QR A4, vidéo tutoriel (`docs/video/CheckSante-tutoriel.mp4`).
>
> | # | Où | Action | Durée |
> |---|---|---|---|
> | 1 | Cloudflare → Worker `seminaire-triage` → **Deployments** | Dernier déploiement = *Success* (sinon *Settings → Builds* : branche `main`, build `npm run build`, deploy `npx wrangler deploy`) | 2 min |
> | 2 | Site officiel | `https://seminaire-triage.incognitoresolve.workers.dev/` (QR codes des affiches) | — |
> | 3 | **Settings → Variables and Secrets** (type *Secret*) | `STAFF_PIN` (8+ car.) · `SESSION_SECRET` (32+ car. aléatoires) · `ADMIN_KEY` (16+ car., organisateur / responsable médical) · `PARTNER_KEY` (16+ car., toi seul). Sans eux : accès bloqué (sécurité) | 5 min |
> | 4 | Navigateur | `https://seminaire-triage.incognitoresolve.workers.dev/api/health` → `{"ok":true}` | 1 min |
> | 5 | 2 tablettes | Test réel : 2 inscriptions → *Liste des inscrits* (PIN) → fiche → **nom du soignant** → tension → visible sur l'autre tablette | 5 min |
> | 6 | `https://seminaire-triage.incognitoresolve.workers.dev/admin` + `ADMIN_KEY` | Effacer les tests : *Tout mettre à la corbeille* → *Vider* → *Effacer toutes les réponses* | 2 min |
> | 7 | `docs/affiches/` | **Imprimer les PDF prêts** : `affiche-inscription-A4.pdf` (« Pas envie d'attendre ? »). QR codes vérifiés vers `https://seminaire-triage.incognitoresolve.workers.dev/`. Impression : A4, taille réelle (100 %), couleur. Scanner une feuille imprimée pour vérifier. (Aussi en ligne : `/affiche`) | 10 min |
> | 8 | Envoyer à Claude | L'**e-mail de contact RGPD d'ICC Liège** (2 emplacements `[email-contact]` dans la politique de confidentialité) | 1 min |
> | 9 | Médecins | Relire l'assistant éducatif (README) et les seuils marqués « Seuil de prudence CheckSanté » | 15 min |
> | 10 | Sur place | PIN aux soignants uniquement · `ADMIN_KEY` à l'organisateur · tablettes chargées, veille désactivée · partage 4G de secours · diffuser la vidéo sur l'écran d'accueil | — |
> | 11 | `https://seminaire-triage.incognitoresolve.workers.dev/remarques` | **Partager le lien des remarques** aux soignants, médecins, intervenants, bénévoles (WhatsApp, e-mail) + affiche `docs/affiches/affiche-remarques-intervenants-A4.pdf`. Lecture : `/admin` + `ADMIN_KEY` → onglet **Remarques** | 5 min |
> | 12 | `/admin` → onglet **QR codes** | Tous les QR codes au même endroit : inscription sans attente, **check-up assurance-vie** (publicité), remarques des intervenants → **Copier le lien**, **Télécharger l'image (PNG)**, **Affiche A4** (`docs/affiches/affiche-checkup-assurance-A4.pdf`) | 5 min |
>
> Facultatif : nom de domaine (section E). **Aucun envoi automatique d'e-mail** : tout part manuellement depuis `/admin` → **Envois**.

Durées indicatives. Ordre recommandé : A → B → C → D → E (aujourd'hui), F → G (avant l'ouverture), H (pendant), I (après).

---

## A. GitHub — créer la branche `main` ✅ FAIT

Le dépôt n'a qu'une branche : `ccr-7e184915-u0pmfk`. Cloudflare déploiera depuis `main`.

1. github.com → dépôt **seminaire**.
2. Menu déroulant des branches (en haut à gauche, affiche `ccr-7e184915-u0pmfk`) → taper `main` → **Create branch main from ccr-7e184915-u0pmfk**.
3. **Settings → General → Default branch** → icône ⇄ → choisir `main` → **Update**.

> Les futures modifications arriveront sur `ccr-7e184915-u0pmfk` : pour les mettre en ligne, **Pull requests → New** (base `main` ← compare `ccr-…`) → **Merge**.

---

## B. Cloudflare — base de données D1 ✅ FAIT (ID `522fae40-…` dans `wrangler.toml`)

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
7. Vérifier : `SELECT name FROM sqlite_master WHERE type='table';` → doit lister `patients`, `partner_leads`, `feedback`.

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
| `ADMIN_KEY` | clé de `/admin` : corbeille, remarques, **envois** (fiches des médecins traitants = données de santé) → **responsable médical** de préférence, **jamais** le partenaire ; **16 caractères minimum** | générateur de mot de passe |
| `PARTNER_KEY` | ta clé d'accès à « Mes contacts » sur `/admin`, **16 caractères minimum** | générateur de mot de passe ; à garder pour toi seul (les soignants n'en ont pas besoin) |

Les secrets s'appliquent immédiatement (nouvelle version déployée automatiquement).

---

## E. Nom de domaine (facultatif)

À décider **avant** d'imprimer de nouvelles affiches (les QR codes contiennent l'adresse du site).
1. Acheter `checksante.be` (ou autre) : Cloudflare **Domain Registration**, ou chez un registrar puis **Add a site** dans Cloudflare.
2. Worker → **Settings → Domains & Routes → Add → Custom domain** → `checksante.be`.
3. **SSL/TLS → Edge Certificates** : *Always Use HTTPS* = ON · *Minimum TLS* = 1.2.

> **Aucun envoi automatique d'e-mail** (plus de Brevo) : les personnes intéressées par le check-up sont recontactées à la main (onglet *Mes contacts*, modèle : `docs/modele-email-checkup.md`).

---

## F. Contenus à finaliser (15 min, éditables directement sur GitHub)

| Fichier | À faire |
|---|---|
| `public/confidentialite.html` | `[email-contact]` (2 fois) : envoie l'adresse à Claude |
| `web/shared/triage.js` | **faire valider les seuils par les médecins** ; modifier les nombres si besoin (tableau dans le README) |
| `web/shared/partner.js` | `address: ''` → ton adresse pro si tu veux l'afficher (facultatif) |

Chaque commit sur `main` redéploie automatiquement (≈ 1 min).

---

## G. Tests en ligne + nettoyage (20 min) — impératif avant l'ouverture

| # | Test | Résultat attendu |
|---|---|---|
| 1 | Ouvrir `https://seminaire-triage.incognitoresolve.workers.dev/api/health` | `{"ok":true}` |
| 2 | Inscrire 2 personnes à la suite (tablette d'accueil) | bandeau « ✓ … est inscrit(e) », formulaire vidé aussitôt |
| 3 | `/staff` sur 2 tablettes, saisir le PIN | pastille verte **Temps réel**, les inscrits apparaissent |
| 4 | Bouton **Liste des inscrits** → taper le nom → ouvrir la fiche | la fiche s'ouvre |
| 5 | Saisir pouls 135 sur une tablette | **Rouge** immédiat, visible sur l'autre tablette |
| 6 | **Patient suivant** sur A, puis sur B | A et B ouvrent deux patients différents |
| 7 | **Terminé** | la fiche se ferme, le patient quitte « À traiter » |
| 8 | Envoyer une remarque sur `/remarques` | `/admin` (ADMIN_KEY) → onglet **Remarques** : elle apparaît |
| 9 | S'inscrire en cochant le check-up | le contact apparaît dans `/admin` → *Mes contacts* (aucun e-mail automatique) |
| 10 | Mauvais PIN 11 fois | « Trop d'essais, patientez une minute » |
| 11 | Couper le Wi-Fi d'une tablette, saisir, rallumer | « Enregistré ✓ » après retour du réseau |

**Puis effacer toutes les données de test** (D1 → Console) :
```sql
DELETE FROM patients;
DELETE FROM feedback;
DELETE FROM partner_leads;
```

### Impression
- Ouvrir `https://seminaire-triage.incognitoresolve.workers.dev/affiche` → **Imprimer** (A4 ou A3, plusieurs exemplaires : entrée, file d'attente, chaises).
- Idem `https://seminaire-triage.incognitoresolve.workers.dev/affiche?cible=remarques` (salle des intervenants).
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
- Flux : **Liste des inscrits** → recherche par nom → **indiquer son nom (soignant / praticien)** → saisir les mesures → si « J'autorise » : **nom, prénom et coordonnées du médecin traitant**, ou cocher « pas de médecin traitant » → **Patient suivant** → **Terminé**. L'envoi au cabinet du médecin traitant est fait par l'admin (`/admin` → Envois).
- Tablette verrouillée (🔒) = nom du soignant effacé : le suivant indique le sien.
- Couleurs = aide indicative, le jugement clinique prime.
- Tablette laissée sans surveillance : 🔒 **Verrouiller**.

**Pendant**
- Surveiller l'en-tête « N en attente · attente moy. » ; temps en rouge = plus de 30 min.
- Problème après une mise à jour : Worker → **Deployments** → version précédente → **Rollback**.
- Journaux d'erreurs : Worker → **Observability / Logs**.

---

## I. Après l'événement

1. **Fiches pour les médecins traitants** (uniquement les personnes qui ont autorisé la transmission) : espace soignants → ouvrir la fiche →
   bouton **Fiche pour le médecin traitant (PDF)** → **Imprimer / Enregistrer en PDF** → envoyer le PDF au médecin traitant (nom indiqué sur la fiche).
   **Le plus simple** : `/admin` + `ADMIN_KEY` → onglet **Envois** → pour chaque personne : e-mail du médecin → *1. Fiche PDF* → *2. Préparer l'e-mail* (joindre le PDF) → *3. Marquer comme envoyée*.
   La fiche contient la **preuve de l'accord** (texte exact, date et heure, moyen, empreinte vérifiée). Envoi **de préférence par messagerie sécurisée**
   (eHealthBox) ; par e-mail classique, seulement à l'adresse du cabinet, en vérifiant le destinataire. Liste des personnes concernées — D1 Console :
   ```sql
   SELECT last_name, first_name, birth_date, gp_name, doctor_consent_at FROM patients
   WHERE doctor_consent = 1 AND deleted_at IS NULL ORDER BY last_name;
   ```
2. **Contacts check-up** (toi uniquement) : `https://seminaire-triage.incognitoresolve.workers.dev/admin` + ta clé `PARTNER_KEY` → onglet *Mes contacts*.
   Statut par contact (Nouveau → Contacté → Rendez-vous → Client), notes, bouton **Télécharger (Excel / CSV)**.
   Une relance maximum, « STOP » = bouton d'effacement (`docs/modele-email-checkup.md`).
   **Bilan anonyme** (bilan pour ICC, présentations) : espace soignants → **Bilan** → **Exporter le bilan (CSV)**.
3. **Sécurité** : supprimer ou changer le secret `STAFF_PIN` → plus aucun accès soignants.
4. **Effacement** : automatique (patients après 30 jours, contacts et remarques après 180 jours). Pour tout effacer plus tôt : mêmes `DELETE` qu'en G.
