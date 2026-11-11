"""Génère le guide interactif CheckSanté (cases à cocher, champs, liens, sommaire cliquable)."""
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, KeepTogether, PageBreak, PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)

OUT = sys.argv[1]
FD = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('DV', FD + 'DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DVB', FD + 'DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DVM', FD + 'DejaVuSansMono.ttf'))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')

BLUE = colors.HexColor('#0369a1'); NAVY = colors.HexColor('#0f172a'); GREY = colors.HexColor('#475569')
GREEN = colors.HexColor('#059669'); LGREEN = colors.HexColor('#ecfdf5'); AMBER = colors.HexColor('#b45309')
LAMBER = colors.HexColor('#fffbeb'); LBLUE = colors.HexColor('#f0f9ff'); RED = colors.HexColor('#b91c1c')
LRED = colors.HexColor('#fef2f2'); LINE = colors.HexColor('#cbd5e1'); LGREY = colors.HexColor('#f1f5f9')

S = {
    'body': ParagraphStyle('body', fontName='DV', fontSize=10.5, leading=15, textColor=NAVY),
    'small': ParagraphStyle('small', fontName='DV', fontSize=9, leading=12.5, textColor=GREY),
    'h1': ParagraphStyle('h1', fontName='DVB', fontSize=19, leading=24, textColor=NAVY, spaceAfter=4),
    'h2': ParagraphStyle('h2', fontName='DVB', fontSize=12.5, leading=17, textColor=BLUE, spaceBefore=10, spaceAfter=4),
    'kicker': ParagraphStyle('kicker', fontName='DVB', fontSize=9, leading=12, textColor=BLUE),
    'title': ParagraphStyle('title', fontName='DVB', fontSize=30, leading=36, textColor=NAVY, alignment=TA_CENTER),
    'sub': ParagraphStyle('sub', fontName='DV', fontSize=13, leading=18, textColor=GREY, alignment=TA_CENTER),
    'code': ParagraphStyle('code', fontName='DVM', fontSize=9.5, leading=13, textColor=NAVY),
    'toc': ParagraphStyle('toc', fontName='DV', fontSize=11.5, leading=20, textColor=NAVY),
}

def P(t, st='body'):
    return Paragraph(t, S[st])

def link(url, label=None):
    return f'<a href="{url}" color="#0369a1"><u>{label or url}</u></a>'

def code(t):
    return f'<font name="DVM" backColor="#f1f5f9">&nbsp;{t}&nbsp;</font>'

def btn(t):
    """Libellé de bouton / menu à cliquer."""
    return f'<b><font color="#0369a1">« {t} »</font></b>'

_n = [0]
def uid(p):
    _n[0] += 1
    return f'{p}{_n[0]}'


class Step(Flowable):
    """Une étape : case à cocher cliquable + texte."""
    def __init__(self, num, html):
        super().__init__()
        self.num, self.p = num, Paragraph(f'<b>{num}.</b>&nbsp; {html}', S['body'])
        self.name = uid('etape_')

    def wrap(self, aw, ah):
        self.w = aw
        _, h = self.p.wrap(aw - 26, ah)
        self.h = max(h, 16) + 7
        return aw, self.h

    def split(self, aw, ah):
        return []

    def draw(self):
        self.canv.acroForm.checkbox(name=self.name, tooltip=f'Étape {self.num} faite', x=0, y=self.h - 20, size=14,
                                    buttonStyle='check', borderColor=BLUE, fillColor=colors.white, textColor=GREEN,
                                    borderWidth=1.2, fieldFlags='', relative=True, forceBorder=True)
        self.p.drawOn(self.canv, 26, 7)


class Field(Flowable):
    """Champ texte à remplir directement dans le PDF."""
    def __init__(self, label, name, width=None, hint=''):
        super().__init__()
        self.label, self.name, self.fw, self.hint = label, name, width, hint

    def wrap(self, aw, ah):
        self.w = aw
        return aw, 40

    def draw(self):
        c = self.canv
        c.setFont('DVB', 9); c.setFillColor(GREY); c.drawString(0, 29, self.label)
        if self.hint:
            c.setFont('DV', 8); c.drawRightString(self.w, 29, self.hint)
        c.acroForm.textfield(name=self.name, x=0, y=2, width=self.fw or self.w, height=22, fontName='Helvetica',
                             fontSize=10, borderColor=LINE, fillColor=colors.HexColor('#ffffff'), textColor=NAVY,
                             borderWidth=1, relative=True, maxlen=200, forceBorder=True, tooltip=self.label)


def box(items, bg, border, title=None, tcolor=None):
    content = []
    if title:
        content.append(P(f'<b><font color="{tcolor.hexval().replace("0x", "#")}">{title}</font></b>'))
    content += [P(i) if isinstance(i, str) else i for i in items]
    t = Table([[content]], colWidths=['100%'])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), bg), ('BOX', (0, 0), (-1, -1), 0.8, border),
                           ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                           ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 6)])

def result(*t):
    return box(list(t), LGREEN, GREEN, '✓ Ce que tu dois voir', GREEN)

