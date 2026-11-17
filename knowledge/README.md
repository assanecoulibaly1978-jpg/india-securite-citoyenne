# Base administrative — consultation documentaire privée

## Ce qui est autorisé

Ce dossier est lu uniquement par les modules serveur `lib/ai/administration.js` et `lib/ai/knowledge.js`, appelés depuis le pilote privé existant `/api/assistant`. Cette route reste protégée par l’accès local et l’authentification Bearer. Aucun fichier de ce dossier n’est servi par l’interface publique.

La consultation est déterministe : aucun texte administratif n’est envoyé à un modèle, aucun appel OpenAI n’est nécessaire et aucun budget n’est réservé. Les sources et leurs dates figurent dans le texte de réponse et dans les champs structurés. Toutes les conditions, pièces, sommes et durées restent **À CONFIRMER** ; une publication consultée n’est pas une obligation actuelle certifiée.

## Fichiers et contrôles

- `base-administrative.json` : copie exacte de la proposition approuvée pour préparation technique ; cinq démarches et 26 références. Les anciens statuts `proposal_not_integrated`, `runtime_enabled:false`, `reviewer_approved:false` et `auto_answer_eligible:false` sont volontairement conservés dans ce document d’archive. Ils n’autorisent pas un usage génératif ou une certification juridique.
- `base.schema.json` : schéma de la proposition, conservé à l’identique.
- `manifest.json` : autorise exclusivement une vue documentaire privée en lecture seule ; usage public, génération et exigences automatiques interdits. Il fixe les empreintes du document et de son audit.
- `review.json` : audit documentaire des 52 énoncés et 101 associations. 49 sont étayés comme publications ; trois énoncés partiels sont conservés dans l’archive mais exclus du rendu. La fraîcheur opérationnelle reste à confirmer pour tous les éléments affichés.

Un fichier absent ou altéré, une association manquante, une quarantaine incohérente ou un audit incomplet bloque la restitution détaillée. Le pilote répond alors qu’il ne peut pas confirmer le renseignement ; il ne demande pas au modèle de combler le manque.

## Réserves conservées

Les trois énoncés écartés concernent une formulation trop large sur les branches CNI/mineurs, une généralisation des autres profils du passeport/diaspora et une séquence de formation auto-école partiellement déduite. Les variantes non couvertes produisent une limite explicite plutôt que le dossier du cas principal. Cette limite est conservée dans les relances de la même conversation ; seuls des identifiants de démarche et un message générique de limitation sont retenus, pas un dossier personnel.

Les 26 URL d’origine sont conservées. Trois variantes de ces URL, ne différant que par une barre finale, ont renvoyé les documents attendus ; elles sont stockées séparément avec leur date. Leur accès est signalé intermittent, sans prétendre que les URL originales sont invalides ou toujours accessibles.

La provenance des sources SNEDAI 20 et 21 est corrigée dans la vue par une référence explicite à la fiche gouvernementale **19**, et non à e-Justice **1**. La correction est traçable dans l’audit sans réécriture de l’archive.

Les coordonnées locales restent exclusivement issues de l’annuaire. Aucune pièce d’identité, aucun NNI, scan ou paiement ne doit être demandé dans la conversation. Les protocoles urgence, accident et plainte restent prioritaires ; le corpus n’y substitue pas de conseils générés.

## Limites techniques

Les fichiers sont placés en lecture seule (`0444`). Cela prévient les écritures accidentelles, pas une modification par un administrateur ou un processus compromis du même utilisateur. Les empreintes détectent une divergence avec le manifeste, mais ne sont pas une signature d’administration.

Aucun nouvel écran public ni console privée n’est ajouté : l’affichage est prévu dans `reply` et `sources` de la réponse privée. Aucun déploiement, redémarrage de l’instance publique, paiement, envoi de formulaire ou test avec un modèle réel n’est effectué. L’IA reste désactivée et les plafonds applicatifs restent à 1 USD/jour et 2 USD/mois UTC.

Toute mise à jour future du contenu exige une nouvelle sauvegarde, une vérification des sources, un contrôle sémantique et une régénération contrôlée des empreintes. Il n’y a pas d’actualisation automatique par Internet.
