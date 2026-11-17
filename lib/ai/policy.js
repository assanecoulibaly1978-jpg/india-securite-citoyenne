import {normalize} from '../directory.js';

// Defense in depth for the PRIVATE pilot, not a proof of factual correctness.
// Official/local claims are handled upstream by server-owned responses/cards.
export function safeGeneralReply(reply){
 if(typeof reply!=='string'||!reply.trim()||reply.length>2000)return false;
 const text=normalize(reply.replace(/\[(?:NOM|DATE|ADRESSE|REFERENCE)\]/g,''));
 if(/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(reply)||/https?:|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2}|\b[\p{L}\d-]+\.[a-z]{2,}\b/iu.test(reply)||/(?:\p{N}[\s().+\-]*){7,}/u.test(reply))return false;
 const forbidden=[
  /\b(adresse|rue|boulevard|avenue|allee|impasse|ligne directe|telephone|numero|whatsapp|commissariat|brigade|pharmacie|clinique|hopital|posologie|medicament|comprime|antibiotique)\b/,
  /\b(appelez|contactez|joignez|composez|rendez vous|se trouve|situe\w*|mairie de|bureau de)\b/,
  /\b(officiel\w*|obligatoire\w*|tarif\w*|delai\w*|garanti\w*|decret\w*)\b/,
  /\b(faut fournir|apportez|frais de|traitement prend|francs?|fcfa|xof)\b/,
  /\b(?:a ete|ont ete|sera|seront) (?:envoye\w*|alerte\w*|transmis\w*|enregistre\w*|declenche\w*)\b/,
  /\b(?:j ai|nous avons|je vais|je suis en train de) (?:contacte|alerte|transmis|envoye|depose|enregistre|efface|supprime|appeler|contacter|alerter)\b/,
  /\bsecours\b.*\b(en route|arrivent|arriveront|alertes)\b/,
  /\b(prenez|avalez|vous souffrez|vous avez une maladie|pas besoin de soins|pas besoin de medecin)\b/
 ];
 return !forbidden.some(pattern=>pattern.test(text));
}

export function redactCitizenText(value){
 return String(value??'')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[courriel masqué]')
  .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g,'[clé masquée]')
  .replace(/(?<!\d)(?:\+?225[ .-]*)?(?:\d[ .-]*){8,13}(?!\d)/g,'[numéro masqué]')
  .replace(/\b(?:mot de passe|code secret|code de validation)\s*(?:est|:|=)?\s*\S+/giu,'[secret masqué]');
}
