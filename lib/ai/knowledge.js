// Private documentary preview only: no network, writes, tools or model calls.
import {readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {normalize} from '../directory.js';
const identifiers=['cni','extrait_naissance','casier_judiciaire','passeport','permis_conduire'];
const unsupportedAdministrative=/\b(?:visa|permis de construire|immatriculation|naturalisation|divorce|certificat de residence|acte de mariage|acte de deces|carte de resident|livret de famille)\b/;
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&[...a].sort().join('|')===[...b].sort().join('|');
function readBounded(file){if(statSync(file).size>200000)throw Error('Document trop volumineux');return readFileSync(file);}
function load(dir){
 const manifest=JSON.parse(readBounded(path.join(dir,'manifest.json')));
 const raw=readBounded(path.join(dir,'base-administrative.json'));
 if(manifest.private_read_only!==true||manifest.public_enabled!==false||manifest.generative_use!==false||manifest.automatic_requirements_allowed!==false||createHash('sha256').update(raw).digest('hex')!==manifest.dataset_sha256)throw Error('Référence non autorisée');
 const base=JSON.parse(raw);
 if(base.read_only!==true||base.runtime_enabled!==false||!same(base.procedures?.map(p=>p.id),identifiers)||!same(manifest.procedure_ids,identifiers)||!same(base.sources?.map(s=>s.id),manifest.source_ids)||new Set(base.sources.map(s=>s.id)).size!==26)throw Error('Corpus incomplet');
 const sources=new Map(base.sources.map(s=>[s.id,s]));
 for(const source of sources.values()){
  const url=new URL(source.url);
  if(url.protocol!=='https:'||url.username||url.password||!/^\d{4}-\d{2}-\d{2}$/.test(source.consulted_on)||!source.title||!source.publisher)throw Error('Source invalide');
 }
 for(const p of base.procedures)for(const fact of [p.administration,...p.conditions,...p.documents,...p.steps,...p.fees,...p.timelines,...p.uncertainties]){
  if(!fact.text||!fact.scope||!fact.status||fact.auto_answer_eligible!==false||!/^\d{4}-\d{2}-\d{2}$/.test(fact.verified_on)||!Array.isArray(fact.source_ids)||!fact.source_ids.length||fact.source_ids.some(id=>!sources.has(id)))throw Error('Association documentaire invalide');
 }
 let review=null;
 if(manifest.content_review==='completed_with_reservations'&&manifest.source_review==='completed_with_reservations'){
  if(manifest.review_file!=='review.json')throw Error('Audit non autorisé');
  const bytes=readBounded(path.join(dir,'review.json'));
  if(createHash('sha256').update(bytes).digest('hex')!==manifest.review_sha256)throw Error('Audit altéré');
  review=JSON.parse(bytes);
  const entries=new Map(base.procedures.flatMap((p,pi)=>sections.flatMap(section=>(section==='administration'?[p.administration]:p[section]).map((f,i)=>[`/procedures/${pi}/${section}`+(section==='administration'?'':`/${i}`),f]))));
  if(review.status!=='completed_with_reservations'||review.base_sha256!==manifest.dataset_sha256||review.claim_checks?.length!==entries.size||new Set(review.claim_checks.map(c=>c.path)).size!==entries.size||review.source_checks?.length!==sources.size||!same(review.source_checks.map(s=>s.id),[...sources.keys()]))throw Error('Audit incomplet');
  let associations=0;
  for(const c of review.claim_checks){const f=entries.get(c.path);if(!f||!same(c.source_ids,f.source_ids)||!['supported','partially_supported','uncertain','contradicted'].includes(c.status))throw Error('Association non auditée');associations+=c.source_ids.length;}
  const excluded=review.claim_checks.filter(c=>c.status!=='supported').map(c=>c.path);
  if(!same(excluded,review.quarantined_fact_paths)||!same(excluded,manifest.quarantined_fact_paths)||review.counts.sources!==sources.size||review.counts.facts!==entries.size||review.counts.associations!==associations)throw Error('Quarantaine incohérente');
  for(const s of review.source_checks){
   if(s.original_url!==sources.get(s.id).url||![true,false,'unknown'].includes(s.usable)||!Number.isFinite(Date.parse(s.checked_at)))throw Error('Lien non audité');
   if(s.verified_same_document_alternative_url&&(s.alternative_verified!==true||s.alternative_status!==200||s.verified_same_document_alternative_url!==s.original_url+'/'||!Number.isFinite(Date.parse(s.alternative_checked_at))))throw Error('Variante non vérifiée');
  }
  for(const s of review.source_metadata_overrides||[])if(![20,21].includes(s.id)||!same(s.official_basis_source_ids,[19])||typeof s.official_basis!=='string')throw Error('Provenance non autorisée');
 }
 return {base,manifest,sources,review};
}
function administrativeMatches(text){
 return [[/\b(?:cni|carte nationale|carte d identite)\b/,'cni'],[/\b(?:extrait|acte|certificat|declar\w*|copie|jugement|rectifi\w*|etat civil)\b.*\bnaissance\b/,'extrait_naissance'],[/\bcasier(?: judiciaire)?\b|\bbulletin n? ?3\b/,'casier_judiciaire'],[/\bpasseports?\b/,'passeport'],[/\bpermis (?:de )?conduire\b|\bpermis b\b/,'permis_conduire']].filter(([pattern])=>pattern.test(text)).map(([,id])=>id);
}
function unsupportedTopic(text,matches){
 // Civil status can qualify a birth copy; nationality can be a CNI document question.
 return unsupportedAdministrative.test(text)||(!matches.includes('extrait_naissance')&&/\betat civil\b/.test(text))||(!matches.length&&/\bnationalite\b/.test(text));
}
export function matchAdministrativeProcedure(message,previousId){
 const text=normalize(message),matches=administrativeMatches(text);
 if(unsupportedTopic(text,matches)||matches.length>1)return null;
 if(matches.length===1)return matches[0];
 // An elliptical checklist question is referential only if it names no new topic.
 // In particular, 'pièces pour un <unknown procedure>' must never reuse a record.
 const followup=text.replace(/^(?:bonjour|salut|bonsoir|merci)(?: beaucoup)?\s*/, '');
 const referential=/^(?:et |ensuite )?(?:(?:quelles?|quels?|les?|des?|un|une|du|de|d|et|pour|ce|cet|cette|ces|mon|ma|mes|premiere|demande|renouvellement|pieces?|documents?|tarifs?|prix|cout|delais?|combien|obligatoires?|necessaires?|faut|il|apporter|fournir|photos?|parents?|nationalite|sont|est|le|la|en|a|cela|ca)\b\s*)+$/;
 return identifiers.includes(previousId)&&/\b(?:pieces?|documents?|tarifs?|prix|cout|delais?|combien|photos?|nationalite|renouvellement)\b/.test(followup)&&referential.test(followup)?previousId:null;
}
export const isAdministrativeInformationQuery=message=>{
 const text=normalize(message),matches=administrativeMatches(text);
 return matches.length>0||unsupportedTopic(text,matches);
};
function scopeLimit(id,message){
 const text=normalize(message);
 const ages=[...text.matchAll(/\b(?:j ai|il a|elle a|(?:fille|fils|garcon|adolescente?|personne|demandeur|demandeuse) (?:(?:est )?agee? de|de|a)) (\d{1,2}) ans\b/g)];
 if(id!=='extrait_naissance'&&(/\b(?:mineur|enfant)\b/.test(text)||ages.some(match=>Number(match[1])<18)))return 'Le dossier complet pour un mineur n’est pas établi dans cette base.';
 if(id==='extrait_naissance'&&/\b(?:declar\w*|jugement|rectifi\w*)\b/.test(text))return 'La fiche couvre la copie d’un acte déjà enregistré, pas une déclaration, une rectification ni un jugement supplétif.';
 if(id==='permis_conduire'&&(/\bcategorie (?!b\b)[a-z][a-z0-9]?\b|\bpoids lourds?\b/.test(text)))return 'Seule la catégorie B est documentée.';
 if(/\b(?:renouvel\w*|duplicata|perdu|perte|vole|naturalise\w*|naturalisation|diaspora|etranger|consulat|ambassade)\b/.test(text))return 'Cette variante exige une vérification spécifique ; les mentions disponibles sont partielles ou divergentes.';
 if(id==='passeport'&&/\b(?:diplomatique|service|francais|malien|senegalais|burkinabe)\b/.test(text))return 'Seul le cas principal du passeport ordinaire ivoirien en Côte d’Ivoire est documenté.';
 return '';
}
const sections=['administration','conditions','documents','steps','fees','timelines','uncertainties'];
const labels={administration:'Administration citée',conditions:'Conditions mentionnées — à confirmer',documents:'Pièces mentionnées — à confirmer',steps:'Étapes documentées — à confirmer',fees:'Montants publiés — actualité et coût total à confirmer',timelines:'Délais publiés — non garantis, à confirmer',uncertainties:'Limites et divergences documentées'};
export function renderAdministrativeProcedure(base,id,{quarantinedPaths=[],limited=false,limitation='',sourceChecks=[],sourceMetadataOverrides=[]}={}){
 const pi=base.procedures.findIndex(p=>p.id===id),p=base.procedures[pi];
 if(!p)return null;
 const sourceMap=new Map(base.sources.map(s=>[s.id,s])),quarantine=new Set(quarantinedPaths),checks=new Map(sourceChecks.map(s=>[s.id,s]));
 const overrides=new Map(sourceMetadataOverrides.map(s=>[s.id,s]));
 const reference=s=>({...s,...(overrides.has(s.id)?{official_basis:overrides.get(s.id).official_basis,official_basis_source_ids:overrides.get(s.id).official_basis_source_ids}:{}),currentness:'to_confirm',linkStatus:checks.get(s.id)?.intermittent?'intermittent':checks.get(s.id)?.usable===true?'usable':checks.get(s.id)?.usable===false?'unavailable':'not_rechecked',linkCheckedAt:checks.get(s.id)?.checked_at||null,...(checks.get(s.id)?.verified_same_document_alternative_url?{access_url:checks.get(s.id).verified_same_document_alternative_url,access_url_checked_at:checks.get(s.id).alternative_checked_at}:{})});
 const facts=[],suppressedFacts=[],allIds=new Set();
 for(const section of sections){
  const list=section==='administration'?[p.administration]:p[section];
  list.forEach((f,index)=>{
   f.source_ids.forEach(id=>allIds.add(id));
   const pointer=`/procedures/${pi}/${section}`+(section==='administration'?'':`/${index}`);
   if(quarantine.has(pointer)){suppressedFacts.push({path:pointer,reason:'association_not_confirmed'});return;}
   if(limited&&section!=='uncertainties')return;
   facts.push({path:pointer,section,text:f.text,scope:f.scope,sourceStatus:f.status,verified_on:f.verified_on,source_ids:[...f.source_ids],sources:f.source_ids.map(id=>reference(sourceMap.get(id))),confirmationRequired:true,obligationStatus:'not_certified',limits:f.limits||null});
  });
 }
 const references=[...allIds].map(id=>reference(sourceMap.get(id)));
 const lines=[p.title,'Références documentaires privées — à confirmer. Cette fiche ne constitue pas une liste officielle actuelle de pièces obligatoires.',`Périmètre couvert : ${p.scope}`,'Les tarifs, délais, pièces et conditions ci-dessous sont à confirmer auprès du service compétent. Aucune garantie de délai, de coût total ni de dossier complet.'];
 if(limited)lines.push('Fiche insuffisante pour votre situation : '+limitation+' Je ne peux pas confirmer une liste complète pour ce cas.');
 if(suppressedFacts.length)lines.push('Des informations ont été écartées : leur association aux sources n’est pas suffisamment établie.');
 for(const section of sections){
  const selected=facts.filter(f=>f.section===section);
  if(!selected.length){if(!limited&&['fees','timelines'].includes(section))lines.push(section==='fees'?'Aucun tarif actuel confirmé dans cette fiche.':'Aucun délai actuel garanti dans cette fiche.');continue;}
  lines.push(labels[section]+' :');
  for(const f of selected){const prefix=f.sourceStatus==='conflict'?'Divergence entre sources — à confirmer':'À confirmer';lines.push(`- ${prefix} : ${f.text} (Portée : ${f.scope} ; consultation documentaire : ${f.verified_on}.) ${f.source_ids.map(id=>'['+id+']').join(' ')}`);if(f.limits)lines.push('  Réserve : '+f.limits);}
 }
 lines.push('Sources et dates de consultation (pas des dates de mise à jour ni une vérification au guichet) :');
 for(const s of references){lines.push(`[${s.id}] ${s.title} — ${s.publisher} — consulté le ${s.consulted_on} : ${s.access_url||s.url}`);if(s.access_url&&s.access_url!==s.url)lines.push('  URL documentaire conservée : '+s.url);if(s.linkStatus==='intermittent')lines.push('  Accès intermittent ; variante du même document vérifiée le '+s.access_url_checked_at+'.');if(s.linkStatus==='unavailable')lines.push('  Ce lien n’a pas pu être revalidé ; ne pas en déduire une exigence actuelle.');}
 lines.push('Ne transmettez ici ni pièce d’identité ni document personnel. Pour des coordonnées locales, seul l’annuaire est autorisé.');
 return {reply:lines.join('\n'),sources:references,knowledge:{procedureId:id,readOnly:true,generativeUse:false,confirmationRequired:true,scopeLimitation:limitation||null,status:limited?'insufficient_scope':suppressedFacts.length?'incomplete_reference':'private_reference_to_confirm',facts,suppressedFacts},answerType:'official_information',verification:'required',results:[],state:{}};
}
export function administrativeReferenceReply(message,{dir,previousId,previousLimitation}={}){
 const id=matchAdministrativeProcedure(message,previousId);
 if(!dir)return null;
 let loaded;try{loaded=load(dir);}catch{return null;}
 const {base,sources,review}=loaded;
 const procedure=base.procedures.find(p=>p.id===id);
 if(!procedure)return null;
 const limitation=scopeLimit(id,message)||(id===previousId&&typeof previousLimitation==='string'?previousLimitation:'');
 if(review)return renderAdministrativeProcedure(base,id,{quarantinedPaths:review.quarantined_fact_paths,sourceChecks:review.source_checks,sourceMetadataOverrides:review.source_metadata_overrides,limited:!!limitation,limitation});
 const ids=[...new Set([procedure.administration,...procedure.conditions,...procedure.documents,...procedure.steps,...procedure.fees,...procedure.timelines,...procedure.uncertainties].flatMap(f=>f.source_ids))];
 const references=ids.map(id=>({...sources.get(id),currentness:'to_confirm'}));
 const lines=[procedure.title,'Références documentaires privées — à confirmer. Cette fiche ne constitue pas une liste officielle actuelle de pièces obligatoires.',`Périmètre : ${procedure.scope}`,...(limitation?['Fiche insuffisante pour votre situation : '+limitation]:[]),'La vérification des associations et des liens est en cours ; aucun tarif, délai ou dossier complet ne peut être confirmé.','Sources et dates de consultation (pas des dates de mise à jour) :',...references.map(s=>`[${s.id}] ${s.title} — ${s.publisher} — consulté le ${s.consulted_on} : ${s.url}`)];
 return {reply:lines.join('\n'),sources:references,knowledge:{procedureId:id,readOnly:true,generativeUse:false,confirmationRequired:true,scopeLimitation:limitation||null,status:limitation?'insufficient_scope':'review_pending'},answerType:'official_information',verification:'required',results:[],state:{}};
}
