# INDIA — message composite : évacuation et route bloquée

## Périmètre

Correction exclusivement dans `/Users/assane/india-experiences/accident-20261116-145843`, sur `http://127.0.0.1:8781/#converser`.
Aucune intégration dans la principale, aucun changement d’interface, de mascotte, de données, de contacts ou d’autres protocoles. Aucun service OpenAI activé ni déploiement public.

Sauvegarde complète avant modification : `/Users/assane/india-experiences/sauvegardes/avant-extraction-evacuation-20261117-135150`. Comparaison SHA-256 ; manifeste dans `india-evacuation-baseline.json`, sous le répertoire scratch Hermes.

## Reproduction exacte

> Un camion vient de renverser un motocycliste à Cocody. Les pompiers sont arrivés et ont évacué le blessé. Maintenant, la route est complètement bloquée.

Le test de non-régression a échoué avant correction : aucun rapport accident n’était retourné ; le routeur aboutissait au repli général d’urgence.

## Causes

1. L’entrée du parcours témoin exigeait « accident » ou « collision ». Le récit « vient de renverser un motocycliste » ne satisfaisait pas cette porte d’entrée.
2. Le repli général reconnaissait « blessé » sans analyser l’évacuation préalable : quatre contacts étaient affichés sans accompagnement contextualisé.
3. L’extraction n’avait pas d’état propre pour une évacuation accomplie. Une arrivée passée ne devait pourtant pas être assimilée à une présence physique actuelle permanente.
4. La circulation reconnaissait surtout « embouteillage / bouchon », pas la formulation exacte « la route est complètement bloquée ».

## Correction

Un seul fichier applicatif modifié : `lib/accident-witness.js`.

- Reconnaissance de descriptions concrètes de renversement, heurt ou percussion, liées à un véhicule ou usager de la route ; contrôles métaphore et prévention.
- Extraction de l’évacuation affirmative accomplie, du nombre évacué déclaré et, lorsqu’il est explicite, du service intervenu. Négation, futur, question et conditionnel ne valident pas une prise en charge accomplie.
- `careStatus` (`not_reported`, `evacuated`, `partial`) distinct de `rescueStatus`, `incidentStatus` et `trafficStatus`. Les nombres connus avant l’évacuation ne sont pas écrasés par un nombre partiel évacué. Une évacuation non quantifiée ne prouve pas que toutes les victimes sont prises en charge.
- Pour le message exact : un blessé évacué déclaré, Cocody, camion et motocycliste, `trafficStatus: blocked`, `sceneSafety: not_confirmed`. L’incident n’est pas automatiquement déclaré terminé : le témoin ne l’a pas dit.
- Le libellé visible devient « Évacuation déclarée ; état du site non confirmé », sans injonction répétitive d’appel. Les boutons issus du registre existant restent accessibles.
- Une arrivée passée et l’évacuation ne prouvent pas la présence actuelle des pompiers. Une présence actuellement reconfirmée reste cependant conservée et permet de signaler un danger aux secours présents.
- Une question à la fois : secteur exact de Cocody, puis sens de circulation. Conservation du repère et du sens ; aucun délai de trafic ni détour inventé.
- Un nouveau danger conserve la priorité, dans le même message ou au tour suivant ; il ne disparaît pas derrière le récit d’évacuation. Aucun signalement n’est transmis.

## Fichiers de cette correction

- `lib/accident-witness.js` : reconnaissance, états et réponse.
- `tests/accident-evacuation.test.js` : scénario exact et contrôles de sécurité.
- `tests/accident-witness-http.test.js` : scénario exact via session privée simulée, mémoire, nouveau danger et effacement ; compteur fournisseur nul.
- `docs/INDIA_MESSAGE_COMPOSITE_EVACUATION.md` : ce bilan.

## Vérifications

Les résultats exécutés et les empreintes sont consignés dans `india-evacuation-final-verification.json`, sous le répertoire scratch Hermes. Les journaux de tests portent le préfixe `india-evacuation-final-` ; les vérifications navigateur sont dans `india-evacuation-browser-results.json`, au sein du workspace navigateur de cette session.

- Tests JavaScript complets, puis scripts Python annuaire et pharmacies, sans requête fournisseur réelle.
- Navigateur Chromium : message exact, cohérence des faits, absence d’injonction d’appel répétée, secteur puis sens, nouveau feu, effacement, affichage bureau et mobile 390 px, confirmation `tel:180` annulée sans appel réel.
- Empreintes de la principale et de la sauvegarde ; contrôle des processus par métadonnées seulement pour 8780, sans requête HTTP à la principale.
- Serveur expérimental lié à la boucle locale, génération désactivée, garde réseau locale ; absence de clé `.env`, permis réel et ledger de dépenses dans l’expérimentation.

## Limites

Il s’agit toujours d’un moteur local déterministe, pas d’une compréhension linguistique exhaustive ni d’un triage médical validé. Les formulations ambiguës et les corrections complexes nécessitent encore des essais humains. Les faits restent déclaratifs ; ni les secours, ni la sécurité du site, ni le trafic ne sont vérifiés en temps réel. Les tests automatisés navigateur ne constituent pas une validation Safari. Disponibilité réelle des lignes non testée. La version principale ne sera modifiée qu’après autorisation explicite.