def warn(*t):
    return box(list(t), LAMBER, AMBER, '⚠ Attention', AMBER)

def danger(*t):
    return box(list(t), LRED, RED, '✖ Important', RED)

def tip(*t):
    return box(list(t), LBLUE, BLUE, '★ Astuce', BLUE)

def codeblock(lines):
    t = Table([[P(l.replace(' ', '&nbsp;'), 'code')] for l in lines], colWidths=['100%'])
    t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), LGREY), ('BOX', (0, 0), (-1, -1), 0.6, LINE),
                           ('LEFTPADDING', (0, 0), (-1, -1), 8), ('TOPPADDING', (0, 0), (-1, -1), 1),
                           ('BOTTOMPADDING', (0, 0), (-1, -1), 1)]))
    return KeepTogether([Spacer(1, 3), t, Spacer(1, 6)])

class Heading(Paragraph):
    """Titre de section : ancre + signet PDF."""
    def __init__(self, text, key, kicker=''):
        self.key, self.plain = key, text
        super().__init__(f'<a name="{key}"/>{text}', S['h1'])
        self.kicker = kicker

def section(key, num, title, duration, optional=False):
    tag = ' · FACULTATIF' if optional else ''
    return [P(f'ÉTAPE {num} · ≈ {duration}{tag}', 'kicker'), Heading(title, key), Spacer(1, 4)]


# ---------------------------------------------------------------- Contenu
REPO = 'https://github.com/incognitoresolve-alt/seminaire'
BRANCH = 'ccr-7e184915-u0pmfk'
SECTIONS = [
    ('s0', '0', 'Avant de commencer', '5 min'),
    ('s1', '1', 'GitHub : créer la branche « main »', '3 min'),
    ('s2', '2', 'Cloudflare : créer la base de données', '10 min'),
    ('s3', '3', 'Cloudflare : mettre le site en ligne', '10 min'),
    ('s4', '4', 'Cloudflare : ajouter les codes secrets', '5 min'),
    ('s5', '5', 'Tester le site (et effacer les tests)', '20 min'),
    ('s6', '6', 'Compléter les textes', '10 min'),
    ('s7', '7', 'Nom de domaine (facultatif)', '10 min'),
    ('s8', '8', 'Imprimer les affiches', '10 min'),
    ('s9', '9', 'Le jour J', '—'),
    ('s10', '10', 'Après l’événement', '15 min'),
    ('sd', '?', 'En cas de problème', '—'),
]

story = []

