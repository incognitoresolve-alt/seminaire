"""PDF interactif « CheckSanté — Ce qu'il reste à faire » (cases à cocher, liens cliquables, champs de notes).

Usage : python3 scripts/reste_a_faire_pdf.py docs/Reste-a-faire-CheckSante.pdf
"""
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)

OUT = sys.argv[1]
FD = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', FD + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', FD + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVM', FD + 'DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')

VIOLET = colors.HexColor('#5b1f8c'); VIOLET_L = colors.HexColor('#f5f0fb'); ORANGE = colors.HexColor('#c2410c')
ORANGE_L = colors.HexColor('#fff4ec'); NAVY = colors.HexColor('#1e1530'); GREY = colors.HexColor('#4b5563')
GREEN = colors.HexColor('#047857'); GREEN_L = colors.HexColor('#ecfdf5'); RED = colors.HexColor('#b91c1c')
RED_L = colors.HexColor('#fef2f2'); LINE = colors.HexColor('#d9cfe8'); CODE_BG = colors.HexColor('#f1edf7')

S = {
    'body': ParagraphStyle('body', fontName='DV', fontSize=10, leading=14.2, textColor=NAVY, alignment=TA_LEFT),
    'small': ParagraphStyle('small', fontName='DV', fontSize=8.6, leading=12, textColor=GREY),
    'title': ParagraphStyle('title', fontName='DVB', fontSize=24, leading=29, textColor=NAVY),
    'sub': ParagraphStyle('sub', fontName='DV', fontSize=11, leading=15, textColor=GREY),
    'h2': ParagraphStyle('h2', fontName='DVB', fontSize=13.5, leading=18, textColor=VIOLET, spaceBefore=12, spaceAfter=3),
    'kick': ParagraphStyle('kick', fontName='DVB', fontSize=8.5, leading=11, textColor=ORANGE),
}

SITE = 'https://seminaire-triage.incognitoresolve.workers.dev'
CF = 'https://dash.cloudflare.com/0e363cf16647955af947c8e2af6c6df7/workers/services/view/seminaire-triage/production'
REPO = 'https://github.com/incognitoresolve-alt/seminaire'


def P(t, st='body'):
    return Paragraph(t, S[st])


def a(url, label=None):
    return f'<a href="{url}" color="#5b1f8c"><u>{label or url}</u></a>'


def c(t):
    return f'<font name="DVM" backColor="#f1edf7">&nbsp;{t}&nbsp;</font>'


def b(t):
    """Bouton / menu à cliquer."""
    return f'<b><font color="#5b1f8c">« {t} »</font></b>'


_n = [0]


def uid(p):
    _n[0] += 1
    return f'{p}{_n[0]}'


class Task(Flowable):
    """Une tâche : case à cocher cliquable, titre, durée, détails."""

    def __init__(self, num, title, dur, lines, prio=False):
        super().__init__()
        self.num, self.dur, self.name = num, dur, uid('tache_')
        col = '#c2410c' if prio else '#5b1f8c'
        self.head = Paragraph(f'<font color="{col}"><b>{num}</b></font>&nbsp;&nbsp;<b>{title}</b>', S['body'])
        self.lines = [Paragraph(l, S['body']) for l in lines]

    def wrap(self, aw, ah):
        self.w = aw
        _, hh = self.head.wrap(aw - 90, ah)
        self.hh = hh
        self.lh = [p.wrap(aw - 40, ah)[1] for p in self.lines]
        self.h = 10 + hh + 4 + sum(h + 2.5 for h in self.lh) + 8
        return aw, self.h

    def split(self, aw, ah):
        return []

    def draw(self):
        cv = self.canv
        cv.setFillColor(VIOLET_L); cv.setStrokeColor(LINE); cv.setLineWidth(0.7)
        cv.roundRect(0, 0, self.w, self.h, 7, stroke=1, fill=1)
        cv.acroForm.checkbox(name=self.name, tooltip=f'Tâche {self.num} faite', x=10, y=self.h - 25, size=16,
                             buttonStyle='check', borderColor=VIOLET, fillColor=colors.white, textColor=GREEN,
                             borderWidth=1.3, fieldFlags='', relative=True, forceBorder=True)
        y = self.h - 8 - self.hh
        self.head.drawOn(cv, 34, y)
        cv.setFont('DVB', 8.5); cv.setFillColor(GREY); cv.drawRightString(self.w - 10, self.h - 17, self.dur)
        y -= 4
        for p, h in zip(self.lines, self.lh):
            y -= h + 2.5
            p.drawOn(cv, 34, y)


