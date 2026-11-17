# INDIA — expérimentation accident témoin (copie isolée)

## Statut

Développement hors de la version principale. **Ne pas intégrer, remplacer ou recharger le serveur de démonstration sans l’accord de l’utilisateur.**

- Version de présentation conservée : `http://127.0.0.1:8780/`.
- Expérience locale : `http://127.0.0.1:8781/#converser`.
- Copie : `/Users/assane/india-experiences/accident-20261116-145843`.
- Sauvegarde complète vérifiée avant modification : `/Users/assane/secours-citoyen-sauvegardes/avant-accident-isole-20261116-145843` (265 fichiers vérifiés par SHA-256).
- Aucun changement des fichiers graphiques, de la mascotte ou des coordonnées du registre des secours.
- Aucun appel réel ni transmission ; les boutons ouvrent une confirmation, pas une intervention.
- Aucun fournisseur réel : clé/permis non copiés ; activation désactivée et garde réseau externe pendant les essais.

## Parcours expérimental

Extraction locale et bornée des informations déclarées (lieu, véhicules/usagers, nombre approximatif de blessés, dangers), mémoire éphémère et corrections. Priorité au 180 avant toute question ; une seule question facultative sur le prochain élément manquant. Contacts repris du registre existant et secours médicaux conservés en cas d’aggravation ou d’échec de l’appel. Statuts distincts : accident en cours, secours appelés, secours présents, accident passé/terminé, perturbation de circulation. Les informations inconnues ne sont pas inventées. Récapitulatif : **Signalement préparé — non transmis**.

Le suivi privé doit rester côté serveur et isolé entre propriétaires. Un marqueur temporaire conserve la frontière du protocole entre les réponses courtes (sinon un simple lieu faisait perdre le contexte urgent). Aucun récit n’est transmis à un modèle. Effacement, déconnexion, changement explicite de sujet et expiration restent contrôlés par le mécanisme existant.

## Scénario fictif de trois minutes

**Ne jamais confirmer l’ouverture du téléphone ni appeler un numéro d’urgence pendant cette démonstration.** Annoncer oralement que les faits sont fictifs et que le moteur testé est local/déterministe, sans OpenAI.

### 0:00–0:35 — Reconnaissance et appel prioritaire

Dans **la copie expérimentale sur 8781**, onglet Converser, effacer l’ancienne conversation puis écrire :

> Je suis témoin d’un accident entre une voiture et une moto. Deux blessés. Une fuite de carburant.

À montrer : le 180 est proposé immédiatement, les consignes apparaissent, une seule question demande le lieu. INDIA ne redemande pas le nombre ni les véhicules.

### 0:35–1:15 — Bouton et mémoire du premier message

Cliquer sur le bouton du 180, constater la confirmation puis choisir **Annuler** — jamais Confirmer. Répondre :

> À Cocody, près du marché.

À montrer : le récapitulatif reprend les quatre informations, avec le titre « Signalement préparé — non transmis ». Aucun signalement n’a été envoyé.

### 1:15–2:05 — Correction sans recommencement

> Correction : c’est à Yopougon, carrefour Siporex. Trois blessés, pas deux.

À montrer : lieu et nombre corrigés ; voiture/moto et danger conservés ; aucune reprise du questionnaire depuis le début.

### 2:05–3:00 — Distinguer l’appel de la présence effective

Envoyer successivement :

> Les secours ont déjà été appelés.

> Les pompiers sont sur place.

> L’intervention est terminée. Il reste un embouteillage.

À montrer : appelé ≠ sur place ; la clôture déclarée et la perturbation ne deviennent pas une intervention ou une alerte diffusée par INDIA. Les faits restent des déclarations non vérifiées. Terminer en effaçant la conversation.

## Validation finale

- **613 tests réussis, zéro échec** : 602 JavaScript, 3 annuaire Python et 8 pharmacies Python.
- **19 contrôles navigateur réussis** : scénario progressif, corrections, cinq situations, raccourci Accident existant, aggravation avec secours présents, six confirmations téléphoniques ouvertes puis annulées, affichage 1280 et 390 px, absence de données citoyennes dans les stockages du navigateur et effacement.
- Les tests HTTP du mode privé couvrent la mémoire serveur, les corrections, le rejet d’un état client injecté, l’effacement, la déconnexion et l’isolement des propriétaires ; aucun appel au fournisseur fictif n’a été déclenché.
- La contre-revue a reproduit des défauts de chronologie, de conservation des observations critiques, de correction et de cumul des dangers. Les cas reproduits ont reçu des tests et des corrections, vérifiés par la suite finale. Cela ne constitue pas une certification médicale ni une contre-revue indépendante de chaque correction.
- Les 265 fichiers de la principale sont identiques à l’état sauvegardé. Le serveur principal reste le processus 53409, lancé avant les travaux, et répond sur 8780. Aucun remplacement/rechargement de cette instance.
- Sauvegarde intégrale relue et comparée par empreintes ; interface, mascotte, données, sources, contacts et protections financières identiques dans la copie.
- Statut privé de l’instance expérimentale relu après authentification : OpenAI désactivé, autorisation réelle absente et session réelle indisponible. Déconnexion vérifiée par refus 403. Aucun fichier `.env`, permis réel ou registre de dépenses présent dans la copie.

### Périmètre des fichiers

Uniquement dans la copie isolée :

- `lib/accident-witness.js` : nouveau protocole local, extraction, états déclaratifs, corrections, dangers distincts et observations critiques bornées.
- `lib/assistant.js` : raccordement au protocole et reprise du raccourci Accident lorsqu’une blessure actuelle est déclarée.
- `lib/private-test.js` : maintien du contexte protégé entre les réponses courtes, sans l’envoyer au modèle.
- Trois nouveaux fichiers : `tests/accident-witness.test.js`, `tests/accident-witness-http.test.js`, `tests/accident-witness-adversarial.test.js`.
- `tests/accident.test.js` : attentes adaptées au parcours sans étape préalable obligatoire, tout en conservant les vérifications de sécurité et de contacts.
- Le présent document. Aucun fichier graphique modifié.

### Limites restantes

Le moteur est **local et déterministe**, non une nouvelle conversation générative OpenAI. Il reconnaît des formulations françaises testées, pas toute expression possible ; une information ambiguë ou inconnue ne doit pas devenir une certitude. Les coordonnées du registre existant sont conservées, mais les lignes n’ont pas été appelées : leur disponibilité réelle n’est pas établie par les essais. Les informations et observations restent des déclarations non vérifiées ; aucun diagnostic, envoi d’alerte, appel connecté, arrivée de secours ou validation opérationnelle n’est démontré. Les anciens parcours matériels restent conservés ; seuls des signes actuels de blessure/détresse autorisent leur passage au nouveau parcours blessés.

L’intégration à la version principale reste **en attente de l’accord explicite de l’utilisateur**.

Preuves locales : `/Users/assane/.hermes/cache/scratch/india-accident-final-verification.json` et journaux `india-accident-final-{node,directory,pharmacies}.log` dans le même dossier.

## Reprise et intégration

Le serveur expérimental peut être relancé **depuis cette copie uniquement**, sur un port différent de 8780, avec :

```sh
env PORT=8781 AI_ENABLED=false AI_ALLOW_PAID=false OPENAI_API_KEY= AI_PILOT_TOKEN= node --import ./tests/local-only.mjs server.js
```

Ne jamais exécuter cette commande dans le dossier principal pour remplacer sa session. Ne jamais recopier `.env`, `var/`, les accès privés, les permis ou le registre financier entre les deux instances. Une éventuelle intégration restera limitée au code et aux tests revus, après accord explicite.