# ---- Couverture
class Logo(Flowable):
    def wrap(self, aw, ah):
        self.aw = aw
        return aw, 70
    def draw(self):
        c = self.canv; x = self.aw / 2 - 32
        c.setFillColor(BLUE); c.roundRect(x, 4, 64, 64, 14, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.rect(x + 25, 16, 14, 40, stroke=0, fill=1); c.rect(x + 12, 29, 40, 14, stroke=0, fill=1)
        c.setFillColor(GREEN); c.setStrokeColor(colors.white); c.setLineWidth(2.5); c.circle(x + 51, 17, 11, stroke=1, fill=1)
        c.setLineWidth(3); c.setLineCap(1); c.setLineJoin(1); p = c.beginPath()
        p.moveTo(x + 46, 17); p.lineTo(x + 49.5, 13.5); p.lineTo(x + 56.5, 21); c.drawPath(p, stroke=1, fill=0)

story += [Spacer(1, 30), Logo(), Spacer(1, 14),
          P('Mettre <font color="#0369a1">CheckSanté</font> en ligne', 'title'), Spacer(1, 8),
          P('Guide pas à pas pour débutant · ICC Liège · Semaine de la santé 2026', 'sub'), Spacer(1, 26)]

story.append(box([
    '<b>Cases à cocher</b> ☐ : clique dessus quand une étape est faite.',
    '<b>Liens bleus soulignés</b> : clique pour ouvrir la bonne page (ou aller à la bonne section).',
    '<b>Champs blancs</b> : tape directement dedans pour noter tes informations.',
    '<b>Enregistrer ta progression</b> : Fichier → Enregistrer (Adobe Reader, Aperçu sur Mac, ou Chrome/Edge : icône de téléchargement ↓).',
    '<b>Fais tout depuis un ordinateur</b>, pas depuis un téléphone.',
], LBLUE, BLUE, 'Comment utiliser ce PDF', BLUE))

story.append(danger(
    '<b>L’événement a commencé : va à l’essentiel.</b> Le chemin minimal pour avoir un site qui fonctionne, '
    'c’est les étapes <b>1 → 2 → 3 → 4 → 5</b> (≈ 50 min). Les étapes 6, 7 et 8 peuvent attendre.',
    'Tu bloques ? Fais une <b>capture d’écran</b> et envoie-la dans la conversation avec Claude : '
    'je te dis exactement quoi faire.'))
story.append(PageBreak())

# ---- Sommaire / progression
story += [P('SOMMAIRE CLIQUABLE', 'kicker'), Heading('Ta progression', 'toc'), Spacer(1, 6),
          P('Clique sur un titre pour y aller. Coche la case de droite quand la section entière est terminée.', 'small'),
          Spacer(1, 8)]

class TocRow(Flowable):
    def __init__(self, key, num, title, dur):
        super().__init__(); self.key, self.num, self.title, self.dur = key, num, title, dur
        self.p = Paragraph(f'<a href="#{key}" color="#0f172a"><b>{num}</b>&nbsp;&nbsp; {title}</a>', S['toc'])
    def wrap(self, aw, ah):
        self.w = aw; return aw, 26
    def draw(self):
        c = self.canv; self.p.wrap(self.w - 120, 26); self.p.drawOn(c, 4, 5)
        c.setFont('DV', 9); c.setFillColor(GREY); c.drawRightString(self.w - 30, 10, self.dur)
        c.setStrokeColor(LINE); c.setLineWidth(0.5); c.line(0, 0, self.w, 0)
        c.acroForm.checkbox(name=f'fini_{self.key}', tooltip=f'Section {self.num} terminée', x=self.w - 18, y=5,
                            size=14, buttonStyle='check', borderColor=GREEN, fillColor=colors.white, textColor=GREEN,
                            borderWidth=1.2, fieldFlags='', relative=True, forceBorder=True)

story += [TocRow(*s) for s in SECTIONS]
story += [Spacer(1, 14), P('<a href="#glossaire" color="#0369a1"><u>Petit lexique des mots techniques →</u></a>')]
story.append(Spacer(1, 18))
story.append(P('<b>Tes informations</b> (à remplir au fur et à mesure)', 'h2'))
story += [Field('Database ID (étape 2)', 'f_dbid', hint='ex. 3f1c2b9a-1d2e-4f5a-9b8c-7d6e5f4a3b2c'),
          Field('Adresse du site (étape 3)', 'f_url', hint='https://seminaire-triage.….workers.dev'),
          Field('Nom de domaine (étape 7, facultatif)', 'f_domain', hint='ex. checksante.be'),
          Field('Adresse postale d’ICC Liège (étape 6)', 'f_icc_adresse')]
story.append(warn('Ne note <b>jamais</b> le code PIN ni les codes secrets dans ce PDF : il pourrait être partagé par erreur.'))
story.append(PageBreak())

# ---- Lexique
story += [P('LEXIQUE', 'kicker'), Heading('Les mots à connaître', 'glossaire'), Spacer(1, 6)]
lex = [
    ('GitHub', 'Le site qui stocke le code de l’application (comme un Google Drive pour le code).'),
    ('Dépôt (repository)', 'Le « dossier » du projet sur GitHub. Le tien s’appelle <b>seminaire</b>.'),
    ('Branche', 'Une version du code. Le site public sera construit à partir de la branche <b>main</b>.'),
    ('Commit', 'L’enregistrement d’une modification sur GitHub (comme « Enregistrer »).'),
    ('Cloudflare', 'L’hébergeur qui fait tourner le site, partout dans le monde, très rapidement.'),
    ('Worker', 'Le programme CheckSanté qui tourne chez Cloudflare (le « moteur » du site).'),
    ('D1', 'La base de données Cloudflare : elle stocke les inscriptions, les mesures, les remarques des intervenants.'),
    ('Console SQL', 'Une zone où l’on colle des instructions pour créer ou lire les tableaux de la base.'),
    ('Secret', 'Un code caché que seul le Worker connaît (ex. le PIN des soignants). Invisible une fois enregistré.'),
    ('Build / Deploy', 'Cloudflare prépare le site (build) puis le met en ligne (deploy). Automatique.'),
    ('DNS', 'L’annuaire d’Internet qui relie un nom (checksante.be) à un site. Utile seulement à l’étape 7.'),
]
t = Table([[P(f'<b>{a}</b>'), P(b)] for a, b in lex], colWidths=[42 * mm, None])
t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
                       ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
story += [t, PageBreak()]

# ---- 0. Avant de commencer
story += section('s0', '0', 'Avant de commencer', '5 min')
story += [
    Step(1, f'Ouvre ton dépôt GitHub : {link(REPO)} et vérifie que tu es bien connecté (ta photo en haut à droite).'),
    Step(2, f'Crée un compte Cloudflare gratuit si tu n’en as pas : {link("https://dash.cloudflare.com/sign-up")}. '
            'Confirme ton adresse e-mail (lien reçu par e-mail).'),
    Step(3, 'Garde ce PDF ouvert d’un côté de l’écran, et ton navigateur de l’autre.'),
]
story.append(tip('Raccourci pratique : <b>Ctrl + C</b> pour copier, <b>Ctrl + V</b> pour coller '
                 '(sur Mac : <b>Cmd + C</b> / <b>Cmd + V</b>).'))
story.append(PageBreak())

# ---- 1. GitHub main
story += section('s1', '1', 'GitHub : créer la branche « main »', '3 min')
story.append(P(f'Tout le code est sur une branche au nom technique ({code(BRANCH)}). On crée une branche <b>main</b>, '
               'qui sera la version officielle du site.'))
story += [
    Step(1, f'Ouvre {link(REPO)}.'),
    Step(2, f'En haut à gauche, au-dessus de la liste des fichiers, clique sur le bouton qui affiche {code(BRANCH)} '
            '(avec une petite icône de branche).'),
    Step(3, f'Dans la case de recherche qui s’ouvre, tape {code("main")}.'),
    Step(4, f'Clique sur {btn("Create branch main from ccr-7e184915-u0pmfk")}.'),
    Step(5, f'Va dans l’onglet {btn("Settings")} (en haut, roue dentée). Rubrique {btn("General")}, partie '
            f'{btn("Default branch")} : clique sur l’icône ⇄, choisis {code("main")}, puis {btn("Update")} et confirme.'),
]
story.append(result('Le bouton de branche affiche maintenant <b>main</b>, et la liste de fichiers contient '
                    '<b>web</b>, <b>src</b>, <b>public</b>, <b>migrations</b>, <b>wrangler.toml</b>…'))
story.append(PageBreak())

# ---- 2. D1
story += section('s2', '2', 'Cloudflare : créer la base de données', '10 min')
story += [P('A. Créer la base', 'h2'),
    Step(1, f'Ouvre {link("https://dash.cloudflare.com")} et connecte-toi.'),
    Step(2, f'Dans le menu de gauche : {btn("Storage & Databases")} → {btn("D1 SQL Database")}.'),
    Step(3, f'Clique sur {btn("Create")} (ou « Create database »).'),
    Step(4, f'Nom de la base : tape exactement {code("seminaire")}.'),
    Step(5, f'Emplacement (Location) : choisis {btn("Western Europe (WEUR)")}. S’il existe une option '
            f'« Jurisdiction », choisis {btn("EU")}. Puis clique sur {btn("Create")}.'),
    Step(6, f'Sur la page de la base, repère <b>Database ID</b> (une longue suite comme {code("3f1c2b9a-1d2e-…")}). '
            'Copie-la et colle-la dans le champ ci-dessous.'),
    Field('Database ID', 'f_dbid_2'),
]
story += [P('B. Indiquer cet ID au code', 'h2'),
    P('<b>Option facile (recommandée)</b> : envoie le Database ID à Claude dans la conversation. '
      'Il l’intègre lui-même au code. Dans ce cas, coche directement les étapes 7 à 10.', 'body'), Spacer(1, 4),
    P('<b>Option autonome</b> :', 'body'),
    Step(7, f'Sur GitHub (branche <b>main</b>), clique sur le fichier {code("wrangler.toml")}.'),
    Step(8, f'Clique sur l’icône crayon ✎ {btn("Edit this file")} (en haut à droite du fichier).'),
    Step(9, f'Ligne 17, remplace uniquement {code("00000000-0000-0000-0000-000000000000")} par ton Database ID '
            '(garde les guillemets " ").'),
    Step(10, f'Clique sur {btn("Commit changes…")} en haut à droite, puis encore {btn("Commit changes")}.'),
]
story.append(codeblock(['Avant : database_id = "00000000-0000-0000-0000-000000000000"',
                        'Après : database_id = "3f1c2b9a-1d2e-4f5a-9b8c-7d6e5f4a3b2c"   ← ton ID']))
story += [P('C. Créer les tableaux de la base — FACULTATIF', 'h2'),
    box(['<b>Tu peux sauter cette partie.</b> L’application crée et met à jour ses tableaux <b>toute seule</b> '
         'dès la première visite du site. Coche directement les cases 11 à 16.',
         'Si tu préfères le faire à la main : copie le bloc unique du fichier '
         + link(f"{REPO}/blob/main/docs/schema-complet.sql", "docs/schema-complet.sql") +
         ' (bouton Raw) dans l’onglet Console, puis Execute. Ou les 5 fichiers ci-dessous, dans l’ordre :'],
        LGREEN, GREEN, '✓ Automatique', GREEN),
]
for i, f in enumerate(['0001_init.sql', '0002_partner_leads.sql', '0003_lead_mail.sql', '0004_stage.sql', '0005_doctor_consent.sql'], start=11):
    story.append(Step(i, f'Ouvre {link(f"{REPO}/blob/main/migrations/{f}", f)} → clique sur {btn("Raw")} → '
                         f'sélectionne tout (<b>Ctrl + A</b>) → copie → dans Cloudflare, onglet {btn("Console")} '
                         f'de la base <b>seminaire</b> → colle → {btn("Execute")}.'))
story.append(warn('Si la console affiche une erreur avec plusieurs instructions, colle et exécute les blocs '
                  'un par un (chaque bloc se termine par un point-virgule <b>;</b>).',
                  'Si tu relances par erreur 0003, 0004 ou 0005 : « duplicate column » = déjà fait, aucun souci.'))
story.append(Step(16, 'Vérification : dans la Console, colle cette ligne puis ' + btn('Execute') + ' :'))
story.append(codeblock(["SELECT name FROM sqlite_master WHERE type='table';"]))
story.append(result('La liste contient <b>patients</b>, <b>partner_leads</b> et <b>feedback</b>.'))
story.append(PageBreak())

# ---- 3. Worker
story += section('s3', '3', 'Cloudflare : mettre le site en ligne', '10 min')
story.append(warn('Fais d’abord l’étape 2-B (Database ID dans le code). Sinon la mise en ligne échoue.'))
story += [
    Step(1, f'Dans Cloudflare, menu de gauche : {btn("Compute (Workers)")} ou {btn("Workers & Pages")}.'),
    Step(2, f'Clique sur {btn("Create")} (ou « Create application »), puis choisis {btn("Import a repository")} '
            '(parfois appelé « Connect to Git »).'),
    Step(3, f'Choisis {btn("GitHub")}. Une fenêtre GitHub s’ouvre : autorise Cloudflare et donne-lui accès au dépôt '
            '<b>seminaire</b> (option « Only select repositories »).'),
    Step(4, 'Sélectionne le dépôt <b>seminaire</b>, puis remplis les réglages comme dans le tableau ci-dessous.'),
]
cfg = [('Project name / Worker name', 'seminaire-triage'), ('Production branch', 'main'),
       ('Build command', 'npm run build'), ('Deploy command', 'npx wrangler deploy'), ('Root directory / Path', '/')]
t = Table([[P('<b>Champ</b>'), P('<b>À écrire exactement</b>')]] + [[P(a), P(code(b))] for a, b in cfg], colWidths=[70 * mm, None])
t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), LGREY), ('GRID', (0, 0), (-1, -1), 0.5, LINE),
                       ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5)]))
