// CNI-only, pinned public references. No network, provider, citizen data or payment.
import {readFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const hash='9b25bf954e20f260ae59a1cce2ad24efea656297bcf0cd0fc478f75193482064';
export const CNI_FACT_IDS=Object.freeze(['first-birth','first-nationality','first-parent-dispute','renew-title','renew-birth','renew-nationality-dispute','loss-declaration','loss-identity','loss-birth','receipt']);
const questions={
 'first-nationality':'Le prochain point porte sur la nationalité. Voulez-vous le consulter ?',
 'first-parent-dispute':'La CNI parentale fait l’objet de formulations différentes dans les publications. Voulez-vous préciser ce point ?',
 'renew-birth':'Le point suivant concerne le justificatif de naissance. Souhaitez-vous le voir ?',
 'renew-nationality-dispute':'Une divergence concerne aussi la nationalité au renouvellement. Voulez-vous que je la précise ?',
 'loss-identity':'Voulez-vous voir les alternatives publiées pour le justificatif d’identité, sans communiquer votre numéro ?',
 'loss-birth':'Le point suivant concerne la naissance. Voulez-vous le consulter ?',
 receipt:'Il reste un point publié sur le justificatif d’enrôlement. Voulez-vous l’examiner ?'
};
export function createCniReference({dir}={}){
 function load(){
  try{
   if(typeof dir!=='string')return null;
   const file=path.join(dir,'cni-reference.json'),st=lstatSync(file);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||st.size>64000)return null;
   const bytes=readFileSync(file);if(createHash('sha256').update(bytes).digest('hex')!==hash)return null;
   return JSON.parse(bytes);
  }catch{return null;}
 }
 return Object.freeze({reply({variant,section='documents',cursor=0,cardFormat,firstScope,profile,topic,seenFactIds,acknowledgment=false,yesOnly=false,previousAwaiting}={}){
  const reference=load();if(!reference||!['first','renewal','expiration','loss'].includes(variant))return null;
  const limitedLoss=variant==='loss'&&cardFormat!=='biometric';
  const unsupported=['minor','diaspora'].includes(profile)||firstScope==='other',limitedFirst=variant==='first'&&(profile!=='adult'||firstScope!=='standard');
  const selectedId=topic==='parent'&&variant==='first'?'first-parent-dispute':topic==='nationality'?(variant==='first'?'first-nationality':'renew-nationality-dispute'):null;
  const facts=reference.facts.filter(f=>!unsupported&&!limitedLoss&&!limitedFirst&&f.variants.includes(variant)&&f.section===section&&(!selectedId||f.id===selectedId));
  const seen=new Set(Array.isArray(seenFactIds)?seenFactIds.filter(id=>CNI_FACT_IDS.includes(id)):[]);
  const index=selectedId?0:Number.isInteger(cursor)&&cursor>=0?cursor:0;
  const clarify=yesOnly&&['cni_clarify','cni_finished'].includes(previousAwaiting);
  const selected=acknowledgment||clarify?undefined:Array.isArray(seenFactIds)?facts.find(f=>!seen.has(f.id)):facts[index];
  const alreadySeen=Boolean(selectedId&&facts.length&&!selected);
  const sources=selected?selected.source_ids.map(id=>reference.sources.find(s=>s.id===id)):reference.sources;
  const fact=selected?{...selected,path:'/facts/'+reference.facts.indexOf(selected),referenceFile:'cni-reference.json',sourceStatus:selected.status,sources,verified_on:reference.checked_on,confirmationRequired:true,obligationStatus:'not_certified'}:null;
  const available=reference.facts.filter(f=>f.variants.includes(variant)&&f.section===section);
  if(selected)seen.add(selected.id);
  const next=selected?(Array.isArray(seenFactIds)?available.find(f=>!seen.has(f.id)):available[available.findIndex(f=>f.id===selected.id)+1]):null;
  const transition=next?(questions[next.id]||'Quel point documenté souhaitez-vous éclaircir ?'):'Nous avons parcouru les points disponibles dans cette sélection, pas un dossier complet garanti. Quelle question reste à préparer pour l’ONECI ?';
  const missing=alreadySeen?'Nous avons déjà vu ce point ; ses sources et réserves restent consultables dans nos messages précédents. Quelle précision souhaitez-vous apporter ?':section==='fees'?'À confirmer — aucun tarif actuel ni coût total n’est confirmé pour votre cas dans cette sélection. Quel point souhaitez-vous faire confirmer à l’ONECI ?':section==='timelines'?'À confirmer — aucun délai actuel n’est confirmé pour votre cas dans cette sélection ; je ne peux pas promettre une date. Quelle question souhaitez-vous préparer sur ce délai ?':'À confirmer — pas d’autre pièce établie dans cette sélection partielle. Ce n’est pas une liste complète. Quelle question précise souhaitez-vous poser sur cette démarche ?';
  const reply=acknowledgment?'Je vous en prie. Je garde votre démarche et les points déjà vus. Vous pouvez poser votre question ou demander « la suite » pour reprendre.':unsupported||limitedFirst&&firstScope==='other'?'À confirmer — cette sélection ne couvre pas suffisamment votre situation particulière. Je ne peux pas vous appliquer le dossier du cas principal.':limitedFirst?(profile!=='adult'?'À confirmer — cette première demande concerne-t-elle un adulte ou un mineur ?':'À confirmer — le cas documenté ici est celui d’un adulte ivoirien d’origine né en Côte d’Ivoire. Est-ce bien votre situation, sans préciser de lieu ni date de naissance ?'):limitedLoss?(cardFormat==='older'?'À confirmer — je ne peux pas transposer le dossier du duplicata biométrique à cet ancien modèle. Son traitement reste à vérifier auprès de l’ONECI.':'À confirmer — les références de duplicata concernent une CNI biométrique. Votre carte perdue était-elle biométrique ou d’un ancien modèle ? Ne transmettez ici ni numéro ni document personnel.'):clarify?'Je garde votre démarche. Quelle question précise souhaitez-vous éclaircir ?':fact?`À confirmer — ${fact.text}\nPortée : ${fact.scope}\nLimite : ${fact.limits}\nPublication ONECI consultée le ${reference.checked_on} ; date de mise à jour inconnue. Il ne s’agit pas d’un dossier complet. ${transition}`:missing;
  const documentaryDetails=[reply,'Références publiques comparées ; consultation distincte d’une certification actuelle au guichet.',...sources.map(s=>`[${s.id}] ${s.title} — ${s.url} — consulté le ${s.consulted_on} ; publication/mise à jour non établie.`)].join('\n');
  const awaiting=acknowledgment&&previousAwaiting?previousAwaiting:unsupported?'verification':limitedFirst?(profile!=='adult'?'first_profile':'first_scope'):limitedLoss?'card_format':clarify||alreadySeen||['fees','timelines'].includes(section)?'cni_clarify':next?'cni_next':'cni_finished';
  return {reply,documentaryDetails,sources,facts:fact?[fact]:[],displayedFactPaths:fact?[fact.path]:[],seenFactIds:CNI_FACT_IDS.filter(id=>seen.has(id)),nextCursor:selectedId?cursor:index+(fact?1:0),awaiting,coverage:{variant,referenceFile:'cni-reference.json',referenceSha256:hash,checked_on:reference.checked_on,completeChecklist:false,feesConfirmed:false,timelinesConfirmed:false}};
 }});
}
