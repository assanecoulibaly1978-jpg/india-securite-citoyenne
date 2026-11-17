# INDIA — correction expérimentale : secours sur place

## Périmètre et état vérifié

Correction appliquée uniquement à `/Users/assane/india-experiences/accident-20261116-145843`, servie sur `http://127.0.0.1:8781/#converser`.

La principale `/Users/assane/secours-citoyen` n’a subi aucune modification : ses 265 fichiers restent identiques à l’état de référence et son processus d’origine reste en place. Aucun rechargement ni requête HTTP de contrôle adressée à 8780 pendant cette correction.

Une sauvegarde complète de la copie expérimentale a précédé les modifications : `/Users/assane/india-experiences/sauvegardes/avant-correction-prise-en-charge-20261116-162940`, 217 fichiers comparés par SHA-256.

## Causes reproduites

1. La reconnaissance de présence acceptait « sont sur place » et « sont déjà sur place », mais pas « sont maintenant sur place » ni « sont actuellement sur place ».
2. Après une virgule, « carrefour Siporex » était reconnu, mais pas « au carrefour Siporex ». Un repère fourni ensuite pouvait également remplacer la commune au lieu de la compléter.
3. Les consignes génériques citaient systématiquement feu et fumées, même lorsque seul le carburant avait été signalé, et allongeaient la réponse.

## Résultat

Après :

> Accident entre une voiture et une moto à Yopougon, au carrefour Siporex. Trois blessés, fuite de carburant.

puis la phrase exacte :

> Les pompiers sont maintenant sur place et prennent en charge les trois blessés.

INDIA distingue maintenant :

- **Situation : Accident en cours**.
- **Prise en charge : Secours sur place, selon le témoin**.

Elle conserve Yopougon, carrefour Siporex, les véhicules, les trois blessés et la fuite. Elle conseille de suivre les pompiers et de rester à distance du carburant, sans demander mécaniquement un nouvel appel. Les boutons d’appel restent accessibles avec confirmation.

Le récapitulatif conserve son titre **Signalement préparé — non transmis**. Une aggravation est à signaler aux secours présents, sans prétendre qu’INDIA les contacte. Un appel infructueux mentionné avec leur présence ne fait pas disparaître cette présence.

Les dangers rapportés sont séparés des risques simplement possibles. « Un risque d’incendie » ne devient pas « Feu signalé ». Une observation explicite ultérieure du feu actualise cette distinction ; un risque possible n’efface pas un danger déjà rapporté.

Sur le scénario de comparaison (repère « carrefour Siporex ») : première réponse de **123 à 90 mots**, réponse après présence des secours de **123 à 80 mots**, récapitulatif compris. Ce sont des mesures sur ce scénario, pas une garantie de longueur universelle.

## Validation

- **629 tests réussis, zéro échec** : 618 JavaScript, 3 annuaire Python, 8 pharmacies Python.
- Tests spécifiques : phrase exacte, variantes temporelles, secours seulement en route ou absents, accident toujours en cours avec secours présents, repère donné au premier message ou ensuite, commune conservée, absence de risque inventé, risque possible puis danger observé, aggravation et appel infructueux avec secours présents.
- Un test HTTP du mode privé vérifie la mémoire serveur et la conservation de ces distinctions sur plusieurs échanges, avec zéro appel fournisseur.
- **10 contrôles navigateur réussis** sur l’instance 8781 : cas exact, mémoire et repère, dangers/risques, appel infructueux, bouton 180 ouvert puis annulé, mobile 390 px et absence de données citoyennes dans les stockages du navigateur.
- Statut privé relu : OpenAI désactivé, session réelle et autorisation indisponibles. Déconnexion vérifiée par refus 403. Aucun appel téléphonique réel, appel OpenAI payant ou déploiement public.
- Fichiers graphiques, mascotte, contacts, passerelle privée et protections financières inchangés pendant cette correction.

## Fichiers concernés, uniquement dans la copie

- `lib/accident-witness.js`.
- `tests/accident-onsite.test.js` (nouveau).
- `tests/accident-witness-http.test.js` (cas HTTP ajouté).
- Ce document.

Preuves : `/Users/assane/.hermes/cache/scratch/india-onsite-final-verification.json` et journaux `india-onsite-final-{node,directory,pharmacies}.log`.

## Rejouer l’essai

Rafraîchir 8781, effacer l’ancienne conversation puis rejouer les deux messages ci-dessus. Les réponses déjà affichées ne sont pas réécrites rétroactivement. En mode privé, sélectionner au besoin le fichier d’accès actuel de la copie expérimentale, jamais celui de la principale.

Le moteur reste local et déterministe ; les formulations non couvertes peuvent demander une clarification. La présence des secours et les observations restent déclarées par le témoin, non vérifiées par INDIA. Les destinations téléphoniques ont été contrôlées sans appeler les services : leur disponibilité réelle n’est pas démontrée.

**Aucune intégration à la principale n’est effectuée. Elle reste soumise à l’accord explicite de l’utilisateur.**