story += [Spacer(1, 4), t, Spacer(1, 8)]
story += [
    Step(5, f'Clique sur {btn("Save and Deploy")} (ou « Deploy »). Cloudflare prépare le site : '
            'compte <b>2 à 4 minutes</b>. Ne ferme pas la page.'),
    Step(6, 'Quand c’est fini, Cloudflare affiche l’adresse du site, du type '
            f'{code("https://seminaire-triage.ton-nom.workers.dev")}. Note-la ci-dessous.'),
    Field('Adresse du site', 'f_url_2'),
]
story.append(result('Le journal de construction se termine par <b>Success</b> (ou une coche verte), '
                    'et l’adresse ouvre la page « Consultation de prévention » avec le logo CheckSanté.'))
story.append(warn('Le nom du projet doit être exactement <b>seminaire-triage</b>. '
                  'Un autre nom = échec de la mise en ligne.'))
story.append(PageBreak())

# ---- 4. Secrets
story += section('s4', '4', 'Cloudflare : ajouter les codes secrets', '5 min')
story.append(P('Sans ces codes, le site d’inscription fonctionne, mais <b>l’espace soignants reste verrouillé</b> '
               '(c’est volontaire, pour la sécurité).'))
story += [P('A. Préparer les deux codes', 'h2'),
    Step(1, '<b>Code PIN des soignants</b> (<b>STAFF_PIN</b>) : invente un code d’<b>au moins 8 caractères</b>, '
            'par exemple 8 chiffres au hasard. Pas de date de naissance, pas 12345678.'),
    Step(2, f'<b>Clé de session</b> (<b>SESSION_SECRET</b>) : ouvre {link("https://bitwarden.com/password-generator/")}, '
            'règle la longueur sur <b>64</b>, copie le mot de passe généré. Tu n’auras jamais besoin de le retaper.'),
]
story += [P('B. Les enregistrer dans Cloudflare', 'h2'),
    Step(3, f'Ouvre ton Worker <b>seminaire-triage</b> → onglet {btn("Settings")} → {btn("Variables and Secrets")}.'),
    Step(4, f'Clique sur {btn("Add")}. Type : {btn("Secret")}. Nom : {code("STAFF_PIN")}. Valeur : ton code PIN.'),
    Step(5, f'Clique encore sur {btn("Add")}. Type : {btn("Secret")}. Nom : {code("SESSION_SECRET")}. '
            'Valeur : la clé de 64 caractères.'),
    Step(6, f'<b>Ta clé partenaire</b> (pour ton espace « Mes contacts ») : encore {btn("Add")} → {btn("Secret")} → '
            f'nom {code("PARTNER_KEY")} → valeur : un mot de passe d’<b>au moins 16 caractères</b> (générateur ci-dessus). '
            'Garde-le pour toi seul : les soignants n’en ont pas besoin.'),
    Step(7, f'<b>Clé administrateur</b> (corbeille sur la page /admin) : {btn("Add")} → {btn("Secret")} → nom {code("ADMIN_KEY")} → '
            'un autre mot de passe d’<b>au moins 16 caractères</b>. À confier à l’organisateur ou au responsable médical : la corbeille contient des données de santé.'),
    Step(8, f'Clique sur {btn("Deploy")} (ou « Save and deploy »).'),
]
story.append(warn('Les noms doivent être écrits <b>exactement</b> comme ici, en majuscules, avec le tiret bas _.'))
story.append(danger('Le PIN se donne <b>uniquement aux soignants</b>, de vive voix ou par message privé. '
                    'Jamais aux participants, jamais affiché au mur.'))
