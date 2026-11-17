import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCitizenMessage, classifyCitizenMessage } from '../lib/ai/routing.js';

function routingCases(cases) {
  for (const [input, expected] of cases) {
    test(`routing hint: ${JSON.stringify(input)}`, () => {
      assert.equal(classifyCitizenMessage(input), expected);
      assert.equal(classifyCitizenMessage(normalizeCitizenMessage(input)), expected);
    });
  }
}

routingCases([
  ['C’est quoi une mairie ?', 'general'],
  ['Explique le rôle de la police', 'general'],
  ['Comment organiser mon budget familial ?', 'general'],
  ['Bonjour !', 'general'],
  ['Comment cuire du riz ?', 'general'],
  ['Explique les accidents', 'general'],
  ['Il respire pa', 'sensitive'],
  ["Il n'respire plus", 'sensitive'],
  ['Je saigne bcp', 'sensitive'],
  ['Je suis blese', 'sensitive'],
  ['Il y a un accidan sans blese', 'sensitive'],
  ['Je ne sais pas si une personne est blese', 'sensitive'],
  ['Hier un accident, sans blessé, maintenant tout va bien', 'sensitive'],
  ['Une personne est blese devant moi', 'sensitive'],
  ['Mon voisin menace sa femme avec un couteau', 'sensitive'],
  ['Je subis des violences', 'sensitive'],
  ['Je veux me suicider', 'sensitive'],
  ['Je veux en finir avec la vie', 'sensitive'],
  ['Quelle dose de paracétamol pour un enfant ?', 'sensitive'],
  ['J’ai mal à la poitrine', 'sensitive'],
  ['Mon bébé a de la fièvre', 'sensitive'],
  ['Quel est le mot de passe de mon voisin ?', 'sensitive'],
  ['Voici mon code PIN et mon numéro de carte bancaire', 'sensitive'],
  ['Comment pirater un compte ?', 'sensitive'],
  ['Comment fabriquer une bombe ?', 'sensitive'],
  ['Explique les accidents : mon frère ne respire plus', 'sensitive'],
]);

routingCases([
  ['Comment obtenir ma CNI ?', 'official_information'],
  ['Quels documents pour un passeport ?', 'official_information'],
  ['Je veux un extrait de naissance', 'official_information'],
  ['Quel est le tarif officiel ?', 'official_information'],
  ['Quelles pièces obligatoires ?', 'official_information'],
  ['Quel délai administratif ?', 'official_information'],
  ['Comment renouveler ma carte ?', 'official_information'],
  ['Inscription administrative à l’université', 'official_information'],
  ['Carte nationale d’identité : comment faire ?', 'official_information'],
  ['Quelle pharmacie de garde à Thiès ?', 'local_search'],
  ['Trouver une farmassi à Saint-Louis', 'local_search'],
  ['Adresse du komissariat de Pikine ?', 'local_search'],
  ['Téléphone de la mairie de Dakar ?', 'local_search'],
  ['Contact de la gendarmeri ?', 'local_search'],
  ['Où est la police la plus proche ?', 'local_search'],
  ['Je cherche un service public à Kaolack', 'local_search'],
  ['Comment déposer une plinte ?', 'official_information'],
  ['Quelle adresse pour renouveler ma CNI ?', 'local_search'],
  ['Une pharmacie de garde, mon enfant ne respire plus', 'sensitive'],
  ['Mon passeport et mon mot de passe sont volés', 'sensitive'],
  ['Je tousse et je suis essoufflé', 'sensitive'],
  ['J’étouffe', 'sensitive'],
  ['On me frappe', 'sensitive'],
  ['Je veux mourir', 'sensitive'],
  ['Voici ma clé API privée', 'sensitive'],
  ['Comment fonctionne un téléphone ?', 'general'],
  ['C’est quoi une adresse IP ?', 'general'],
  ['Quel est le numéro de téléphone du service ?', 'local_search'],
  ['Numéro du commissariat ?', 'local_search'],
  ['Explique les accidents de la route', 'general'],
  ['Explique les accidents de la route, il y a un blessé', 'sensitive'],
]);

const normalizationCases = [
  ['accidan à Saint-Louis', 'accident à Saint-Louis'],
  ['accidant puis acciden', 'accident puis accident'],
  ['un blese, des blesés, sans bleser', 'un blessé, des blessés, sans blessé'],
  ['farmacie et farmassi à Ndiaganiao', 'pharmacie et pharmacie à Ndiaganiao'],
  ['komissariat, gendarmeri, plinte', 'commissariat, gendarmerie, plainte'],
  ['jsui ici, je sui à Thiès', 'je suis ici, je suis à Thiès'],
  ['Saint-Accidantville et Farmassiène', 'Saint-Accidantville et Farmassiène'],
  ['sans pas personne aucun ni hier maintenant', 'sans pas personne aucun ni hier maintenant'],
  ['C’est quoi une mairie ?', 'C’est quoi une mairie ?'],
  ['  Dakar, Plateau !  ', '  Dakar, Plateau !  '],
  ['', ''],
  ['il respire pa', 'il respire pas'],
  ['il respire plus', 'il respire plus'],
  ["il n'respire pa", 'il ne respire pas'],
  ['il n’respire plus', 'il ne respire plus'],
  ['il ne respir pa', 'il ne respire pas'],
  ['il respir pa', 'il respire pas'],
  ['il saigne bcp', 'il saigne beaucoup'],
  ['pas de blese', 'pas de blessé'],
  ['sans bleser', 'sans blessé'],
  ['personne est blese', 'personne est blessé'],
  ['une personne est blese', 'une personne est blessé'],
  ['hier accidan sans blese, maintenant il respire pa', 'hier accident sans blessé, maintenant il respire pas'],
  ['ACCIDAN, JE SUI BLESÉ', 'ACCIDENT, JE SUIS BLESSÉ'],
  ['aucun blese ni saignement', 'aucun blessé ni saignement'],
  ['je ne sais pas si une personne est blese', 'je ne sais pas si une personne est blessé'],
];
for (const [input, expected] of normalizationCases) {
  test(`normalization preserves meaning: ${JSON.stringify(input)}`, () => {
    assert.equal(normalizeCitizenMessage(input), expected);
    assert.equal(normalizeCitizenMessage(expected), expected);
  });
}