class Field(Flowable):
    def __init__(self, label, name, h=22):
        super().__init__()
        self.label, self.name, self.fh = label, name, h

    def wrap(self, aw, ah):
        self.w = aw
        return aw, self.fh + 16

    def draw(self):
        cv = self.canv
        cv.setFont('DVB', 8.6); cv.setFillColor(GREY); cv.drawString(0, self.fh + 5, self.label)
        cv.acroForm.textfield(name=self.name, x=0, y=0, width=self.w, height=self.fh, fontName='Helvetica',
                              fontSize=10, borderColor=LINE, fillColor=colors.white, textColor=NAVY, borderWidth=1,
                              relative=True, maxlen=500, forceBorder=True, tooltip=self.label,
                              fieldFlags='multiline' if self.fh > 30 else '')


def box(items, bg, border, title):
    content = [P(f'<b><font color="{border.hexval().replace("0x", "#")}">{title}</font></b>')]
    content += [P(i) for i in items]
    t = Table([[content]], colWidths=['100%'])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('BOX', (0, 0), (-1, -1), 0.8, border),
                           ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                           ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 6)])


def gap(h=6):
    return Spacer(1, h)


story = []

# ---------------------------------------------------------------- En-tête
story += [P('CHECKSANTÉ · SÉMINAIRE SPÉCIAL ICC LIÈGE · 11 → 14 NOVEMBRE 2026', 'kick'), gap(4),
          P('Ce qu’il te reste à faire', 'title'), gap(3),
          P(f'Mise à jour du 11 novembre 2026 · Site officiel : {a(SITE + "/", "seminaire-triage.incognitoresolve.workers.dev")}', 'sub'),
          gap(8)]

story.append(box([
    '<b>Clique sur les cases</b> ☐ quand une tâche est faite, puis <b>Fichier → Enregistrer</b> pour garder ta progression '
    '(Adobe Reader, Aperçu sur Mac, ou Chrome/Edge).',
    '<b>Liens violets soulignés</b> : un clic ouvre directement la bonne page.',
    '<b>Ordre conseillé</b> : tâches 1 → 6 maintenant (≈ 30 min), puis 7 → 10 avant l’ouverture. Les autres sont facultatives.',
    'Tu bloques ? Fais une <b>capture d’écran</b> et envoie-la à Claude dans la conversation.',
], VIOLET_L, VIOLET, 'Comment utiliser ce PDF'))

story.append(box([
    'Application complète et testée (34 tests automatiques, accessibilité vérifiée, sécurité « tout fermé par défaut ») · '
    'branche <b>main</b> · base de données D1 (ID enregistré) · tableaux créés automatiquement · site en ligne · '
    'version téléphone + effet verre · accords qui scintillent · corbeille et page /admin · page « Remarques » des intervenants · '
    '<b>affiches A4 avec QR codes vérifiés</b> · <b>vidéo tutoriel 30 s</b>.',
], GREEN_L, GREEN, '✓ Déjà fait (rien à faire de ton côté)'))

# ---------------------------------------------------------------- Maintenant
story += [P('MAINTENANT · ≈ 30 MIN', 'kick'), P('Mettre le site en service', 'h2')]

story.append(Task('1', 'Vérifier que la dernière version est en ligne', '2 min', [
    f'Ouvre {a(CF, "Cloudflare → Worker seminaire-triage")} (connecte-toi si besoin) → onglet {b("Deployments")}.',
    'La version du haut doit être marquée <b>Active</b> / <b>Success</b>, datée d’aujourd’hui.',
    f'Si ce n’est pas le cas : {b("Settings")} → {b("Builds")} → vérifier : branche {c("main")}, '
    f'commande de build {c("npm run build")}, commande de déploiement {c("npx wrangler deploy")}.',
], prio=True))
story.append(gap())