story.append(PageBreak())

# ---- 5. Tests
story += section('s5', '5', 'Tester le site (et effacer les tests)', '20 min')
story.append(P('Remplace <b>ADRESSE</b> par l’adresse de ton site (étape 3).'))
tests = [
    f'Ouvre <b>ADRESSE/api/health</b> → la page affiche {code(chr(123)+chr(34)+"ok"+chr(34)+":true"+chr(125))}.',
    'Ouvre <b>ADRESSE</b> et inscris 2 personnes de test à la suite → après chaque inscription, un bandeau vert « ✓ … est inscrit(e) » s’affiche et le formulaire se vide.',
    'Sur une tablette ou un ordinateur, ouvre <b>ADRESSE/staff</b>, tape le PIN → la pastille <b>verte « Temps réel »</b> '
    'apparaît et ton inscription est dans la liste.',
    'Ouvre aussi <b>ADRESSE/staff</b> sur un 2ᵉ appareil (même PIN).',
    f'Sur le 1er appareil : {btn("Liste des inscrits")} → tape le nom d’une personne de test dans la recherche → la fiche s’ouvre. '
    'Fais l’essai sur une tablette et sur un téléphone.',
    'Dans la fiche, tape un pouls de <b>135</b> → la fiche devient <b>Rouge</b>, et le 2ᵉ appareil l’affiche aussi en rouge en 1 seconde.',
    f'Appuie sur {btn("Patient suivant →")} sur chaque appareil → ils ouvrent deux personnes différentes.',
    f'Appuie sur {btn("Terminé")} → la fiche se ferme et la personne quitte la liste « À traiter ».',
    'Ouvre <b>ADRESSE/remarques</b>, envoie une remarque « Test » → ADRESSE/admin (clé ADMIN_KEY) → onglet '
    f'{btn("Remarques")} : elle apparaît.',
    'Tape volontairement 11 mauvais PIN → message « Trop d’essais, patientez une minute ».',
]
story += [Step(i, s) for i, s in enumerate(tests, start=1)]
story.append(P('Effacer les données de test (obligatoire avant d’ouvrir au public)', 'h2'))
story += [Step(11, f'Ouvre <b>ADRESSE/admin</b> → tape la clé <b>ADMIN_KEY</b> → {btn("Tout mettre à la corbeille")} → {btn("Vider")} → onglet {btn("Remarques")} → supprimer la remarque de test.'),
          Step(12, f'Contacts de test : sur la même page, {btn("Ajouter une clé")} → <b>PARTNER_KEY</b> → onglet {btn("Mes contacts")} → « STOP » sur chaque contact de test.'),
          Step(13, 'Rafraîchis ADRESSE/staff : la liste affiche « Aucun participant inscrit pour le moment ».')]
