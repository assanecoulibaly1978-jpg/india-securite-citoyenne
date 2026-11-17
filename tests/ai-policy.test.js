import test from 'node:test';
import assert from 'node:assert/strict';
const {safeGeneralReply,redactCitizenText}=await import('../lib/ai/policy.js');
for(const text of ['Une mairie est l’administration d’une commune. Elle accompagne les habitants dans certaines démarches locales.','Pour organiser votre semaine, notez vos priorités, puis gardez du temps pour les imprévus.','La police contribue à la sécurité publique.','Voici un modèle à compléter : Madame, Monsieur, je sollicite des renseignements. [NOM] [ADRESSE]'])test('allows ordinary general explanation: '+text.slice(0,35),()=>assert.equal(safeGeneralReply(text),true));
for(const text of [
 'Appelez le 01 02 03 04 05 au 12 allée des Palmiers.',
 'Le téléphone est zéro un zéro deux zéro trois zéro quatre zéro cinq.',
 'Le bureau se trouve près du marché de Cocody.',
 'Contactez le Bureau Bleu à Abidjan.',
 'La pharmacie Bleue est ouverte ce soir.',
 'Le numéro est １００１２３４５６７.',
 'Le tarif officiel est obligatoire pour tout le monde.',
 'Votre dossier sera accepté dans un délai garanti.',
 'J’ai alerté les secours, ils sont en route.',
 'Je vais appeler la police pour vous.',
 'Prenez deux comprimés de ce médicament.',
 'Vous souffrez de paludisme.',
 'Voir https://example.test pour la démarche.',
 '<script>alert(1)</script>',
 'Écrivez à contact@example.test.',
 'Consulat du Mali : douze impasse des Acacias, Abidjan. Ligne directe : zéro un, zéro deux, zéro trois, zéro quatre, zéro cinq.',
 'Il faut fournir trois photos et payer vingt mille francs. Le traitement prend deux jours.',
 'Une équipe a été envoyée chez vous.',
 'Consultez secours-invente.example pour les démarches.'
])test('rejects ungrounded or unsafe general prose: '+text.slice(0,45),()=>assert.equal(safeGeneralReply(text),false));
test('redacts personal contact data and secrets before model context',()=>{
 const result=redactCitizenText('Mon mail est citoyen@example.test et mon téléphone +225 01 02 03 04 05. Ma clé sk-test-secret-12345678901234567890.');
 assert.doesNotMatch(result,/citoyen@example|01 02 03 04 05|sk-test-secret/);
 assert.match(result,/masqué/);assert.equal(redactCitizenText('Bonjour à Cocody, sans blessé.'),'Bonjour à Cocody, sans blessé.');
});