story.append(Task('2', 'Ajouter les 4 codes secrets', '5 min', [
    f'Toujours dans le Worker : {b("Settings")} → {b("Variables and Secrets")} → {b("+ Add")} → '
    f'Type : <b>Secret</b> (pas « Text ») → {b("Deploy")}. Recommencer pour chacun :',
    f'• {c("STAFF_PIN")} : code des soignants, <b>8 caractères minimum</b> (ex. 8 chiffres au hasard, pas une date de naissance).',
    f'• {c("SESSION_SECRET")} : <b>32 caractères minimum</b>, au hasard (générateur de mots de passe, 40 caractères).',
    f'• {c("ADMIN_KEY")} : clé de /admin (corbeille, remarques, rapport ICC, envois des fiches = données de santé), <b>16 caractères minimum</b> → de préférence le responsable médical.',
    f'• {c("PARTNER_KEY")} : ta clé « Mes contacts » sur /admin, <b>16 caractères minimum</b> → pour toi seul.',
    '<font color="#b91c1c"><b>Ne les écris jamais dans ce PDF</b></font> ni dans un e-mail. Note-les dans un gestionnaire de mots de passe.',
    'Sans ces codes, l’accès soignants affiche « Service non configuré » : c’est voulu (sécurité).',
], prio=True))
story.append(gap())

story.append(Task('3', 'Vérifier que le site répond', '1 min', [
    f'Ouvre {a(SITE + "/api/health")} → la page doit afficher {c("{&quot;ok&quot;:true}")}.',
    f'Puis ouvre {a(SITE + "/")} : le formulaire d’inscription CheckSanté s’affiche.',
], prio=True))
story.append(gap())

story.append(Task('4', 'Faire un vrai test avec 2 tablettes', '10 min', [
    f'Tablette A : {a(SITE + "/")} → inscrire 2 personnes « Test » (les 2 accords cochés) → message « ✓ … est inscrit(e) ».',
    f'Tablettes A et B : {a(SITE + "/staff")} → taper le <b>STAFF_PIN</b> → pastille verte <b>Temps réel</b>.',
    f'{b("Liste des inscrits")} → taper le nom → ouvrir la fiche → saisir une tension (ex. 150/85) → '
    f'choisir {b("Médecin 1")} → la fiche change sur l’autre tablette en quelques secondes.',
    f'Sur la fiche d’une personne qui a dit « J’autorise » : saisir nom et coordonnées du médecin traitant → {b("Fiche pour le médecin traitant (PDF)")} → la preuve de l’accord s’affiche (« ✓ vérifiée »).',
    f'{a(SITE + "/remarques")} → envoyer une remarque « Test » → {a(SITE + "/admin")} (ADMIN_KEY) → onglet {b("Remarques")} : elle apparaît.',
    'Mauvais PIN 11 fois de suite → « Trop d’essais, patientez une minute » (protection normale).',
], prio=True))
story.append(gap())

story.append(Task('5', 'Effacer toutes les données de test', '2 min', [
    f'Ouvre {a(SITE + "/admin")} → colle l’<b>ADMIN_KEY</b> → onglet Corbeille :',
    f'{b("Tout mettre à la corbeille")} → {b("Vider")}.',
    f'Onglet {b("Remarques")} : supprimer les remarques de test.',
    f'Si tu as coché le check-up pendant le test : {b("Ajouter une clé")} → <b>PARTNER_KEY</b> → onglet {b("Mes contacts")} → supprimer les contacts « Test ».',
], prio=True))
story.append(gap())

