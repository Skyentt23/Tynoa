# Tynoa

Petit compagnon de bureau Windows : une pastille en haut de l'écran qui prévient en temps réel de chaque nouveau mail Gmail (expéditeur et objet). Lecture seule : Tynoa ne marque rien comme lu, n'envoie et ne supprime rien.

## Prérequis

- Windows 10 ou 11
- Node.js 20 ou plus récent
- Un compte Gmail avec la **validation en deux étapes** activée

## Créer le mot de passe d'application Gmail

1. Ouvrir <https://myaccount.google.com/apppasswords>.
2. Donner un nom (par exemple « Tynoa ») et créer.
3. Copier les 16 caractères affichés (`abcd efgh ijkl mnop`). Les espaces sont acceptés.

## Lancer

```bash
npm install
npm run dev
```

Au premier lancement, la fenêtre Paramètres s'ouvre : saisir l'adresse Gmail et le mot de passe d'application, cliquer sur **Tester la connexion**, puis sur **Enregistrer**. Le point de la pastille passe au vert.

## Utilisation

- **Nouveau mail** : une carte s'affiche quelques secondes. Un clic l'ouvre dans Gmail, ✕ la ferme, et le survol la garde ouverte.
- **Clic sur la pastille** : les 10 derniers mails de la session ; le compteur repasse à zéro.
- **Point de couleur** : vert = connecté, orange = reconnexion, rouge = erreur (un clic ouvre les paramètres).
- **Icône près de l'horloge** : Paramètres, Pause 1 h, Pause jusqu'à réactivation, Quitter.
- **Plein écran** (jeu, vidéo) : le widget se masque tout seul.

## Développement

```bash
npm test            # tests unitaires (Vitest)
npm run typecheck   # vérification TypeScript
npm run build:unpack
```

Données dans `%APPDATA%\Tynoa\` : `settings.json` (réglages), `credentials.bin` (mot de passe chiffré par le coffre Windows) et `logs\main.log`.

## Limites de la V1

Gmail uniquement, notifications simples sans IA, pas d'agenda, pas d'installateur signé.