story.append(tip('Si un test échoue, va directement à la page '
                 '<a href="#sd" color="#0369a1"><u>En cas de problème</u></a>.'))
story.append(PageBreak())

# ---- 6. Textes
story += section('s6', '6', 'Compléter les textes', '10 min')
story.append(P('<b>Option facile (recommandée)</b> : envoie ces informations à Claude dans la conversation, '
               'il fait les modifications et les met en ligne.'))
story += [
    Step(1, 'Contact RGPD d’ICC Liège : <b>icc-liege@impactcentrechretien.eu</b> (déjà en ligne sur la page Confidentialité). '
            'Fais relire cette page par ICC Liège.'),
    Step(2, 'Fais <b>valider les seuils de couleur</b> par les médecins (tableau ci-dessous). Note les changements éventuels.'),
    Step(3, 'Envoie le tout à Claude (ou modifie toi-même les fichiers sur GitHub avec le crayon ✎, comme à l’étape 2-B).'),
]
seuils = [('Paramètre', 'Orange', 'Rouge'), ('Pouls (bpm)', '< 50 ou > 100', '< 40 ou > 130'),
          ('Température (°C)', '< 36 ou ≥ 38', '< 35 ou ≥ 39,5'), ('Tension systolique', '< 100 ou ≥ 140', '< 90 ou ≥ 180'),
          ('Tension diastolique', '< 50 ou ≥ 90', '≥ 110'), ('Glycémie (mg/dL)', '< 70 ou ≥ 200', '< 54 ou ≥ 300'),
          ('IMC (adultes)', '< 18,5 ou ≥ 30', '—')]
t = Table([[P(f'<b>{a}</b>') if i == 0 else P(a), P(b), P(c)] for i, (a, b, c) in enumerate(seuils)], colWidths=[60 * mm, None, None])
t.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, 0), LGREY), ('BACKGROUND', (1, 1), (1, -1), LAMBER),
                       ('BACKGROUND', (2, 1), (2, -1), LRED), ('GRID', (0, 0), (-1, -1), 0.5, LINE),
                       ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4)]))
story += [Spacer(1, 6), t, Spacer(1, 4), P('Seuils adultes ci-dessus. L’application adapte automatiquement le pouls et la tension pour les enfants (1–5 ans et 6–11 ans) grâce à la date de naissance, et affiche des <b>conseils automatiques</b> selon les valeurs et l’âge. À faire valider aussi par les médecins.', 'small'), Spacer(1, 6), Field('Remarques des médecins sur les seuils', 'f_seuils')]
story.append(PageBreak())