story.append(Task('6', 'Imprimer les affiches QR', '10 min', [
    f'Fichiers prêts : {c("affiche-inscription-A4.pdf")} (« Pas envie d’attendre ? »)'
    f', {c("affiche-remarques-intervenants-A4.pdf")} (salle des intervenants) et {c("affiche-checkup-assurance-A4.pdf")} (publicité). '
    f'Tous les QR codes sont aussi dans {a(SITE + "/admin")} → onglet {b("QR codes")} (lien, image PNG, affiche A4). '
    f'Envoyés dans la conversation, et aussi sur {a(REPO + "/tree/main/docs/affiches", "GitHub → docs/affiches")}.',
    'Imprimante : format <b>A4</b>, <b>taille réelle (100 %)</b>, <b>couleur</b>. Plusieurs exemplaires : entrée, file d’attente, chaises, salle.',
    '<b>Scanne une feuille imprimée</b> avec ton téléphone : la page d’inscription doit s’ouvrir.',
    f'Pour réimprimer plus tard : {a(SITE + "/affiche")} → {b("Imprimer l’affiche (A4)")}.',
]))

# ---------------------------------------------------------------- Avant l'ouverture
story += [gap(4)]
story.append(KeepTogether([P('AVANT L’OUVERTURE', 'kick'), P('Contenus et organisation', 'h2'), Task('7', 'Envoyer à Claude l’e-mail de contact RGPD d’ICC Liège', '1 min', [
    'C’est le <b>seul texte manquant</b> du site : il apparaît 2 fois dans la politique de confidentialité '
    f'({a(SITE + "/confidentialite", "page Confidentialité")}). Claude le met en ligne aussitôt.',
])]))
story.append(gap())

story.append(Task('8', 'Faire relire par les médecins', '15 min', [
    'L’analyse indicative de la fiche soignant (niveaux d’urgence, conseils, sources) et les seuils marqués '
    '« <b>Seuil de prudence CheckSanté</b> » (pas de source officielle : à valider ou corriger).',
    f'Détail dans le {a(REPO + "#assistant-m%C3%A9dical-%C3%A9ducatif-fiche-soignant", "README, section Assistant médical éducatif")}. '
    'Envoie leurs remarques à Claude.',
    'Facultatif : le nom des médecins (« Dr Dupont » au lieu de « Médecin 1 ») → envoie-les à Claude.',
]))
story.append(gap())

story.append(Task('9', 'Préparer le jour J', '20 min', [
    '<b>Codes</b> : STAFF_PIN aux soignants uniquement (jamais aux participants) · ADMIN_KEY à l’organisateur ou au responsable médical · PARTNER_KEY : toi seul.',
    '<b>Tablettes</b> : chargées + multiprises · veille d’écran désactivée (Réglages → Affichage → Verrouillage auto : Jamais) · '
    f'{a(SITE + "/staff")} ajouté à l’écran d’accueil ({b("Partager")} → {b("Sur l’écran d’accueil")}).',
    '<b>Réseau</b> : partage de connexion 4G de secours. Sans réseau, les saisies sont gardées et partent au retour du réseau.',
    '<b>Briefing soignants (5 min)</b> : Liste des inscrits → recherche → mesures → si « J’autorise » : nom, prénom et coordonnées du médecin traitant → Médecin 1 / 2 → Patient suivant → Terminé. '
    'Couleurs = aide indicative, le jugement clinique prime. Tablette laissée seule : bouton cadenas « Verrouiller ».',
    '<b>Accueil</b> : diffuser la vidéo tutoriel en boucle ; quelques formulaires papier + bouton « Ajouter manuellement » en secours.',
]))
story.append(gap())

story.append(Task('10', 'Partager le lien des remarques aux intervenants', '5 min', [
    f'Lien : {a(SITE + "/remarques")} → à envoyer aux <b>soignants, médecins, intervenants et bénévoles</b> '
    '(groupe WhatsApp, e-mail) + affiche QR dans la salle des intervenants.',
    'Ils choisissent leur rôle et le type (remarque, proposition, problème, point positif), écrivent leur message ; '
    'nom et contact seulement s’ils le souhaitent.',
    f'Tu les lis dans {a(SITE + "/admin")} → clé <b>ADMIN_KEY</b> → onglet {b("Remarques")} (pastille = nouvelles remarques) : '
    f'statut Nouveau / Lu / Traité, notes, {b("Copier le lien")}, {b("Télécharger (Excel / CSV)")}.',
    'Lien aussi présent en bas de l’écran des soignants (« Une remarque, une proposition ? »).',
]))

