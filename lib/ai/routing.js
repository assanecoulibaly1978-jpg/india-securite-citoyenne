// Pure private-pilot hints, not an emergency decision engine. The parent must
// run its deterministic engine first and retain active accident/complaint flows.
const WORD_CORRECTIONS = new Map([
  ['accidan', 'accident'], ['accidant', 'accident'], ['acciden', 'accident'],
  ['blese', 'blessé'], ['blesé', 'blessé'], ['bleser', 'blessé'], ['blesés', 'blessés'],
  ["n'respire pa", 'ne respire pas'], ['n’respire pa', 'ne respire pas'],
  ["n'respire plus", 'ne respire plus'], ['n’respire plus', 'ne respire plus'],
  ['respire pa', 'respire pas'], ['respir pa', 'respire pas'],
  ['respir plus', 'respire plus'], ['saigne bcp', 'saigne beaucoup'],
  ['resprire', 'respire'],
  ['farmacie', 'pharmacie'], ['farmassi', 'pharmacie'],
  ['komissariat', 'commissariat'], ['gendarmeri', 'gendarmerie'],
  ['plinte', 'plainte'], ['jsui', 'je suis'], ['je sui', 'je suis'],
]);
const correctionPattern = new RegExp(
  `(?<![\\p{L}\\p{N}_])(?:${[...WORD_CORRECTIONS.keys()].join('|')})(?![\\p{L}\\p{N}_])`, 'giu',
);

function matchCase(original, replacement) {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (/^\p{Lu}/u.test(original)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function normalizeCitizenMessage(message) {
  const correct = value => value.replace(correctionPattern, word =>
    matchCase(word, WORD_CORRECTIONS.get(word.toLowerCase())));
  // A word repair can expose one phrase repair (resprire pa → respire pas).
  // Two bounded passes avoid disagreement between triage and classification.
  return correct(correct(message));
}

// Deliberately conservative: negated, uncertain and historical danger mentions
// remain sensitive hints. Only a narrow, purely educational request is exempt.
const SENSITIVE_PATTERNS = [
  /\b(?:accidents?|bless\w*|saign\w*|respir\w*|douleurs?|fievre|symptomes?|malaise|vom\w*|enceinte|medic\w*|posologie|paracetamol|dose|dosage)\b/,
  /\bmal (?:a|au|aux)\b/,
  /\b(?:touss\w*|essouffl\w*|etouff\w*|frapp\w*|mourir|cle api)\b/,
  /\b(?:seroposit\w*|vih|sida|diabet\w*|cancer\w*|grossesse|diagnosti\w*)\b/,
  /\b(?:violence\w*|menac\w*|couteau|agress\w*|suicid\w*|tuer|bombe|arme|incendie|danger|urgence)\b/,
  /\b(?:en finir|me faire du mal|plus envie de vivre)\b/,
  /\b(?:mot de passe|code (?:pin|secret)|carte bancaire|donnees personnelles|secret\w*)\b/,
  /\b(?:pirat\w*|voler|cambriol\w*|fraud\w*|illegal\w*|falsifi\w*)\b/,
];

export function classifyCitizenMessage(message) {
  const text = normalizeCitizenMessage(message).normalize('NFD')
    .replace(/\p{M}/gu, '').toLowerCase();
  if (/^\s*explique(?:-moi)? les accidents(?: de la route)?[.!?\s]*$/.test(text)) return 'general';
  if (SENSITIVE_PATTERNS.some(pattern => pattern.test(text))) return 'sensitive';

  const service = /\b(?:pharmacie|police|commissariat|gendarmerie|mairie|hopital|service public|centre de sante|consulat|ambassade|ministere)\b/.test(text);
  const locationRequest = /\b(?:ou|trouver|cherche\w*|proche|garde|adresse|contact|telephone|numero|joindre|horaires?)\b/.test(text);
  const contactRequest = /\b(?:quel(?:le)?|donne\w*|cherche\w*|trouver|obtenir)\b.*\b(?:adresse|contact|telephone)\b/.test(text);
  if ((service && locationRequest) || contactRequest) {
    return 'local_search';
  }
  if (/\b(?:cni|passeports?|extrait de naissance|acte de naissance|carte nationale|tarifs? officiels?|pieces? obligatoires?|delais? administratifs?|inscription administrative|plainte|permis de conduire|permis de construire|visa|casier judiciaire|immatriculation|naturalisation|pieces? a fournir|documents? exiges?)\b/.test(text)
    || /\brenouvel\w*\b.*\bcarte\b/.test(text)) {
    return 'official_information';
  }
  return 'general';
}
