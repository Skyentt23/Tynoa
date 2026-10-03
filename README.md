# Tynoa

Petit compagnon de bureau Windows : une pastille en haut de l'écran qui prévient en temps réel des nouveaux mails Gmail et des événements Google Agenda. Lecture seule : Tynoa ne marque rien comme lu, n'envoie, ne modifie et ne supprime rien.

## Prérequis

- Windows 10 ou 11
- Node.js 20 ou plus récent
- Un compte Google

## Connexion Google (recommandé : mail et agenda)

À faire **une seule fois**, environ 10 minutes. Le projet Google Cloud est personnel et gratuit.

### 1. Créer le projet et activer l'API Agenda

1. Ouvrir <https://console.cloud.google.com/> avec votre compte Google.
2. En haut, ouvrir le sélecteur de projet, puis **Nouveau projet**, le nommer « Tynoa » et cliquer sur **Créer**. Vérifier ensuite que « Tynoa » est bien le projet sélectionné.
3. Menu ☰ → **API et services** → **Bibliothèque** → rechercher **Google Calendar API** → **Activer**.

Il n'est pas nécessaire d'activer l'API Gmail : Tynoa lit le mail en IMAP.

### 2. Configurer l'écran de consentement

1. Menu ☰ → **API et services** → **Écran de consentement OAuth** (ou **Google Auth Platform**), puis **Commencer**.
2. Nom de l'application : « Tynoa ». Adresse e-mail d'assistance : la vôtre.
3. Audience : **Externe**. Coordonnées : votre adresse. Accepter le règlement, puis **Créer**.
4. Onglet **Audience** → **Publier l'application** → confirmer. Le statut doit indiquer **En production**.

⚠️ Cette étape est indispensable. En mode « Test », Google fait expirer la connexion tous les 7 jours.

### 3. Créer l'identifiant client

1. Onglet **Clients** (ou **Identifiants** → **Créer des identifiants** → **ID client OAuth**).
2. Type d'application : **Application de bureau**. Nom : « Tynoa ». Cliquer sur **Créer**.
3. Copier l'**ID client** (`….apps.googleusercontent.com`) et le **Code secret du client** (`GOCSPX-…`).

### 4. Se connecter dans Tynoa

1. Paramètres → section **Compte Google** : coller l'identifiant et le secret client.
2. Cliquer sur **Se connecter avec Google**. Une page Google s'ouvre dans le navigateur.
3. Google affiche **« Google n'a pas validé cette application »** : c'est normal pour un outil personnel. Cliquer sur **Paramètres avancés**, puis **Accéder à Tynoa (non sécurisé)**.
4. Cocher les accès demandés (agenda en lecture, Gmail) et cliquer sur **Continuer**. La page indique « Connexion réussie » : revenir à Tynoa.

Rien n'est à ressaisir ensuite : la connexion est conservée, chiffrée par le coffre Windows, et se renouvelle seule. Si elle est révoquée (changement du mot de passe Google, retrait de l'accès), une carte « Connexion Google expirée » invite à se reconnecter en un clic.

## Sans compte Google (secours) : mot de passe d'application

Pour le mail uniquement, sans l'agenda :

1. Ouvrir <https://myaccount.google.com/apppasswords> (la validation en deux étapes doit être activée).
2. Créer un mot de passe nommé « Tynoa » et copier les 16 caractères (les espaces sont acceptés).
3. Dans Paramètres → **Sans compte Google**, saisir l'adresse et le mot de passe, puis **Tester la connexion** et **Enregistrer**.

## Lancer

```bash
npm install
npm run dev
```

## Utilisation

- **Nouveau mail** : une carte s'affiche quelques secondes. Un clic l'ouvre dans Gmail, ✕ la ferme, et le survol la garde ouverte.
- **Rappel d'événement** : une carte 📅 s'affiche 10 minutes avant (délai réglable) et reste jusqu'au début de l'événement.
- **Prochain événement** : dans l'heure qui précède, la pastille affiche « HH:MM Titre ».
- **Résumé du jour** : à la première lecture de la journée (à partir de 5 h), la liste des événements du jour.
- **Changements du jour** : événement ajouté, déplacé ou annulé, s'il concerne aujourd'hui.
- **Pastille** : un clic affiche les 10 derniers mails. Le badge violet compte les mails non vus.
- **⋮⋮** : maintenir le clic pour déplacer le widget ; sa position est retenue.
- **Point de couleur** : vert = connecté, orange = reconnexion, rouge = erreur (un clic ouvre les paramètres).
- **Icône près de l'horloge** : Paramètres, Replacer le widget, Pause 1 h, Pause jusqu'à réactivation, Quitter.
- **Plein écran** (jeu, vidéo) : le widget se masque tout seul.

## Développement

```bash
npm test            # tests unitaires (Vitest)
npm run typecheck   # vérification TypeScript
npm run build:unpack
```

Données dans `%APPDATA%\Tynoa\` :

- `settings.json` : réglages ;
- `google-token.bin` : connexion Google, chiffrée ;
- `credentials.bin` : mot de passe de secours, chiffré ;
- `logs\main.log` : journal.

## Limites actuelles

Lecture seule ; Google uniquement (pas d'Outlook ni d'iCloud) ; notifications sans IA ; pas d'installateur signé.