# ---- 7. Domaine (aucun envoi automatique d'e-mail)
story += section('s7', '7', 'Nom de domaine (facultatif)', '10 min', optional=True)
story.append(P('Sans cette étape, tout fonctionne : l’adresse reste en « workers.dev » et tu écris toi-même aux '
               'personnes intéressées par le check-up (modèle dans <b>docs/modele-email-checkup.md</b>).'))
story.append(warn('Choisis le domaine <b>avant d’imprimer les affiches</b> : les QR codes contiennent l’adresse du site.'))
story += [P('A. Nom de domaine', 'h2'),
    Step(1, f'Cloudflare → {btn("Domain Registration")} → {btn("Register Domains")} → cherche par ex. '
            f'{code("checksante.be")} → achète-le (quelques euros par an).'),
    Step(2, f'Worker <b>seminaire-triage</b> → {btn("Settings")} → {btn("Domains & Routes")} → {btn("Add")} → '
            f'{btn("Custom domain")} → tape ton domaine → {btn("Add domain")}.'),
    Step(3, f'Menu du domaine → {btn("SSL/TLS")} → {btn("Edge Certificates")} : active {btn("Always Use HTTPS")} et '
            f'règle {btn("Minimum TLS Version")} sur 1.2.'),
]
story.append(tip('<b>Aucun envoi automatique d’e-mail</b> : tu écris toi-même aux personnes intéressées par le check-up '
                 '(onglet « Mes contacts »), et les fiches des médecins traitants partent depuis '
                 '<b>ADRESSE/admin</b> → onglet « Envois ».'))
story.append(PageBreak())

# ---- 8. Affiches
story += section('s8', '8', 'Imprimer les affiches', '10 min')
story += [
    Step(1, 'Ouvre <b>ADRESSE/affiche</b> → bouton ' + btn('Imprimer') + ' → format A4 (ou A3 pour l’entrée). '
            'Imprime plusieurs exemplaires : entrée, file d’attente, chaises.'),
    Step(2, 'Ouvre <b>ADRESSE/affiche?cible=remarques</b> → ' + btn('Imprimer') + ' → pour la salle des intervenants.'),
    Step(3, 'Scanne une affiche <b>imprimée</b> avec un téléphone : la bonne page doit s’ouvrir.'),
]
story.append(warn('Si tu ajoutes un nom de domaine plus tard, il faudra <b>réimprimer</b> les affiches.'))
story.append(Spacer(1, 10))

# ---- 9. Jour J
story += section('s9', '9', 'Le jour J', 'pendant les 4 jours')
story += [P('Matériel', 'h2'),
    Step(1, 'Tablettes chargées, chargeurs et multiprises.'),
    Step(2, 'Sur chaque tablette : Réglages → Écran → <b>Verrouillage automatique : Jamais</b>.'),
    Step(3, 'Sur chaque tablette : ouvrir <b>ADRESSE/staff</b> → bouton Partager → '
            f'{btn("Sur l’écran d’accueil")} (l’appli s’ouvre ensuite en un geste).'),
    Step(4, 'Un téléphone en <b>partage de connexion 4G</b> de secours pour les tablettes des soignants.'),
    Step(5, 'Quelques <b>formulaires papier</b> de consentement, au cas où.'),
]
story += [P('Briefing des soignants (5 minutes)', 'h2'),
    Step(6, 'Le PIN ne se donne jamais aux participants.'),
    Step(7, f'Le circuit : {btn("Liste des inscrits")} → chercher le nom → <b>indiquer son nom (soignant)</b> → saisir les mesures → '
            f'médecin traitant (ou « pas de médecin traitant ») → {btn("Patient suivant →")} → {btn("Terminé")}.'),
    Step(8, 'Les couleurs sont une <b>aide</b> : le jugement clinique prime toujours.'),
    Step(11, 'Personne qui a refusé la transmission à son médecin traitant : aucune fiche ne peut lui être envoyée. '
             f'Si elle change d’avis : {btn("Le participant donne son accord")} dans sa fiche.'),
    Step(12, f'Retrouver une personne par son nom : sur l’écran d’inscription, bouton {btn("Espace soignants · liste des inscrits")}, '
             'puis taper son nom dans la recherche.'),
    Step(9, f'Tablette laissée seule : bouton cadenas {btn("Verrouiller")}.'),
    Step(10, f'Participant sans téléphone : {btn("Ajouter manuellement")} (cocher l’accord une fois le papier signé).'),
]
story.append(tip('En haut de l’écran soignants : « N en attente · attente moy. ». Un temps en <b>rouge</b> = plus de '
                 '30 minutes d’attente : renforcer le poste.'))
story.append(PageBreak())

