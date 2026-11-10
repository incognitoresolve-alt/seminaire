# Modèle d'e-mail — check-up couverture (CheckSanté)

> **Le premier e-mail part désormais automatiquement** (src/mail.js) dès qu'une personne donne son accord. Ce modèle sert à une éventuelle relance manuelle (une seule).

**À n'envoyer qu'aux personnes présentes dans `partner_leads`** (elles ont cliqué « Oui » ou rempli le formulaire partenaire).
Jamais aux autres inscrits : leur e-mail a été donné pour la consultation, pas pour de la prospection.

Export des contacts :
```bash
npx wrangler d1 execute seminaire --remote --json --command \
  "SELECT datetime(created_at/1000,'unixepoch') AS date, name, email, phone, interests FROM partner_leads ORDER BY created_at"
```

---

**Objet :** Votre check-up couverture gratuit – suite à la Semaine de la santé ICC Liège

Bonjour [Prénom],

Lors de la Semaine de la santé d'ICC Liège, vous avez souhaité faire le point sur votre couverture. Merci pour votre confiance.

Je vous propose un échange de 20 minutes, gratuit et sans engagement, par téléphone ou en rendez-vous, pour regarder ensemble :
- votre épargne-pension et la préparation de votre retraite ;
- la protection de vos proches en cas de décès ;
- l'assurance obsèques, si le sujet vous concerne.

Il vous suffit de répondre à cet e-mail avec vos disponibilités, ou de m'appeler au 0467 83 49 68.

Bien à vous,

Boris Y. AKOE
Sous-agent d'assurances (assurance-vie) · pour Comopolis · FSMA n° 0803.683.897
0467 83 49 68 · yaoakoe.pro@gmail.com

---
<small>Vous recevez cet e-mail parce que vous avez demandé à être recontacté(e) via CheckSanté. Pour ne plus recevoir de message, répondez simplement « STOP » : vos données seront supprimées. Aucune donnée de santé ne m'a été transmise. Réclamations : Ombudsman des Assurances, ombudsman-insurance.be.</small>

---

## Règles d'envoi
- Envoyer **un à un ou en copie cachée (Cci)**, jamais avec toutes les adresses visibles.
- « STOP » reçu → supprimer le contact (et ne plus écrire).
- Pas de relance au-delà d'une relance ; contacts sans suite supprimés automatiquement après 180 jours.
- Branche 23 évoquée → remettre le document d'informations clés avant toute souscription.