# ---------------------------------------------------------------- Facultatif
story += [gap(4)]
story.append(KeepTogether([P('FACULTATIF', 'kick'), P('Pour aller plus loin', 'h2'), Task('11', 'Retirer la croix rouge « Workers Builds » sur GitHub', '2 min', [
    'Elle concerne seulement les versions d’essai des modifications (le site officiel se met bien à jour).',
    f'{a(CF, "Worker")} → {b("Settings")} → {b("Builds")} → désactiver les builds des branches autres que '
    f'{c("main")} (« Non-production branch builds »).',
])]))

# ---------------------------------------------------------------- Après
story += [gap(4)]
story.append(KeepTogether([P('APRÈS L’ÉVÉNEMENT', 'kick'), P('Clôturer proprement', 'h2'), Task('12', 'Envoyer (à la main), sécuriser, effacer', '20 min', [
    '<b>Aucun envoi automatique</b> : tout part de ta messagerie, depuis l’onglet ' + b('Envois') + f' de {a(SITE + "/admin")} (ADMIN_KEY).',
    f'<b>Médecins traitants</b> : {b("Envois")} → pour chaque personne : e-mail du médecin → {b("1. Fiche PDF")} (Imprimer / Enregistrer en PDF) '
    f'→ {b("2. Préparer l’e-mail")} (joindre le PDF) → {b("3. Marquer comme envoyée")}. De préférence via la messagerie sécurisée (eHealthBox).',
    f'<b>Rapport ICC Liège</b> : {b("Envois")} → enregistrer l’e-mail d’ICC Liège (une fois) → {b("1. Télécharger le rapport (CSV)")} '
    f'→ {b("2. Préparer l’e-mail à ICC Liège")} (joindre le CSV). Nom, prénom, GSM des personnes reçues qui ont accepté (avant l’effacement à 30 jours).',
    f'<b>Contacts check-up</b> : {a(SITE + "/admin")} → {b("Mes contacts")} → statut, notes, {b("Télécharger (Excel / CSV)")}. '
    'Une seule relance maximum ; « STOP » = effacement immédiat.',
    f'<b>Sécurité</b> : changer ou supprimer {c("STAFF_PIN")} dans Cloudflare → plus aucun accès soignants.',
    f'<b>Remarques des intervenants</b> : {b("Télécharger (Excel / CSV)")} pour le bilan de l’organisation.',
    '<b>Effacement automatique</b> : dossiers après 30 jours, contacts et remarques après 180 jours.'
])]))

story.append(box([
    'Le site ne marche plus après une modification → Worker → ' + b('Deployments') + ' → version précédente → '
    + b('Rollback') + ' (retour immédiat).',
    '« Service non configuré » → un code secret manque ou est trop court (tâche 2).',
    'Pastille rouge « Hors ligne » → passer sur la 4G ; les saisies partiront au retour du réseau.',
    'Journaux d’erreurs : Worker → ' + b('Observability') + ' / ' + b('Logs') + '.',
], RED_L, RED, 'En cas de problème'))



# ---------------------------------------------------------------- Mise en page
def deco(cv, d):
    cv.saveState()
    cv.setFillColor(VIOLET); cv.rect(0, A4[1] - 7, A4[0], 7, stroke=0, fill=1)
    cv.setFillColor(colors.HexColor('#f26b1d')); cv.rect(A4[0] - 60 * mm, A4[1] - 7, 60 * mm, 7, stroke=0, fill=1)
    cv.setFont('DV', 7.8); cv.setFillColor(GREY)
    cv.drawString(16 * mm, 9 * mm, 'CheckSanté · Ce qu’il reste à faire · 11/11/2026')
    cv.drawRightString(A4[0] - 16 * mm, 9 * mm, f'page {d.page}')
    cv.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=12 * mm,
                      bottomMargin=14 * mm, title='CheckSanté – Ce qu’il reste à faire', author='CheckSanté',
                      subject='Checklist interactive de mise en service')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate('p', frames=[frame], onPage=deco)])
doc.build(story)
print('ok', OUT)
