// Server-owned dialogue state only: no transport, factual source, raw history or logging.
import {normalize} from '../directory.js';
import {classifyCitizenMessage} from './routing.js';
import {matchAdministrativeProcedure} from './knowledge.js';
import {prepareDocumentaryMessage,renderDocumentaryDialogue} from './documentary-dialogue.js';
import {CNI_FACT_IDS} from './cni-reference.js';
const names={cni:'CNI',extrait_naissance:'extrait de naissance',casier_judiciaire:'casier judiciaire',passeport:'passeport ivoirien',permis_conduire:'permis de conduire'};
const reasons={expired:'CNI expirée',lost:'CNI perdue',damaged:'CNI détériorée'};
function data(object){
 try{if(!object||![Object.prototype,null].includes(Object.getPrototypeOf(object)))return {};return Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(object)).filter(([,v])=>Object.hasOwn(v,'value')).map(([k,v])=>[k,v.value]));}catch{return {};}
}
function clean(state){
 const input=data(state),doc=data(input.documentary),out={mission:['assistance_citoyenne','prevention','urgences','alertes'].includes(input.mission)?input.mission:'assistance_citoyenne',documentary:{}};
 if(out.mission==='prevention'){
  if(['road_safety','online_safety','home_safety'].includes(input.topic))out.topic=input.topic;
  if(['children','adults','all'].includes(input.audience))out.audience=input.audience;
 }
 if(Object.hasOwn(names,doc.procedureId)){
  out.documentary.procedureId=doc.procedureId;
  for(const [key,values] of Object.entries({application:['first','renewal'],profile:['adult','minor','diaspora'],stage:['profile','reading','limited','topic'],question:['age','application','record'],section:['documents','fees','timelines','steps','administration']}))if(values.includes(doc[key]))out.documentary[key]=doc[key];
  if(doc.limited===true)out.documentary.limited=true;
  if(Number.isInteger(doc.cursor)&&doc.cursor>=0&&doc.cursor<=100)out.documentary.cursor=doc.cursor;
  if(doc.procedureId==='cni'&&doc.application==='renewal'&&Object.hasOwn(reasons,input.reason))out.reason=input.reason;
  if(['reason','verification','question','card_format','first_scope','first_profile','cni_next','cni_clarify','cni_finished'].includes(input.awaiting))out.awaiting=input.awaiting;
  if(doc.procedureId==='cni'){
   if(['biometric','older'].includes(input.cniFormat))out.cniFormat=input.cniFormat;
   if(['standard','other'].includes(input.cniFirstScope))out.cniFirstScope=input.cniFirstScope;
   if(Number.isInteger(input.cniCursor)&&input.cniCursor>=0&&input.cniCursor<=100)out.cniCursor=input.cniCursor;
   if(Array.isArray(input.cniSeen))out.cniSeen=[...new Set(input.cniSeen.filter(id=>CNI_FACT_IDS.includes(id)))].slice(0,CNI_FACT_IDS.length);
  }
 }
 return out;
}
function summary(state){return {mission:state.mission,...Object.fromEntries(['procedureId','application','profile'].filter(k=>state.documentary[k]).map(k=>[k,state.documentary[k]])),...Object.fromEntries(['reason','awaiting','topic','audience'].filter(k=>state[k]).map(k=>[k,state[k]])),...(state.documentary.procedureId==='cni'?{cniVariant:state.reason==='lost'?'loss':state.reason==='expired'?'expiration':state.documentary.application==='first'?'first':state.documentary.application==='renewal'?'renewal':'unspecified'}:{})};}
function sectionFor(text){const found=Object.entries({timelines:/\b(?:delais?|duree|combien de temps)\b/,fees:/\b(?:frais|tarifs?|prix|cout)\b/,documents:/\b(?:pieces?|documents?)\b/}).filter(([,p])=>p.test(text));return found.length===1?found[0][0]:null;}
export function prepareCitizenTurn(message,state={}, {protectedFlow=false}={}){
 const text=normalize(message),previous=clean(state),id=matchAdministrativeProcedure(message);
 const unrelatedOfficial=classifyCitizenMessage(message)==='official_information'&&!id&&!matchAdministrativeProcedure(message,previous.documentary.procedureId);
 let resetLocalContext=unrelatedOfficial||/^(?:nouveau sujet|autre question|passons a)\b/.test(text)||Boolean(id&&previous.documentary.procedureId&&id!==previous.documentary.procedureId);
 let next=resetLocalContext?clean({}):previous;
 const prevention=/\b(?:preven\w*|eviter|sensibilis\w*|prudence|securite routiere)\b/.test(text);
 const alerts=/\b(?:alertes?|rumeurs?)\b/.test(text);
 const outside=/\b(?:recettes?|cuisin\w*|poemes?|football|horoscope|trading|cryptomonnaie|programme python|code javascript)\b/.test(text);
 const followup=/^(?:et\b|elle\b|il\b|pour les\b|oui\b|non\b|merci\b|ensuite\b|continue\b|developpe\b|resume\b)/.test(text);
 const mission=protectedFlow?'urgences':id?'assistance_citoyenne':alerts?'alertes':prevention?'prevention':followup?previous.mission:'assistance_citoyenne';
 if(outside&&!protectedFlow){next=clean({});resetLocalContext=true;}
 else if(mission!==next.mission){next=clean({mission});if(!protectedFlow)resetLocalContext=true;}
 next.mission=outside&&!protectedFlow?'assistance_citoyenne':mission;
 if(next.mission==='prevention'){
  const topic=/\b(?:en ligne|internet|arnaqu\w*)\b/.test(text)?'online_safety':/\b(?:routi\w*|route|circulation)\b/.test(text)?'road_safety':/\b(?:maison|domicil\w*|domestiqu\w*)\b/.test(text)?'home_safety':null;
  if(topic)next.topic=topic;
  if(/\b(?:enfants?|mineurs?)\b/.test(text))next.audience='children';else if(/\badultes?\b/.test(text))next.audience='adults';
 }
 if(id)next.documentary.procedureId=id;
 const implicitCniRenewal=next.documentary.procedureId==='cni'&&!/\b(?:pas|non|jamais)\b/.test(text)&&/\b(?:perdu\w*|perte|expir\w*)\b/.test(text);
 const application=/\brenouvel\w*\b/.test(text)||implicitCniRenewal?'renewal':/\bpremiere (?:demande|carte)\b/.test(text)?'first':null;
 if(application&&next.documentary.procedureId){
  if(next.documentary.application&&next.documentary.application!==application){next={mission:'assistance_citoyenne',documentary:{procedureId:next.documentary.procedureId}};resetLocalContext=true;}
  next.documentary.application=application;
 }
 const category=classifyCitizenMessage(message),safeReference=['general','official_information'].includes(category);
 if(next.documentary.procedureId==='cni'&&safeReference){
  if(/\bbiometri\w*\b/.test(text))next.cniFormat='biometric';else if(/\bancien (?:modele|format)\b/.test(text))next.cniFormat='older';
  const child=[...text.matchAll(/\b(?:j ai|il a|elle a|(?:fille|fils|garcon|adolescente?|personne|demandeur|demandeuse) (?:(?:est )?agee? de|de|a)) (\d{1,2}) ans\b/g)].some(m=>Number(m[1])<18);
  if(/\b(?:etranger|diaspora|consulat|ambassade)\b/.test(text))next.documentary.profile='diaspora';else if(child||/\bmineur\b/.test(text))next.documentary.profile='minor';else if(/\badulte\b/.test(text)&&!/\bpas (?:un )?adulte\b/.test(text))next.documentary.profile='adult';
  if(/\b(?:naturalise\w*|naturalisation|modification|mariage)\b/.test(text))next.cniFirstScope='other';
  if(next.documentary.application==='first'){
   if(/\b(?:naturalise\w*|etranger|hors cote d ivoire|pas ne\w* en cote d ivoire)\b/.test(text))next.cniFirstScope='other';
   else if(!/\b(?:pas|non|jamais)\b/.test(text)&&/\bivoirien\w* d origine\b/.test(text)&&/\bne\w* (?:en )?(?:cote d ivoire|ci)\b/.test(text))next.cniFirstScope='standard';
   else if(!previous.cniFirstScope&&previous.awaiting==='first_scope'&&/^(?:oui|oui merci|exactement|c est bien mon cas)$/.test(text))next.cniFirstScope='standard';
  }
 }
 const referential=next.documentary.procedureId==='cni'&&safeReference&&((next.documentary.application==='renewal'&&(id==='cni'||/\b(?:elle|cette carte|ma carte|expir\w*|perdu\w*|deterior\w*|oui|delais?|frais|tarifs?|pieces?|documents?|merci|biometri\w*|ancien modele|continuer?|suite|suivant)\b/.test(text)))||(next.documentary.application==='first'&&(id==='cni'||next.cniFirstScope||/\b(?:adulte|mineur|continuer?|oui|delais?|frais|pieces?|documents?)\b/.test(text))));
 let prepared=prepareDocumentaryMessage(message,next.documentary);
 if(referential){
  const positive=new Set(),negative=new Set();
  for(const [reason,pattern] of Object.entries({expired:/\bexpir\w*\b/g,lost:/\b(?:perdu\w*|perte)\b/g,damaged:/\b(?:deterior\w*|abim\w*)\b/g}))for(const match of text.matchAll(pattern)){
   const before=text.slice(0,match.index);(/\b(?:pas|non|jamais)(?: \w+){0,2} $/.test(before)?negative:positive).add(reason);
  }
  if(next.documentary.application==='renewal'){
   const before=next.reason;
   if(positive.size===1)next.reason=[...positive][0];else if(positive.size>1||negative.has(next.reason))delete next.reason;
   if(before!==next.reason){next.cniCursor=0;if(next.reason!=='lost')delete next.cniFormat;}
  }
  prepared='CNI '+(next.documentary.application==='first'?'première demande':'renouvellement')+' '+(next.documentary.profile||'')+(sectionFor(text)?' '+{timelines:'délais',fees:'frais',documents:'pièces'}[sectionFor(text)]:'');
 }
 return {message:prepared,original:message,state:next,resetLocalContext,section:sectionFor(text),referenceTopic:/\bparents?\b/.test(text)?'parent':/\bnationalite\b/.test(text)?'nationality':null,acknowledgment:/^(?:merci(?: beaucoup)?|c est clair|bien compris|ok merci|d accord merci|non merci)$/.test(text),yesOnly:/^(?:oui|oui merci|d accord|ok)$/.test(text),confirmed:/^(?:oui|d accord|ok)\b/.test(text),referential,inScope:protectedFlow||!outside};
}
// Preparation contract, not a provider call or permission to answer official facts.
export function buildCitizenModelContext(state={}){
 const safe=clean(state);if(safe.mission==='urgences')return null;
 return {version:1,country:'CI',...summary(safe),allowedTasks:['clarify','rephrase'],administrativeFactsAllowed:false,externalActionsAllowed:false};
}
export function finishCitizenTurn(answer,turn,{cniReference}={}){
 const rendered=renderDocumentaryDialogue(answer,turn.referential?turn.message:turn.original,turn.state.documentary);
 let state=clean({...turn.state,documentary:rendered.state}),view=rendered.answer;
 if(view.answerType==='official_information'&&!view.knowledge)state=clean(turn.state);
 if(view.answerType==='protected_protocol')state=clean({mission:'urgences'});
 if(view.answerType==='general'&&state.mission==='prevention'){
  const topic={online_safety:'en ligne',road_safety:'routière',home_safety:'à la maison'}[state.topic]||'citoyenne';
  view={...view,reply:`Je conserve votre sujet de prévention ${topic}${state.audience==='children'?' pour les enfants':''}. Quel point souhaitez-vous clarifier ?`};
 }else if(view.answerType==='general'&&state.mission==='alertes'){
  view={...view,reply:'Je peux vous accompagner pour comprendre une alerte, mais je ne dispose pas d’alertes vérifiées en temps réel et aucun signalement n’est transmis ici. Souhaitez-vous vérifier une information ou préparer une question ?'};
 }
 if(state.documentary.procedureId==='cni'&&state.documentary.application==='renewal'&&view.answerType==='official_information'&&(!view.knowledge||view.knowledge.status==='insufficient_scope')){
  const subject=state.reason?reasons[state.reason]:'renouvellement de CNI';let reply;
  if(turn.section){
   const item={timelines:'délai',fees:'tarif',documents:'liste de pièces'}[turn.section];
   reply=`Pour votre ${subject}, je n’ai pas de ${item} actuellement confirmé dans mes références. À confirmer auprès du service compétent. Nous pouvons garder ce point dans votre demande, sans transmettre de document personnel.`;state.awaiting='question';
  }else if(!state.reason){reply='Je garde votre demande de renouvellement de CNI. Mes références ne suffisent pas pour confirmer les pièces ou les frais. À confirmer auprès du service compétent. Votre carte est-elle expirée, perdue ou détériorée ?';state.awaiting='reason';}
  else if(turn.confirmed){reply=`Pour votre ${subject}, vous pouvez préparer cette question : « Quelle procédure de renouvellement et quelles pièces s’appliquent à ma situation ? » Je n’en ai pas de liste vérifiée. À confirmer auprès du service compétent ; ne transmettez ici aucun document personnel.`;state.awaiting='question';}
  else{reply=`Je conserve votre demande pour une ${subject}. Mes références ne permettent pas de confirmer la procédure applicable. À confirmer auprès du service compétent. Souhaitez-vous préparer la question à lui poser ?`;state.awaiting='verification';}
  view={...view,reply,displayedFactPaths:[]};
 }else if(state.documentary.procedureId&&view.answerType==='official_information'&&(!view.knowledge||view.knowledge.status==='insufficient_scope')){
  const subject=names[state.documentary.procedureId];state.awaiting='verification';
  view={...view,reply:`Je conserve votre demande concernant ${subject}. Mes références ne suffisent pas à confirmer les informations pour cette situation. À confirmer auprès du service compétent. Souhaitez-vous préparer la question à lui poser ?`,displayedFactPaths:[]};
 }
 if(view.answerType==='official_information'&&state.documentary.procedureId==='cni'&&(state.documentary.application==='first'||state.documentary.application==='renewal'&&(turn.section||turn.referenceTopic||state.cniSeen?.length||state.reason==='lost'||state.reason==='expired'))){
  const variant=state.documentary.application==='first'?'first':state.reason==='lost'?'loss':state.reason==='expired'?'expiration':'renewal';
  const grounded=cniReference?.reply({variant,section:turn.section||'documents',cursor:turn.section?0:state.cniCursor||0,cardFormat:state.cniFormat,firstScope:state.cniFirstScope,profile:state.documentary.profile,topic:turn.referenceTopic,seenFactIds:state.cniSeen||[],acknowledgment:turn.acknowledgment,yesOnly:turn.yesOnly,previousAwaiting:turn.state.awaiting});
  if(grounded){
   const {seenFactIds,...display}=grounded;
   state.cniSeen=seenFactIds;state.cniCursor=grounded.nextCursor;state.awaiting=grounded.awaiting||'question';
   view={...view,...display,reply:`Pour votre ${variant==='first'?'première demande de CNI':variant==='loss'?'CNI perdue':variant==='expiration'?'CNI expirée':'renouvellement de CNI'} — ${grounded.reply}`,knowledge:{...view.knowledge,procedureId:'cni',readOnly:true,generativeUse:false,confirmationRequired:true,facts:grounded.facts,cniReference:grounded.coverage}};
  }
 }
 return {answer:{...view,dialogue:summary(state)},state};
}
