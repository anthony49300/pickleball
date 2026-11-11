# 🏓 JF Pickleball — Générateur de rotations

Application web pour organiser des sessions de pickleball entre joueurs : elle génère automatiquement le planning des matchs tour par tour, en essayant de varier au maximum les partenaires et les adversaires, tout en équilibrant le temps de jeu de chacun. Elle gère aussi le suivi des scores, le classement, des statistiques d'équité, et l'historique de vos sessions passées.

Fonctionne entièrement dans le navigateur, sans compte ni connexion internet requise, et sans rien installer sur un serveur.

---

## Sommaire

- [Démarrage rapide](#démarrage-rapide)
- [Les quatre écrans](#les-quatre-écrans)
- [Préparer une session](#préparer-une-session)
- [Groupes de joueurs réguliers](#groupes-de-joueurs-réguliers)
- [Niveau, arrivées et départs d'un joueur](#niveau-arrivées-et-départs-dun-joueur)
- [Mode expert (réglages de l'algorithme)](#mode-expert-réglages-de-lalgorithme)
- [Jouer : le planning tour par tour](#jouer--le-planning-tour-par-tour)
- [Saisie des scores et classement](#saisie-des-scores-et-classement)
- [Podium et badges](#podium-et-badges)
- [Équité de la session](#équité-de-la-session)
- [Historique des sessions](#historique-des-sessions)
- [Partager et exporter](#partager-et-exporter)
- [Sauvegarde automatique et réinitialisation](#sauvegarde-automatique-et-réinitialisation)
- [Apparence : identité visuelle et thème](#apparence--identité-visuelle-et-thème)
- [Installer l'application](#installer-lapplication)
- [Questions fréquentes](#questions-fréquentes)

---

## Démarrage rapide

1. Dans **Préparer**, ajoutez les joueurs présents (tapez un nom puis Entrée, ou collez une liste séparée par des virgules).
2. Choisissez le nombre de terrains disponibles et le nombre de tours à jouer.
3. Touchez **Générer les matchs** : l'application passe directement à l'écran **Jouer**.
4. Pour chaque match, saisissez le score avec les boutons − / + (ou touchez le chiffre pour le taper), puis passez au tour suivant.
5. Le classement, le podium et les statistiques se mettent à jour automatiquement dès qu'un score est saisi.

Tout est sauvegardé automatiquement pendant que vous travaillez (voir [Sauvegarde automatique](#sauvegarde-automatique-et-réinitialisation)).

---

## Les quatre écrans

L'application est organisée autour des moments d'une session. Sur téléphone, la barre en bas de l'écran permet de passer de l'un à l'autre ; sur ordinateur, elle devient une colonne à gauche.

| Écran | Rôle |
|---|---|
| **Préparer** | Joueurs, terrains, tours et réglages, puis génération du planning. |
| **Jouer** | Le tour en cours : matchs, joueurs au banc et saisie des scores. Le badge (ex. « T3 ») indique le tour en cours. |
| **Classement** | Podium, badges, classement détaillé et équité de la session. |
| **Historique** | La session en cours et les sessions enregistrées sur cet appareil. |

En haut de l'écran, le sélecteur **Rotation ▾** permet de passer au mode **Tournoi**, et le menu **⋮** regroupe les actions ponctuelles : thème clair/sombre, identité visuelle, copie et partage, « À propos » et réinitialisation.

---

## Préparer une session

L'écran **Préparer** contient deux blocs.

**Joueurs**
- Chaque joueur apparaît sous forme de pastille, avec des points qui indiquent son niveau (voir plus bas).
- Pour ajouter des joueurs, tapez un nom puis Entrée (ou **Ajouter**). Vous pouvez aussi coller une liste séparée par des virgules : chaque nom devient une pastille. Les doublons (même nom, majuscules comprises) sont ignorés.
- **Saisie en texte** affiche la liste brute, un joueur par ligne : pratique pour corriger ou coller une longue liste d'un coup.

**Format**
- **Terrains** : combien de terrains sont disponibles simultanément.
- **Tours** : combien de rotations seront jouées dans la session.
- Un rappel indique combien de joueurs jouent et combien restent au banc à chaque tour.
- **Noms des terrains** *(optionnel)* : par défaut « Terrain 1 », « Terrain 2 »… ; vous pouvez les nommer (ex. « Court central, Court 2 »).
- **Pas de banc deux fois de suite** : un joueur n'est jamais mis au repos sur deux tours consécutifs.

### Cas particulier : 6 joueurs sur 2 terrains ou plus

Avec exactement 6 joueurs actifs et au moins 2 terrains, l'application organise automatiquement **1 match en double (4 joueurs) + 1 match en simple (2 joueurs)** à chaque tour, plutôt que de laisser 2 joueurs au repos : personne ne reste sur le banc dans cette configuration.

---

## Groupes de joueurs réguliers

Si vous rejouez souvent avec les mêmes personnes (ex. un groupe fixe du mardi soir), ouvrez **Groupes de joueurs réguliers** sous la liste des joueurs pour :

- **Enregistrer** la liste de joueurs actuelle sous un nom (ex. « Mardi soir »).
- La **recharger** la prochaine fois, sans tout retaper.
- La **supprimer** si elle n'est plus utile.

Ces groupes ne contiennent que des noms, pas de scores ni de réglages, et ne sont jamais effacés par « Tout réinitialiser » (voir plus bas).

---

## Niveau, arrivées et départs d'un joueur

Touchez la pastille d'un joueur pour ouvrir sa fiche :

- **Niveau** (1 Débutant à 5 Expert) : sert à équilibrer la force des deux équipes d'un même terrain. Au niveau 3 (valeur par défaut), le joueur ne pèse pas sur l'équilibrage : si vous ne touchez à aucun niveau, le planning est identique à celui d'une session sans niveaux.
- **Arrive au tour** / **Part après le tour** : pour un joueur qui n'est pas là toute la session. Il n'apparaît sur aucun match en dehors de sa présence et est listé comme absent sur les tours concernés. La pastille l'indique (« dès T3 », « jusqu'à T6 »).
- **Retirer de la session** : enlève le joueur de la liste.

---

## Mode expert (réglages de l'algorithme)

Dans **Préparer**, ouvrez **Mode expert** pour affiner la façon dont les matchs sont composés :

| Réglage | Effet |
|---|---|
| **Varier les partenaires** | Plus il est élevé, plus l'algorithme évite de refaire jouer deux personnes ensemble dans la même équipe. |
| **Varier les adversaires** | Plus il est élevé, plus l'algorithme évite de refaire s'affronter les mêmes joueurs. |
| **Égaliser le temps de jeu** | Priorise les joueurs qui ont le moins joué jusqu'ici. |
| **Équilibrer selon le niveau** | Rapproche la force des deux équipes d'un terrain. Sans effet tant qu'aucun niveau n'est renseigné. |
| **Précision du calcul** | Une valeur élevée cherche une combinaison plus optimale (mais plus lente à calculer) ; une valeur basse calcule quasi instantanément. |
| **Partenaires testés par joueur** | Nombre de partenaires potentiels testés par joueur pour accélérer le calcul. |
| **Pénaliser fortement les répétitions** *(interrupteur)* | Il devient quasiment impossible qu'un même duo se reforme une 3ᵉ fois dans la session. |
| **Identifiant de session** | La « graine » du tirage. Mêmes joueurs, même format et même identifiant : même planning. Le bouton à côté en tire un nouveau. |

Les réglages par défaut conviennent à la grande majorité des sessions.

---

## Jouer : le planning tour par tour

L'écran **Jouer** affiche un tour à la fois :

- En haut, le numéro du tour et une frise de tous les tours (tours complets, tour en cours, tour affiché). Touchez un segment de la frise, ou les flèches, pour changer de tour.
- **Au banc** : les joueurs au repos sur ce tour, et les absents s'il y a des arrivées/départs.
- Une carte par terrain, avec les deux équipes l'une au-dessus de l'autre.
- **Ensuite** : un aperçu du tour suivant, pour que les joueurs du banc sachent où aller.
- En bas, le bouton **Tour suivant** (ou **Voir le classement** au dernier tour). Il reste utilisable même si vous ne notez pas les scores ; il indique alors combien de scores manquent.

---

## Saisie des scores et classement

Pour chaque équipe, utilisez les boutons − / + ou touchez le chiffre pour le taper au clavier (Entrée passe au score suivant). Dès qu'un score est entré :

- La carte du match indique le gagnant. Une égalité, impossible au pickleball, est signalée comme probable erreur de saisie.
- Le **classement** se met à jour dans l'écran **Classement**. Sur téléphone, chaque joueur a une carte (victoires, défaites, écart) ; touchez-la pour le détail : % de victoires, points marqués et encaissés, moyennes, plus large victoire et série en cours. Sur ordinateur, le tableau complet est affiché.
- En cas d'égalité, le classement départage dans cet ordre : **1. taux de victoire → 2. écart moyen par match → 3. nombre de victoires.**

---

## Podium et badges

En haut du classement, un **podium** met en avant les 3 premiers joueurs (dès que la session compte au moins 3 joueurs classés).

Des **badges** sont décernés automatiquement selon les scores saisis (chacun n'apparaît que si la condition correspondante est remplie) :

| Badge | Récompense |
|---|---|
| Canonnière | Le plus de points marqués en moyenne par match |
| Roc Défensif | Le moins de points encaissés en moyenne par match |
| Incollable en Duo | La paire de coéquipiers avec le plus de victoires ensemble (3 au minimum) |
| Maître du Différentiel | Le meilleur écart moyen par match |
| Sang-Froid | Le plus de victoires arrachées à 2 points d'écart ou moins |
| Poissard | Le plus de défaites serrées (≤ 2 points), malgré un écart global positif |
| Montagnes Russes | Le résultat (victoire/défaite) qui change le plus souvent d'un match à l'autre |

---

## Équité de la session

Sous le classement, le bloc **Équité de la session** résume, une fois le planning généré :

- Le nombre minimum et maximum de matchs joués et de passages au banc selon les joueurs.
- Les duos et les oppositions les plus fréquents.
- Le détail par joueur (matchs joués, simples, passages au banc).
- La matrice **Qui a joué avec qui** : pour chaque paire de joueurs, le nombre de fois où ils ont joué ensemble (**Partenaires**) ou l'un contre l'autre (**Adversaires**). Plus la case est colorée, plus la fréquence est élevée.

---

## Historique des sessions

L'écran **Historique** affiche en premier la **session en cours** (progression, nombre de joueurs) avec deux actions : **Reprendre** (retour à l'écran Jouer) et **Enregistrer dans l'historique**, qui archive l'état courant (joueurs, réglages, planning et scores). Vous pouvez ensuite, à tout moment :

- **Charger** une session enregistrée pour reprendre exactement où vous en étiez (scores compris).
- La **supprimer** individuellement, ou **vider l'historique** d'un coup.

---

## Partager et exporter

- **Copier les matchs** *(menu ⋮)* : copie le planning sous forme de texte, prêt à coller dans un message.
- **Partager la session** *(menu ⋮)* : copie un lien contenant l'intégralité de la session (joueurs, réglages, scores). Quiconque ouvre ce lien retrouve la même session, sans rien ressaisir.
- **Image** *(écran Classement)* : génère une image (PNG) du podium, des badges et du classement, à télécharger ou partager.
- **Partager** *(écran Classement)* : le même lien de partage, disponible directement depuis le classement.

---

## Sauvegarde automatique et réinitialisation

L'indicateur **Enregistré** en haut de l'écran confirme que la session en cours (joueurs, réglages, scores) est sauvegardée automatiquement sur cet appareil : même en cas de fermeture accidentelle, tout est retrouvé à la réouverture.

**Tout réinitialiser…** *(menu ⋮)* efface la session en cours, la sauvegarde automatique et tout l'historique des sessions enregistrées (une confirmation est demandée, l'action est irréversible). Les **groupes de joueurs réguliers**, eux, sont préservés.

---

## Apparence : identité visuelle et thème

Le menu **⋮** propose trois identités visuelles :

- **Nocturne** : bleu nuit et jaune balle, l'identité d'origine de l'application.
- **Plein air** : vert de court et bleu, la plus lisible en plein soleil.
- **Tableau d'affichage** : contraste fort, orange et gros chiffres façon panneau de score.

Chacune existe en thème clair et sombre (**Passer en thème clair / sombre**, dans le même menu). Sans choix de votre part, Nocturne s'affiche en sombre et les deux autres en clair. Les choix sont mémorisés sur cet appareil.

---

## Installer l'application

L'application peut être utilisée :

- **Directement dans un navigateur**, sans rien installer. Une connexion est nécessaire pour la toute première visite ; l'application se met alors entièrement en cache (pages Rotation et Tournoi, scripts, polices, icônes) et fonctionne ensuite **sans réseau**, même après fermeture du navigateur.
- **Installée comme application** sur mobile ou desktop (PWA) via l'option "Installer" ou "Ajouter à l'écran d'accueil" proposée par le navigateur, pour y accéder comme une app à part entière, hors ligne comprise. Un appui long sur l'icône propose des raccourcis vers **Jouer** et le mode **Tournoi**.
- **Sous forme d'APK Android**, disponible depuis le dépôt du projet : celle-ci fonctionne intégralement hors ligne, y compris au tout premier lancement, puisque l'application est directement embarquée dans le fichier installé.

---

## Questions fréquentes

**Est-ce que je peux revenir en arrière si je me trompe dans un score ?**
Oui, il suffit de modifier la valeur saisie (− / + ou clavier) : le classement et les statistiques se recalculent immédiatement. Les flèches ou la frise des tours permettent de revenir sur un tour précédent.

**Puis-je générer plusieurs plannings différents pour les mêmes joueurs ?**
Oui : dans **Mode expert**, tirez un nouvel identifiant de session avec le bouton à côté du champ, puis regénérez les matchs.

**Que se passe-t-il si je régénère les matchs après avoir déjà saisi des scores ?**
L'application conserve les tours déjà notés et ne recalcule que la suite. Si vous changez significativement les réglages (nombre de joueurs, de terrains ou de tours), mieux vaut vérifier que les scores affichés correspondent toujours aux bons matchs, ou enregistrer d'abord la session actuelle dans l'historique avant de régénérer.

**Mes données sont-elles envoyées quelque part ?**
Non. Tout (session en cours, historique, groupes de joueurs, apparence choisie) est stocké uniquement sur votre appareil, dans le navigateur. L'application ne charge aucune ressource externe : polices et bibliothèques sont embarquées.

**Comment l'application se met-elle à jour si elle fonctionne hors ligne ?**
Chaque fichier est servi depuis le cache de l'appareil, et une version plus récente est téléchargée en arrière-plan quand une connexion est disponible. Une mise à jour du site apparaît donc au chargement suivant.

---

## Notes techniques

- **Mode hors ligne** : `service-worker.js` (à la racine) met en cache tous les fichiers listés dans `PRECACHE_URLS`. **Tout nouveau fichier du site doit y être ajouté**, sinon il ne sera disponible hors ligne qu'après avoir été chargé une première fois. Le service worker n'est enregistré qu'en http(s) (pas en `file://`) et pas dans l'APK Android, qui embarque déjà ses fichiers (voir `js/shared/pwa.js`).
- **Polices** : fichiers woff2 dans `fonts/`, déclarés dans `css/fonts.css`, sous licence SIL Open Font License 1.1 (voir `fonts/OFL.txt`).
