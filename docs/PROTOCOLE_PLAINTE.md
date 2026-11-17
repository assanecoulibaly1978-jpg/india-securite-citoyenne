# Protocole plainte — V1.2

Le brief accident/plainte fourni par l’utilisateur est conservé à l’identique dans `BRIEF_ACCIDENT_PLAINTE_ORIGINAL.txt`. Le moteur ajouté est `lib/complaint.js`. Le protocole accident précédent n’est pas remplacé.

## Parcours effectif

1. Contacts Police Secours et Gendarmerie disponibles immédiatement ; une question claire sur la sécurité présente.
2. Si la personne indique être en sécurité, une question distincte vérifie le besoin de secours médicaux. Être en sécurité ne signifie pas ne pas être blessé. Les signes d’urgence reconnus interrompent toute étape, y compris la confirmation finale, avant les questions ou données optionnelles.
3. Écoute et préparation facultative : faits brefs, date approximative, commune/quartier/repère, victime ou témoin, connaissance de la personne mise en cause uniquement oui/non, types d’éléments utiles sans téléchargement et conséquences sans détail médical. Chaque question peut être passée.
4. Résumé attribué aux indications de la personne, avec confirmation et correction champ par champ.
5. Après confirmation : recherche de fiches police et gendarmerie correspondant au lieu dans l’annuaire réel. Au maximum cinq fiches par catégorie sont affichées, avec compte exact des correspondances. Une absence d’adresse attestée ne supprime jamais les contacts nationaux.
6. Préparation indicative de la prise de contact et question finale. L’état structuré est effacé après orientation ou sur annulation.

## Cas sensibles

Les formulations reconnues de violences conjugales, violences sexuelles ou enfant en danger activent un parcours minimal. Après sécurité et besoin de secours, seul le lieu facultatif est demandé avant un résumé minimal et l’orientation. Aucun récit intime, auteur identifié ou contenu de preuve n’est demandé. Les détails doivent être partagés, si la personne le souhaite, directement avec un professionnel compétent.

Les faits passés ne sont pas automatiquement déclarés « danger en cours ». À l’inverse, une menace actuelle, y compris envers un tiers, interrompt la préparation. Le moteur reste à règles et peut manquer une formulation ; il doit être évalué sur le terrain avant ouverture publique.

## Adaptations au brief

- La préparation **ne constitue pas un dépôt de plainte**. L’application ne fait aucune transmission aux autorités, ne prédit pas une issue et ne certifie pas la véracité ou la qualification juridique des faits.
- La compétence territoriale n’est pas déduite de la proximité d’une fiche ou de l’absence d’un commissariat dans un annuaire incomplet. Police Secours / Gendarmerie doivent confirmer l’orientation. Le moteur n’énonce pas une règle juridique universelle de lieu de dépôt.
- Identité, numéro, plaque et coordonnées de la personne mise en cause : non sollicités dans le chat ; à communiquer directement aux autorités. Les champs structurés de préparation masquent les téléphones et courriels volontairement saisis. Les messages visibles restent en mémoire de page jusqu’à effacement/rechargement.
- Preuves : leurs types seulement. Aucune pièce d’identité, capture, ordonnance, photo ou certificat n’est reçu par un outil de dépôt.
- La liste de préparation est indicative : documents déjà disponibles, résumé, éléments utiles et coordonnées des témoins à transmettre directement au service. Un document médical existant peut être évoqué, mais le programme ne le présente jamais comme une condition obligatoire pour contacter les autorités. Le service précise ses exigences ; un signalement urgent et des soins ne doivent pas attendre la réunion de documents.
- Aucun opérateur humain n’étant connecté, aucune escalade reçue n’est promise. Une demande d’opérateur obtient cette information et les contacts disponibles.
- Les contacts déjà vérifiés pour V1.1 sont réutilisés depuis `lib/emergency.js`. Le contact SOS Abidjan non confirmé reste non activé.

## Données et confidentialité

Il n’y a pas de dépôt officiel, de registre de plainte, de téléchargement de pièces ou d’historique conversationnel serveur. Les messages et l’état minimal sont traités par le serveur pour répondre, sans journalisation applicative de leur contenu. L’état client n’est pas une identité authentifiée et ne donne aucun pouvoir d’alerte ou de transmission.

## Vérifications réalisées

- Tests de parcours, menaces actuelles, blessures malgré la mise en sécurité, événements passés, cas sensibles, correction du résumé, absence de localité et absence d’opérateur.
- Test HTTP complet : l’annuaire n’est interrogé pour l’orientation qu’après confirmation du résumé.
- Navigateur : parcours ordinaire complet avec fiches réelles à Cocody ; parcours sensible minimal ; interruption par menace actuelle au moment de confirmer ; destination du composeur vérifiée puis annulée. Aucun service de secours n’a été appelé.

Les sources des numéros et leurs dates de consultation restent dans `data/emergency_sources.json`. Cette implémentation est une orientation technique et une aide à préparer une prise de contact, pas un conseil juridique ni une validation professionnelle du protocole.
