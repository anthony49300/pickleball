# 🏓 JF Pickleball — Générateur de rotations

Application web pour organiser des sessions de pickleball entre joueurs : elle génère automatiquement le planning des matchs tour par tour, en essayant de varier au maximum les partenaires et les adversaires, tout en équilibrant le temps de jeu de chacun. Elle gère aussi le suivi des scores, le classement, des statistiques d'équité, et l'historique de vos sessions passées.

Fonctionne entièrement dans le navigateur, sans compte ni connexion internet requise, et sans rien installer sur un serveur.

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Configuration d'une session](#configuration-dune-session)
- [Groupes de joueurs réguliers](#groupes-de-joueurs-réguliers)
- [Arrivées et départs en cours de session](#arrivées-et-départs-en-cours-de-session)
- [Options avancées de l'algorithme](#options-avancées-de-lalgorithme)
- [Le planning des matchs](#le-planning-des-matchs)
- [Saisie des scores et classement](#saisie-des-scores-et-classement)
- [Podium et badges](#podium-et-badges)
- [Matrice d'affinité (heatmap)](#matrice-daffinité-heatmap)
- [Statistiques d'équité de session](#statistiques-déquité-de-session)
- [Historique des sessions](#historique-des-sessions)
- [Partager et exporter](#partager-et-exporter)
- [Sauvegarde automatique et réinitialisation](#sauvegarde-automatique-et-réinitialisation)
- [Thème clair / sombre](#thème-clair--sombre)
- [Installer l'application](#installer-lapplication)
- [Questions fréquentes](#questions-fréquentes)

---

## Démarrage rapide

1. Renseignez la liste des joueurs présents.
2. Choisissez le nombre de terrains disponibles et le nombre de tours à jouer.
3. Cliquez sur **⚡ Générer les matchs**.
4. Le planning tour par tour s'affiche : à chaque match joué, entrez le score de chaque équipe.
5. Le classement, le podium et les statistiques se mettent à jour automatiquement dès qu'un score est saisi.

Tout est sauvegardé automatiquement pendant que vous travaillez — pas besoin de cliquer sur "Enregistrer" à chaque étape (voir [Sauvegarde automatique](#sauvegarde-automatique-et-réinitialisation)).

---

## Configuration d'une session

En haut de la page, la section **🔧 Configuration de Session** permet de définir :

- **⚔️ Joueurs** : un nom par ligne, ou séparés par des virgules. Le nombre de joueurs détectés s'affiche à côté du champ, avec une alerte si des doublons sont repérés dans la liste.
- **🏟️ Terrains** : combien de terrains sont disponibles simultanément.
- **🔄 Tours** : combien de rotations seront jouées dans la session.
- **🎲 ID Session** : une "graine" qui détermine le tirage des matchs. À joueurs, terrains et tours identiques, la **même graine reproduit exactement le même planning** — pratique pour recréer une session ou la partager avec quelqu'un d'autre. Le bouton 🔀 génère une nouvelle graine aléatoire si vous voulez un planning différent.
- **🏷️ Noms des terrains** *(optionnel)* : par défaut les terrains sont numérotés ("Terrain 1", "Terrain 2"...), mais vous pouvez leur donner des noms personnalisés (ex: "Court Central, Court 1, Terrain A").

### Cas particulier : 6 joueurs sur 2 terrains ou plus

Avec exactement 6 joueurs actifs et au moins 2 terrains, l'application organise automatiquement **1 match en double (4 joueurs) + 1 match en simple (2 joueurs)** à chaque tour, plutôt que de laisser 2 joueurs au repos — personne ne reste sur le banc dans cette configuration.

---

## Groupes de joueurs réguliers

Si vous rejouez souvent avec les mêmes personnes (ex: un groupe fixe du mardi soir), ouvrez **👥 Groupes de Joueurs Réguliers** pour :

- **Enregistrer** la liste de joueurs actuellement saisie sous un nom (ex: "Mardi Soir").
- La **recharger en un clic** la prochaine fois, sans tout retaper.
- La **supprimer** si elle n'est plus utile.

Ces groupes sont indépendants d'une session donnée : ils ne contiennent que des noms, pas de scores ni de réglages, et ne sont jamais effacés par un "Réinitialiser la page" (voir plus bas).

---

## Arrivées et départs en cours de session

Si un ou plusieurs joueurs n'arrivent pas dès le début, ou repartent avant la fin, ouvrez **⏱️ Arrivées & Départs des Joueurs** et indiquez, pour chaque joueur concerné, à partir de quel tour il commence à jouer et jusqu'à quel tour il reste. L'algorithme adapte automatiquement le planning : le joueur n'apparaît sur aucun match en dehors de sa présence, et est listé comme absent sur les tours concernés.

---

## Options avancées de l'algorithme

Ouvrez **⚙️ Options d'Algorithme Avancées** pour affiner la façon dont les matchs sont composés :

| Réglage | Effet |
|---|---|
| **Poids Partenaires** | Plus il est élevé, plus l'algorithme évite de refaire jouer deux personnes ensemble dans la même équipe. |
| **Poids Adversaires** | Plus il est élevé, plus l'algorithme évite de refaire s'affronter les deux mêmes équipes. |
| **Équilibre de Jeu** | Priorise les joueurs qui ont le moins joué jusqu'ici, pour égaliser le temps de jeu total sur la session. |
| **Largeur Faisceau** | Précision du calcul : une valeur élevée cherche une combinaison plus optimale (mais plus lente à calculer) ; une valeur basse calcule quasi instantanément, au prix d'un résultat un peu moins optimisé. |
| **Présélection** | Nombre de partenaires potentiels testés par joueur pour accélérer le calcul. |
| **Pénalités quadratiques pour les répétitions** *(interrupteur)* | Une fois activé, il devient quasiment impossible qu'un même duo se reforme une 3ᵉ fois dans la session. |
| **Éviter le banc deux fois de suite** *(interrupteur)* | Empêche qu'un joueur soit mis au repos sur deux tours consécutifs. |

Les réglages par défaut conviennent à la grande majorité des sessions ; ces options sont surtout utiles si vous avez un groupe avec des contraintes particulières (beaucoup de joueurs, beaucoup de tours, etc.).

---

## Le planning des matchs

Une fois généré, le planning s'affiche tour par tour, avec pour chaque tour :

- Le ou les matchs à jouer, terrain par terrain, avec les deux équipes affichées face à face (visuel "terrain de pickleball").
- Les joueurs au repos sur ce tour, le cas échéant.
- Les joueurs absents sur ce tour (si des arrivées/départs ont été configurés).

Un **stepper de session** en haut du planning permet de visualiser en un coup d'œil la progression (tours déjà joués ✓, tour en cours mis en évidence, tours à venir), et de naviguer directement vers un tour en cliquant dessus.

---

## Saisie des scores et classement

Pour chaque match, saisissez le score des deux équipes directement dans le planning. Dès qu'un score est entré :

- Le **classement** apparaît (ou se met à jour) automatiquement en bas de page, avec pour chaque joueur : matchs joués, victoires, défaites, % de victoires, points marqués/encaissés, différentiel, moyenne de points par match, plus grosse victoire, plus lourde défaite, et la série de victoires ou défaites en cours.
- En cas d'égalité, le classement départage dans cet ordre : **1. nombre de victoires → 2. différentiel de points → 3. points marqués.**

---

## Podium et badges

Au-dessus du classement, un **podium** met en avant les 3 premiers joueurs (dès que la session compte au moins 3 joueurs classés).

Des **badges honorifiques** sont décernés automatiquement selon les scores saisis (chacun n'apparaît que si la condition correspondante est remplie) :

| Badge | Récompense |
|---|---|
| 💥 Canonnière | Le plus de points marqués au total |
| 🛡️ Roc Défensif | Le moins de points encaissés |
| 🔥 Incollable en Duo | La paire de coéquipiers avec le plus de victoires ensemble |
| 🚀 Maître du Différentiel | Le meilleur différentiel de points |
| 🧊 Sang-Froid | Le plus de victoires arrachées à 2 points d'écart ou moins |
| 😬 Poissard | Le plus de défaites serrées (≤ 2 points), malgré un différentiel global positif |
| 🎢 Montagnes Russes | Le résultat (victoire/défaite) qui change le plus souvent d'un match à l'autre |

---

## Matrice d'affinité (heatmap)

Cette matrice visuelle affiche, pour chaque paire de joueurs, le nombre de fois où ils ont joué **ensemble** (mode Coéquipiers 🤝) ou **l'un contre l'autre** (mode Adversaires ⚔️) au cours de la session. Plus la case est colorée intensément, plus la fréquence est élevée — utile pour repérer d'un coup d'œil si certains duos se sont trop souvent recroisés.

---

## Statistiques d'équité de session

La section **📊 Statistiques & Équité de Session** résume, une fois le planning généré :

- L'équilibre du temps de jeu (nombre minimum et maximum de matchs joués selon les joueurs).
- L'équilibre du banc (nombre minimum et maximum de passages au repos).
- Les paires de coéquipiers les plus fréquentes.
- Les oppositions (duels d'équipes) les plus fréquentes.

Ces indicateurs permettent de vérifier rapidement que la session reste équitable, sans avoir à éplucher le planning tour par tour.

---

## Historique des sessions

Le bouton **💾 Enregistrer les modifications** archive l'état courant (joueurs, réglages, planning et scores) dans l'historique, en bas de page. Vous pouvez ensuite, à tout moment :

- **Recharger** une session enregistrée pour reprendre exactement où vous en étiez (scores compris).
- La **supprimer** individuellement, ou **vider tout l'historique** d'un coup.

---

## Partager et exporter

Plusieurs façons de faire sortir une session de l'application :

- **📋 Copier les matchs** : copie le planning sous forme de texte, prêt à coller dans un message ou un email.
- **🔗 Partager via un lien** : génère un lien contenant l'intégralité de la session (joueurs, réglages, scores). Quiconque ouvre ce lien retrouve exactement la même session, sans rien avoir à ressaisir.
- **📷 Exporter le classement** : génère une image (PNG) du podium, des badges et du tableau de classement, téléchargeable ou partageable telle quelle.
- **🔗 Partager le classement** : identique au lien de partage ci-dessus (même session complète), simplement disponible directement depuis la section classement par commodité.

---

## Sauvegarde automatique et réinitialisation

Un badge **💾 Sauvegardé** dans l'en-tête confirme que votre session en cours (joueurs, réglages, scores) est sauvegardée automatiquement au fil de l'eau sur cet appareil — même en cas de fermeture accidentelle de l'onglet, tout est retrouvé à la réouverture.

Le bouton **🔄 Réinitialiser la page** efface la session en cours, la sauvegarde automatique et tout l'historique des sessions enregistrées (une confirmation est demandée avant d'agir, l'action est irréversible). Les **groupes de joueurs réguliers**, eux, sont volontairement préservés — ce sont des données indépendantes d'une session donnée.

---

## Thème clair / sombre

Le bouton 🌙/☀️ dans l'en-tête bascule entre thème sombre (par défaut) et thème clair. Le choix est mémorisé sur cet appareil et réappliqué automatiquement à chaque visite.

---

## Installer l'application

L'application peut être utilisée :

- **Directement dans un navigateur**, sans rien installer (une connexion est nécessaire pour charger la page ; une fois chargée, la saisie des scores et toutes les fonctionnalités n'ont besoin d'aucun réseau).
- **Installée comme application** sur mobile ou desktop (PWA) via l'option "Installer" ou "Ajouter à l'écran d'accueil" proposée par le navigateur, pour y accéder comme une app à part entière.
- **Sous forme d'APK Android**, disponible depuis le dépôt du projet — celle-ci fonctionne intégralement hors ligne, y compris au tout premier lancement, puisque l'application est directement embarquée dans le fichier installé.

---

## Questions fréquentes

**Est-ce que je peux revenir en arrière si je me trompe dans un score ?**
Oui, il suffit de modifier la valeur saisie dans le champ correspondant — le classement et les statistiques se recalculent immédiatement.

**Puis-je générer plusieurs plannings différents pour les mêmes joueurs ?**
Oui, en cliquant sur 🔀 à côté de l'ID Session pour tirer une nouvelle graine, puis en regénérant les matchs.

**Que se passe-t-il si je régénère les matchs après avoir déjà saisi des scores ?**
L'application essaie de conserver automatiquement les scores déjà saisis. Si vous changez significativement les réglages (nombre de joueurs, de terrains ou de tours), mieux vaut vérifier que les scores affichés correspondent toujours aux bons matchs, ou enregistrer d'abord la session actuelle dans l'historique avant de régénérer.

**Mes données sont-elles envoyées quelque part ?**
Non. Tout (session en cours, historique, groupes de joueurs, thème choisi) est stocké uniquement sur votre appareil, dans le navigateur. Rien n'est envoyé à un serveur.
