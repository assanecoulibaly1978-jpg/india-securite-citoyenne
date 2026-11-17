// Presentation only: the caller owns authentication, session storage and routing.
// Never replace the service's knowledge, source metadata or deterministic guards.
import {normalize} from '../directory.js';
import {classifyCitizenMessage} from './routing.js';
import {matchAdministrativeProcedure} from './knowledge.js';

const names=Object.freeze({cni:'carte nationale d’identité (CNI)',extrait_naissance:'extrait de naissance',casier_judiciaire:'casier judiciaire',passeport:'passeport ivoirien',permis_conduire:'permis de conduire'});

const followups=new Map();
for(const phrase of ['oui','oui merci','continue','continuer','on continue','ensuite','suivant','la suite','suite','d accord','ok','première demande','une première demande','adulte','je suis adulte','pour un adulte','pour moi','renouvellement','un renouvellement','mineur','pour un mineur','diaspora','à l étranger','première demande adulte','première demande pour un adulte','première demande pour moi'])followups.set(normalize(phrase),phrase);
for(const [section,words] of Object.entries({documents:['pièces','documents','pièces à fournir'],fees:['frais','tarifs','prix','coût'],timelines:['délais','délai'],steps:['étapes','démarche'],administration:['administration']})){
 for(const word of words)for(const prefix of ['','les ','des ','quels ','quelles ','et les '])followups.set(normalize(prefix+word),section);
}
function finiteFollowup(message){
 if(typeof message!=='string'||message.length>100||!/^[\p{L}\p{N}\s’'?!.,-]+$/u.test(message))return null;
 if(['sensitive','local_search'].includes(classifyCitizenMessage(message)))return null;
 return followups.get(normalize(message))||null;
}

function cleanState(state){
 if(!state||typeof state!=='object'||!Object.hasOwn(names,state.procedureId))return {};
 const out={procedureId:state.procedureId};
 if(['profile','reading','limited','topic'].includes(state.stage))out.stage=state.stage;
 if(['age','application','record'].includes(state.question))out.question=state.question;
 if(['first','renewal'].includes(state.application))out.application=state.application;
 if(['adult','minor','diaspora'].includes(state.profile))out.profile=state.profile;
 if(state.limited===true)out.limited=true;
 if(Object.hasOwn(sectionPatterns,state.section))out.section=state.section;
 if(Number.isInteger(state.cursor)&&state.cursor>=0&&state.cursor<=100)out.cursor=state.cursor;
 return out;
}
function ageProfile(message,state){
 if(state.stage!=='profile'||state.question!=='age'||typeof message!=='string')return null;
 const age=/^\s*(?:j['’]ai\s+)?(\d{1,3})\s+ans[.!?]?\s*$/i.exec(message);
 return age&&Number(age[1])<=120?(Number(age[1])<18?'minor':'adult'):null;
}
const profileTerms={adult:'adulte',minor:'mineur',diaspora:'diaspora'};
export function prepareDocumentaryMessage(message,state={}){
 const previous=cleanState(state),id=previous.procedureId;
 if(id==='extrait_naissance'&&previous.question==='record'&&['non','non pas encore'].includes(normalize(message)))return 'Déclaration de naissance';
 const age=ageProfile(message,previous),followup=finiteFollowup(message);
 if(!id||(!followup&&!age))return message;
 const context=[previous.application==='first'?'première demande':previous.application==='renewal'?'renouvellement':'',profileTerms[previous.profile]||''];
 return `${names[id]} : ${age?profileTerms[age]:message} ${context.filter(Boolean).join(' ')}`.trim();
}

const sectionPatterns={documents:/\b(?:pieces?|documents?|photos?)\b/,fees:/\b(?:frais|tarifs?|prix|cout|combien coute)\b/,timelines:/\b(?:delais?|duree|combien de temps)\b/,steps:/\b(?:etapes?)\b/,administration:/\badministration\b/};
function requestedSection(message){
 const matches=Object.entries(sectionPatterns).filter(([,pattern])=>pattern.test(normalize(message)));
 return matches.length===1?matches[0][0]:null;
}
const topicQuestions={steps:'Souhaitez-vous passer aux pièces ?',administration:'Souhaitez-vous passer aux pièces ?',documents:'Souhaitez-vous passer aux frais ?',fees:'Souhaitez-vous passer aux délais ?',timelines:'Souhaitez-vous revoir les pièces ?'};
function present(answer,reply,state,paths=[]){
 return {answer:{...answer,reply,documentaryDetails:answer.reply,displayedFactPaths:paths},state};
}

export function renderDocumentaryDialogue(answer,message,state={}){
 if(['protected_protocol','local_search','safety_orientation'].includes(answer?.answerType))return {answer,state:{}};
 const stored=cleanState(state),text=normalize(message);
 if(answer?.answerType==='general'&&/^(?:merci(?: beaucoup)?|bonjour|salut|bonsoir)$/.test(text))return {answer,state:stored};
 const id=answer?.knowledge?.procedureId;
 if(!Object.hasOwn(names,id))return answer?.answerType==='official_information'?present(answer,'À confirmer — je n’ai pas de référence officielle suffisante pour cette demande. Quelle seule démarche souhaitez-vous préciser ?',{}):{answer,state:{}};
 const previous=stored.procedureId===id?stored:{};
 const followup=finiteFollowup(message);
 const explicit=matchAdministrativeProcedure(message)===id;
 // A known record is not permission to answer an arbitrary new/mixed topic.
 // Conjunctions outside the finite follow-up grammar require clarification.
 const mixed=/\bet\b/.test(text)&&!followup;
 if(mixed||(!explicit&&!(previous.procedureId&&(followup||ageProfile(message,previous)))))return present(answer,'À confirmer — la référence est insuffisante pour cette demande. Quelle seule démarche souhaitez-vous préciser ?',{});
 const nextProfile={...previous,procedureId:id};
 if(/\bpremiere demande\b/.test(text))nextProfile.application='first';
 if(/\brenouvellement\b/.test(text))nextProfile.application='renewal';
 const age=ageProfile(message,previous);
 if(age)nextProfile.profile=age;
 else if(/\bmineur\b/.test(text))nextProfile.profile='minor';
 else if(/\b(?:diaspora|etranger)\b/.test(text))nextProfile.profile='diaspora';
 else if(/\badulte\b/.test(text))nextProfile.profile='adult';
 if(answer.knowledge.scopeLimitation||answer.knowledge.status==='insufficient_scope'||previous.limited){
  const limit=answer.knowledge.scopeLimitation||'Cette variante nécessite une vérification spécifique.';
  return present(answer,`À confirmer — la référence est insuffisante pour cette situation. ${limit} Quelle autre démarche souhaitez-vous préciser, sans document personnel ?`,{...nextProfile,stage:'limited',limited:true});
 }
 const direct=requestedSection(message);
 const continuing=!!finiteFollowup(message)&&['oui','oui merci','continue','continuer','on continue','ensuite','suivant','la suite','suite','d accord','ok'].includes(normalize(message));
 let section=direct||(continuing&&['reading','topic'].includes(previous.stage)?previous.section:null);
 if(id==='extrait_naissance'&&previous.question==='record'&&['oui','oui merci'].includes(text))section='steps';
 if(!section&&(nextProfile.profile==='adult')){
  section=answer.knowledge.facts?.some(f=>f.section==='steps')?'steps':'administration';
 }
 if(!section){
  if(id==='extrait_naissance')return present(answer,'À confirmer — souhaitez-vous une copie d’un acte de naissance déjà enregistré ?',{...nextProfile,stage:'profile',question:'record'});
  const askAge=id==='casier_judiciaire'||nextProfile.application==='first'||text==='pour moi';
  return present(answer,askAge?'À confirmer — la demande concerne-t-elle un adulte ou un mineur ?':`Bonjour. Pour votre ${names[id]}, les informations restent À confirmer. Est-ce une première demande ou un renouvellement ?`,{...nextProfile,stage:'profile',question:askAge?'age':'application'});
 }
 const suppressed=new Set((answer.knowledge.suppressedFacts||[]).map(f=>f.path));
 const facts=(answer.knowledge.facts||[]).filter(f=>f.section===section&&!suppressed.has(f.path)&&typeof f.text==='string'&&f.text&&typeof f.scope==='string'&&f.scope&&/^\d{4}-\d{2}-\d{2}$/.test(f.verified_on)&&Array.isArray(f.sources)&&f.sources.length>0&&Array.isArray(f.source_ids)&&f.source_ids.length>0&&f.source_ids.every(id=>f.sources.some(s=>s.id===id)));
 const cursor=continuing&&previous.section===section&&Number.isInteger(previous.cursor)?previous.cursor:0;
 const fact=facts[cursor];
 const {question,...readingProfile}=nextProfile;
 const next={...readingProfile,stage:'reading',section,cursor:Math.min(cursor+(fact?1:0),facts.length)};
 if(!fact){
  const nextSections={steps:'documents',administration:'documents',documents:'fees',fees:'timelines',timelines:'documents'};
  return present(answer,`À confirmer — pas d’autre information établie pour cette rubrique. ${topicQuestions[section]}`,{...next,stage:'topic',section:nextSections[section],cursor:0});
 }
 const reply=`À confirmer — ${fact.text}\nPortée : ${fact.scope}${fact.limits?`\nRéserve : ${fact.limits}`:''}\nSouhaitez-vous continuer ?`;
 return present(answer,reply,next,[fact.path]);
}