# ---- 10. Après
story += section('s10', '10', 'Après l’événement', '15 min')
story += [
    Step(1, '<b>Fiches pour les médecins traitants</b> (uniquement les personnes qui ont autorisé la transmission) : '
            f'ADRESSE/admin (clé ADMIN_KEY) → onglet {btn("Envois")} → {btn("1. Fiche PDF")} → {btn("Imprimer / Enregistrer en PDF")}. '
            'La fiche contient la preuve de l’accord (texte exact, date et heure, empreinte vérifiée).'),
    Step(2, 'Envoie le PDF au médecin traitant indiqué <b>de préférence par messagerie sécurisée</b> (eHealthBox) ; '
            'par e-mail classique, seulement à l’adresse du cabinet, en vérifiant le destinataire.'),
    Step(3, '<b>Tes contacts check-up</b> : ouvre <b>ADRESSE/admin</b> → tape ta clé PARTNER_KEY → onglet « Mes contacts ». '
            'Pour chaque contact : statut (Nouveau → Contacté → Rendez-vous → Client), tes notes, téléphone et e-mail cliquables. '
            f'Bouton {btn("Télécharger (Excel / CSV)")} pour tout récupérer dans Excel.'),
    Step(7, f'<b>Bilan anonyme</b> (rapport pour ICC, présentations) : espace soignants → bouton {btn("Bilan")} → '
            f'{btn("Exporter le bilan (CSV)")}. Ces chiffres sont anonymes : tu peux les réutiliser librement.'),
    Step(4, 'Une seule relance maximum. Une personne répond « STOP » → tu supprimes son contact et tu ne lui écris plus.'),
    Step(5, f'<b>Fermer l’accès soignants</b> : Worker → {btn("Variables and Secrets")} → supprime {code("STAFF_PIN")}.'),
    Step(6, 'Rien d’autre à faire : les données s’effacent <b>automatiquement</b> (inscriptions '
            'après 30 jours, contacts et remarques après 180 jours).'),
]
story.append(PageBreak())

# ---- Dépannage
story += [P('DÉPANNAGE', 'kicker'), Heading('En cas de problème', 'sd'), Spacer(1, 6)]
faq = [
    ('La mise en ligne (étape 3) échoue', 'Vérifie : Database ID bien remplacé dans <b>wrangler.toml</b> sur la branche '
     '<b>main</b> ; nom du projet = <b>seminaire-triage</b>. Puis Worker → Deployments → relancer. Sinon : capture d’écran du journal à Claude.'),
    ('« Service non configuré » à la connexion soignants', 'Les secrets STAFF_PIN / SESSION_SECRET manquent, sont mal nommés, '
     'ou le PIN fait moins de 8 caractères (étape 4).'),
    ('« Code incorrect »', 'Vérifie majuscules/minuscules. Tu peux remplacer STAFF_PIN par un nouveau code à tout moment.'),
    ('La pastille est orange « Synchro »', 'Le temps réel passe par un mode de secours (mise à jour toutes les 5 s). '
     'Ça fonctionne ; vérifie le Wi-Fi si ça dure.'),
    ('La pastille est rouge « Hors ligne »', 'Plus de réseau. Les saisies sont gardées et partiront au retour du réseau. '
     'Passe sur le partage 4G.'),
    ('Je ne trouve pas une personne dans la liste', 'Vérifie l’orthographe (les accents ne comptent pas) ; choisis le filtre « Tous » ; sinon elle n’est pas inscrite : bouton « Ajouter manuellement ».'),
    ('Le site ne marche plus après une modification', 'Worker → ' + btn('Deployments') + ' → version précédente → '
     + btn('Rollback') + ' : retour immédiat à la version qui marchait.'),
    ('Autre chose', 'Fais une capture d’écran et envoie-la dans la conversation avec Claude.'),
]
t = Table([[P(f'<b>{q}</b>'), P(a)] for q, a in faq], colWidths=[58 * mm, None])
t.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE),
                       ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6)]))
story += [t, Spacer(1, 10), Field('Mes notes', 'f_notes')]


# ---------------------------------------------------------------- Mise en page
class Doc(BaseDocTemplate):
    def afterFlowable(self, f):
        if isinstance(f, Heading):
            self.canv.bookmarkPage(f.key)
            self.canv.addOutlineEntry(f.plain, f.key, level=0)

def deco(c, d):
    c.saveState()
    c.setFillColor(BLUE); c.rect(0, A4[1] - 6, A4[0], 6, stroke=0, fill=1)
    if d.page > 1:
        c.setFont('DV', 8); c.setFillColor(GREY)
        c.drawString(18 * mm, 10 * mm, 'CheckSanté · Guide de mise en ligne')
        c.drawRightString(A4[0] - 18 * mm, 10 * mm, f'page {d.page}')
        c.setFillColor(BLUE); c.drawCentredString(A4[0] / 2, 10 * mm, '↑ Sommaire')
        c.linkRect('', 'toc', (A4[0] / 2 - 30, 8 * mm, A4[0] / 2 + 30, 14 * mm), relative=0, thickness=0)
    c.restoreState()

doc = Doc(OUT, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
          title='CheckSanté – Guide de mise en ligne', author='CheckSanté', subject='Guide pas à pas pour débutant')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([PageTemplate('p', frames=[frame], onPage=deco)])
doc.build(story)
print('ok', OUT)
