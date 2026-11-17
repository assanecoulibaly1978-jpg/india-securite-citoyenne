# INDIA — Sécurité citoyenne en Côte d’Ivoire

Produit de Police Secours. Ce dépôt privé contient un export de la **version expérimentale 8781**, avec son interface INDIA, sa mascotte, ses protocoles de sécurité et son annuaire sourcé.

Il ne contient pas le laboratoire 8782, encore en préparation. La nouvelle orientation exclusivement sécurité n’a pas encore été appliquée à tous les composants historiques : les modules documentaires administratifs de cette version sont conservés, sans nouvelle intégration.

## Démarrer sans API payante

Prérequis : Node.js 22 ou supérieur. Aucun paquet npm n’est nécessaire pour l’application.

```sh
# Choisir un port distinct des versions conservées 8780, 8781 et 8782.
PORT=8783 node --import ./tests/local-only.mjs server.js
```

Ouvrir `http://127.0.0.1:8783/#converser`. Le serveur reste limité à la boucle locale. Le préchargement ci-dessus bloque les transports HTTP externes côté Node en défense supplémentaire ; ce n’est pas un bac à sable réseau du système.

Ne copiez pas de clé ni d’autorisation réelle dans ce dépôt. Le fichier `.env.example` est un exemple vide et désactivé. Sans configuration privée, le serveur conserve les moteurs locaux. Aucun permis réel ni état financier historique n’est inclus. Ne tentez pas un appel de secours pour vérifier un bouton : ouvrez la confirmation puis annulez.

Le mode privé historique peut créer son propre fichier d’accès dans `var/private-test-access.json` sous **ce clone**. Ce fichier ne doit jamais être versionné ou partagé ; ne sélectionnez pas celui d’une autre instance. Une simulation n’est pas une réponse OpenAI.

## Fonctions de cette version

- Priorité aux protocoles déterministes d’urgence, accident et préparation de plainte.
- Parcours accident : lieu et repère, informations déjà données, état des secours, évacuation et circulation distingués, réactivation des consignes lorsqu’un nouveau danger apparaît.
- Signalement préparé, explicitement non transmis ; aucun dépôt de plainte automatique.
- Annuaire importé avec provenance et limites. Dates de garde historiques : ne pas les présenter comme des disponibilités actuelles vérifiées.
- Interface et mascotte INDIA conservées ; aucun paiement, opérateur ou déploiement public activé.

Les faits rapportés ne sont pas vérifiés sur le terrain. Le moteur peut mal comprendre une formulation et ne constitue pas un triage médical validé. Les contacts restent accessibles dans l’interface. Aucune intervention n’est déclenchée automatiquement.

## Tests locaux, sans fournisseur réel

```sh
npm test
python3 tests/directory.test.py
python3 tests/pharmacies.test.py
```

Les tests Node préchargent la garde réseau locale. Les tests Python utilisent les instantanés publics conservés dans `data/evidence/`. Voir `requirements.txt` pour leurs dépendances ; ne lancez pas les collecteurs `--live` pour un simple essai de cette copie.

Les documents suivants décrivent les corrections de la version exportée :

- `docs/INDIA_ACCIDENT_EXPERIMENTAL.md`
- `docs/INDIA_CORRECTION_SECOURS_SUR_PLACE.md`
- `docs/INDIA_CONTINUITE_ACCIDENT_CIRCULATION.md`
- `docs/INDIA_MESSAGE_COMPOSITE_EVACUATION.md`

Ces documents sont historiques : leurs chemins locaux et anciens résultats ne remplacent pas l’exécution des tests dans ce clone.

## Contenu volontairement absent

Clés, `.env`, fichiers d’accès privés, permis, sessions, dépenses et journaux, sauvegardes de récupération, archives historiques et anciens lanceurs liés à une autre instance. L’extrait national OpenStreetMap `.osm.pbf` volumineux est exclu ; les données et géométries dérivées utiles à cette version restent présentes.

Les copies HTML de sources tierces ont été expurgées de clés cartographiques intégrées aux pages d’origine. `data/evidence/export-sanitization.json` indique les fichiers concernés et les empreintes avant/après. Les anciens manifestes de collecte décrivent les originaux conservés localement, pas ces copies expurgées. Les données structurées de l’annuaire et le code applicatif restent identiques à la version 8781.

Les données, documents et fontes conservent leurs attributions et conditions d’origine. Les compléments OpenStreetMap restent attribués aux contributeurs OpenStreetMap, sous ODbL. Aucune licence supplémentaire n’est accordée par cet export.

**Un envoi sur GitHub n’est ni un déploiement de l’application, ni une activation d’OpenAI.**
