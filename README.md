# Tynoa

Petit compagnon de bureau Windows : une pastille en haut de l'écran qui prévient en temps réel des nouveaux mails Gmail et des événements Google Agenda. Lecture seule : Tynoa ne marque rien comme lu, n'envoie, ne modifie et ne supprime rien.

## Prérequis

- Windows 10 ou 11
- Node.js 20 ou plus récent
- Un compte Google

## Mail : mot de passe d'application Gmail

1. Ouvrir <https://myaccount.google.com/apppasswords> (la validation en deux étapes doit être activée).
2. Créer un mot de passe nommé « Tynoa » et copier les 16 caractères (les espaces sont acceptés).
3. Dans Paramètres → **Mail**, saisir l'adresse et le mot de passe, puis **Tester la connexion** et **Enregistrer**.

Ne pas supprimer ce mot de passe dans le compte Google ensuite : Tynoa le garde, chiffré, et n'a plus rien à redemander. Changer le mot de passe principal du compte Google révoque tous les mots de passe d'application : il faudra alors en recréer un.

## Agenda : lien iCal secret

1. Ouvrir Google Agenda **sur ordinateur** → ⚙ **Paramètres**.
2. À gauche, sous « Paramètres de mes agendas », cliquer sur l'agenda voulu.
3. Section **Intégrer l'agenda** → **Adresse secrète au format iCal** → copier.
4. Dans Paramètres de Tynoa → **Agenda** → **Ajouter des agendas** : coller le lien (un par ligne pour plusieurs agendas), puis **Enregistrer**.

Le lien secret donne accès à l'agenda : Tynoa le garde chiffré et ne le réaffiche jamais. Fonctionne aussi avec les liens iCal d'iCloud ou d'Outlook (`webcal://` accepté).

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
- `credentials.bin` : mot de passe d'application, chiffré ;
- `calendars.bin` : liens iCal secrets, chiffrés ;
- `logs\main.log` : journal.

## Limites actuelles

Lecture seule ; mail Gmail uniquement ; agenda relu toutes les 5 minutes ; notifications sans IA ; pas d'installateur signé.
