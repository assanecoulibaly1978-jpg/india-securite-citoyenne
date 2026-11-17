# INDIA — continuité accident, secours et circulation (expérimentation)

## Périmètre

Travaux uniquement dans `/Users/assane/india-experiences/accident-20261116-145843`, sur `http://127.0.0.1:8781/#converser`.

La principale est inchangée : ses 265 fichiers sont identiques au relevé de référence, et son processus d’origine sur 8780 n’a pas été remplacé ni rechargé. Aucune requête HTTP de contrôle n’a été envoyée à 8780. Interface, mascotte, données, contacts, annuaire et protections financières conservés.

Sauvegarde complète vérifiée avant modification : `/Users/assane/india-experiences/sauvegardes/avant-continuite-accident-circulation-20261117-130735` (219 fichiers comparés par SHA-256).

## Cause reproduite

L’entrée « Il y a un accident » restait dans l’ancien contexte version 1, route `unknown`, étape `check`. Cette branche reposait la question des blessés avant l’enregistrement des champs. Elle n’enregistrait donc pas Bingerville ni le Jardin botanique, et ne consommait pas les confirmations de présence puis de fin d’intervention.

Le parcours expérimental refusait de reprendre cette ancienne branche tant qu’aucune blessure actuelle n’était explicitement déclarée. Les corrections précédentes, vérifiées surtout à partir d’accidents avec blessés, ne couvraient donc pas ce point d’entrée.

Enfin, un indicateur composite ne suffisait pas à conserver séparément l’évolution de l’accident, la présence déclarée des secours et la circulation résiduelle.

## Correction

- Le parcours expérimental accepte maintenant un accident dont les victimes sont inconnues, dès le premier message, sans inventer de blessure ni leur absence.
- Le lieu est enregistré même lorsque le citoyen répond par un lieu plutôt que par un état des victimes. La qualification initiale n’est pas répétée mécaniquement.
- L’état temporaire conserve séparément `incidentStatus`, `rescueStatus` et `trafficStatus`, ainsi que les précisions de circulation nécessaires. Les valeurs sont bornées ; aucun historique citoyen brut n’est ajouté.
- La présence des pompiers arrête le questionnaire non essentiel sur les victimes ; les informations non fournies restent explicitement inconnues.
- La clôture déclarée de l’intervention ne supprime ni le lieu, ni les victimes précédemment indiquées, ni la présence des secours enregistrée comme information antérieure.
- Un embouteillage après clôture devient un suivi de circulation. Une seule question utile demande la voie ou le sens touché ; la réponse est retenue sans recommencer le questionnaire accident.
- La circulation peut redevenir fluide sans réactiver l’urgence. Un embouteillage seul ne clôture pas un accident encore actif avec blessés.
- Une nouvelle blessure ou un danger actuel réactive l’orientation immédiate vers les secours. Leur ancienne présence n’est pas présentée comme une présence actuelle confirmée après la fin de l’intervention.
- Une question, une négation ou une condition sur la fin de l’intervention n’est pas assimilée à une clôture affirmative. Un appel infructueux sans nouveau danger ne réactive pas à lui seul un incident explicitement terminé.

## Scénario vérifié dans l’ordre exact

1. « Il y a un accident. » — contacts accessibles et une question initiale.
2. « Il y a un accident à Bingerville, près du Jardin botanique. » — lieu conservé, sans répéter la question des blessés.
3. « Les pompiers sont déjà sur place. » — présence reconnue ; pas de nouvelle injonction d’appel ni de demande de nombre de blessés.
4. « L'intervention est terminée, mais il y a un gros embouteillage. » — clôture déclarée et embouteillage conservés séparément ; pas d’urgence active automatiquement déduite.

La réponse pose alors :

> Quelle voie ou quel sens de circulation est surtout touché ?

Une réponse fictive « La voie vers Abidjan est bloquée » est mémorisée comme déclaration non vérifiée. INDIA n’invente ni détour ni durée de l’embouteillage. Le signalement reste **préparé — non transmis**. La nature des véhicules et le nombre de victimes, non fournis dans ces quatre messages, restent inconnus plutôt que supposés.

## Validation

- **641 tests réussis, zéro échec** : 630 JavaScript, 3 annuaire Python, 8 pharmacies Python.
- Nouveau fichier de tests ciblés : séquence complète, ancienne mémoire `unknown`, victimes connues ou inconnues, fin d’intervention négative/interrogative/conditionnelle, circulation rétablie, nouveau danger après clôture ou dans le même message, appel infructueux sans nouvelle urgence.
- Tests HTTP privés : séquence complète et variante avec une simple réponse de lieu ; contexte uniquement côté serveur, états conservés, effacement vérifié, aucun appel fournisseur.
- **13 contrôles navigateur réussis** : quatre messages exacts, suivi de circulation, absence de délai inventé, retour à la normale, réapparition d’un feu, lieu toujours disponible dans le récapitulatif, confirmation 180 ouverte puis annulée, mobile 390 px, absence de données citoyennes dans les stockages du navigateur et effacement.
- Configuration privée relue : OpenAI désactivé ; autorisation et session réelles indisponibles. Déconnexion relue et refus 403 confirmé.
- Aucun appel téléphonique réel, appel OpenAI payant, déploiement public ou donnée personnelle réelle ajouté aux essais. Uniquement des scénarios fictifs et des lieux publics.

## Fichiers concernés dans la copie

- `lib/accident-witness.js` : reprise des accidents non qualifiés, mémoire des trois états, transitions et suivi de circulation.
- `tests/accident-traffic-continuity.test.js` : nouveau fichier de non-régression.
- `tests/accident-witness-http.test.js` : séquences HTTP et effacement ajoutés.
- `tests/accident.test.js` : attente adaptée à la progression directe après « Je ne sais pas », sans étape de préparation obligatoire.
- `tests/accident-witness.test.js` : attente adaptée à une question utile sur la circulation après la fin d’intervention.
- Ce document.

Preuves : `/Users/assane/.hermes/cache/scratch/india-traffic-final-verification.json` et journaux `india-traffic-final-{node,directory,pharmacies}.log`.

## Limites et reprise de l’essai

Le moteur reste local et déterministe : les variantes linguistiques non couvertes peuvent nécessiter une clarification. Il ne vérifie ni les événements, ni la présence des secours, ni l’état du trafic et ne fournit aucune estimation fiable d’arrivée ou de trajet. La mémoire est temporaire ; elle disparaît lors de l’effacement et, en mode privé, à la déconnexion ou à l’expiration. Les destinations d’appel ont été contrôlées sans joindre les services.

Rafraîchir 8781, effacer l’ancienne conversation et rejouer les quatre messages. Les réponses précédemment affichées ne sont pas réécrites rétroactivement. En mode privé, sélectionner au besoin le fichier d’accès actuel de la copie expérimentale, jamais celui de la principale.

**Aucune intégration à la version principale. Elle reste soumise à l’autorisation explicite de l’utilisateur.**
