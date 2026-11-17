# Protocole accident intégré — V1.1

Le texte fourni est conservé sans modification dans `ACCIDENT_BRIEF_ORIGINAL.txt`. Le moteur effectif est `lib/accident.js` ; les contacts partagés sont dans `lib/emergency.js`.

## Parcours

1. Accident sans précision : le 180 est déjà visible, puis une question sur les blessés, avec choix oui / non / je ne sais pas. Cette précaution évite d’attendre une réponse pour rendre le contact disponible.
2. Blessé signalé, état incertain ou signe de danger : 180 puis ligne longue, avant les autres questions. La préparation des informations est facultative, déclenchée par un bouton ou une réponse du citoyen ; elle ne doit pas retarder l’appel.
3. Préparation : lieu/repère, circonstances, nombre et observations sur les blessés, dangers. Une question par tour ; rien n’est diagnostiqué. Le champ « blessés » est une observation libre, pas une classification médicale.
4. Résumé selon les indications du citoyen, consignes générales d’attente, contacts et question « Avez-vous pu joindre les secours ? ».
5. Appel impossible : les contacts pompiers et SAMU restent proposés, avec leurs lignes longues validées documentairement.
6. Accident matériel confirmé : localisation et circonstances, puis Police Secours / Gendarmerie sans déduction automatique de compétence territoriale. Une absence dans l’annuaire local ne supprime pas les contacts nationaux.
7. Un nouveau blessé ou danger interrompt le parcours matériel ou la vérification finale. Une prise de contact confirmée ou l’annulation efface l’état structuré du protocole.

## Adaptations de sécurité et de confidentialité

- Le texte ne prétend pas qu’un appel a abouti, qu’un opérateur a été prévenu ou que les secours arrivent. Le composeur exige toujours une confirmation explicite.
- Aucun opérateur humain n’étant connecté, aucun transfert humain n’est promis.
- Numéro de rappel et coordonnées d’un proche : à donner directement aux secours / au proche, pas à collecter dans ce chat sans utilité opérationnelle. Les numéros volontairement présents dans les champs de préparation sont masqués dans l’état structuré ; les messages visibles restent en mémoire de page jusqu’à effacement. Il n’y a pas d’historique conversationnel enregistré par le serveur.
- `21 21 756620` (SOS Abidjan) est conservé dans le brief d’origine mais **non activé**, faute de confirmation par une source primaire actuelle. Il n’a pas été « corrigé » par supposition.
- La consigne universelle « ne pas déplacer les véhicules avant constat » n’est pas imposée : le citoyen est orienté vers les instructions du service compétent, en privilégiant sa sécurité. Aucune règle juridique française n’est importée en Côte d’Ivoire.
- Les consignes d’attente sont limitées à des précautions générales sourcées. Pas de diagnostic, traitement, consigne technique de réanimation ou manipulation médicale.

## Sources consultées le 11 novembre 2026

- ONPC, communiqué du 29 juin 2026 : 180, 01 01 80 13 28 ; Police Secours 100, 01 03 79 91 44 ; Gendarmerie 145.
  https://www.onpc-ci.org/actualite/saison-des-pluies-2026-message-dalerte-aux-intemperies-et-mesures-de-prevention-des-risques-dinondation
- DGEPN, annuaire hospitalier, fiche SAMU : 185 et 07 49 96 03 24.
  https://dgepn.patrimoine.gouv.ci/annuaire/etablissements-publics-hospitaliers-%28eph%29
- Sécurité Routière, page « Accident de la route », consultée dans le navigateur : précautions de protection et d’attente. Cette source ne sert pas à déterminer les numéros ivoiriens ni la compétence juridique locale.
  https://www.securite-routiere.gouv.fr/chaque-situation-sa-conduite/accident-de-la-route

Les preuves de consultation des contacts sont dans `data/emergency_sources.json`. Aucun numéro n’a été appelé pour tester.

## Validation

Les scénarios automatisés couvrent la qualification, l’incertitude, le parcours matériel sans résultat local, les nouvelles urgences pendant un suivi, le résumé, les rappels d’appel, les numéros de repli et l’absence de conservation structurée des numéros personnels. Le parcours complet et les boutons de préparation/rappel ont aussi été exercés dans le navigateur, sans activer un appel.

Cette intégration reste un moteur à règles : elle doit être revue par des professionnels et évaluée sur le terrain avant une ouverture publique. Elle ne garantit pas la reconnaissance de toutes les formulations d’urgence.
