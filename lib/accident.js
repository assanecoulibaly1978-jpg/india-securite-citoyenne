import {normalize,search,dateValue} from './directory.js';
import {calls} from './emergency.js';
const PREPARE={type:'message',label:'Préparer les informations, sans retarder l’appel',message:'Préparer les informations'};
const CHECKS=[{type:'message',label:'Oui, j’ai joint les secours',message:'Oui, j’ai joint les secours'},{type:'message',label:'Non, l’appel ne passe pas',message:'Non, l’appel ne passe pas'}];
const INJURY_CHOICES=[{type:'message',label:'Oui, des blessés',message:'Oui, il y a des blessés'},{type:'message',label:'Non, dégâts matériels seulement',message:'Non, personne n’est blessé'},{type:'message',label:'Je ne sais pas',message:'Je ne sais pas'}];
const WAIT='Mettez-vous à l’abri de la circulation et des fumées, sans vous exposer. Ne déplacez pas une personne blessée, sauf face à un danger imminent. Ne lui donnez rien à manger ou à boire. Restez joignable et suivez les instructions des secours.';
const questions={check:'Y a-t-il des blessés, une personne inconsciente, coincée ou qui saigne beaucoup ?',location:'Dans quelle commune, quel quartier et près de quel repère se trouve l’accident ?',description:'Que s’est-il passé (voiture, moto, piéton, véhicules impliqués) ?',victims:'Combien de personnes sont blessées et que pouvez-vous observer sans vous mettre en danger ?',hazards:'Y a-t-il du feu, de la fumée, une fuite de carburant ou un danger lié à la circulation ?'};
const steps=new Set(['check','prepare','location','description','victims','hazards','call_check']);
const fieldKeys=['location','description','victims','hazards'];
const safe=value=>typeof value==='string'?value.replace(/(?<!\d)(?:\+?225[ .-]*)?(?:\d[ .-]*){8,13}(?!\d)/g,'[numéro à communiquer directement aux secours]').slice(0,400):'';
function context(state){const s=state?.accident;if(!s||s.version!==1||!['injury','material','unknown'].includes(s.route)||!steps.has(s.step))return null;return {version:1,route:s.route,step:s.step,...(steps.has(s.resume)?{resume:s.resume}:{}),fields:Object.fromEntries(fieldKeys.filter(k=>typeof s.fields?.[k]==='string').map(k=>[k,safe(s.fields[k])]))};}
function answer(reply,ctx,actions=[],intent,extra={}){return {intent:intent||(ctx?.route==='material'?'constat':'accident'),reply,actions,state:ctx?{accident:ctx}:{},results:[],warnings:[],...extra};}
function start(ctx,medical=false){return answer('180 — Appelez tout de suite les sapeurs-pompiers (ou 0101801328). Confirmez l’ouverture du téléphone avec le bouton d’appel. Ne retardez pas l’appel pour répondre ici. Cet assistant automatique n’alerte aucun service.',{...ctx,route:'injury',step:'prepare'},[...calls('fire',...(medical?['medical']:[])),PREPARE],'emergency');}
function failed(ctx){return answer('180 (ou 0101801328) — Réessayez les sapeurs-pompiers. Si l’appel ne passe pas, essayez le SAMU : 185 ou 0749960324. Aucun opérateur humain n’est connecté à cette application : aucun transfert n’a été effectué. Restez à l’abri ; l’application ne déclenche aucune intervention.',ctx,[...calls('fire','medical'),...CHECKS],'emergency');}
function summary(ctx){if(ctx.route==='material')return answer('100 — Police Secours (ou 0103799144), pour demander une orientation vers le service de constat. Gendarmerie : 145, si le lieu relève de sa compétence. La proximité d’une fiche ne détermine pas la compétence territoriale.\nLieu : '+(ctx.fields.location||'non renseigné')+'\nAccident : '+(ctx.fields.description||'non renseigné')+'\nRestez à l’abri de la circulation et suivez les indications du service pour les véhicules et le constat. Aucune plainte ni demande de constat n’a été transmise.\n\nAvez-vous pu joindre les secours ?', {...ctx,step:'call_check'},[...calls('police','gendarmerie'),...CHECKS]);
 return answer('180 (ou 0101801328) — Voici un résumé à lire aux pompiers, selon vos indications :\nLieu : '+(ctx.fields.location||'non renseigné')+'\nAccident : '+(ctx.fields.description||'non renseigné')+'\nBlessés et observations : '+(ctx.fields.victims||'état non confirmé')+'\nDanger sur place : '+(ctx.fields.hazards||'non renseigné')+'\nNuméro de rappel : communiquez-le directement aux secours, pas dans ce chat.\n\n'+WAIT+'\nSi vous le souhaitez, prévenez vous-même un proche ; son nom et son numéro ne sont pas nécessaires ici.\n\nAvez-vous pu joindre les secours ?', {...ctx,step:'call_check'},[...calls('fire'),...CHECKS]);}
function beginMaterial(body,data,clock){const text=normalize(body.message);const ctx={version:1,route:'material',step:'location',fields:{}};const city=[...new Set(data.records.map(r=>r.city).filter(Boolean))].sort((a,b)=>b.length-a.length).find(c=>(' '+text+' ').includes(' '+normalize(c)+' '));let found=null;
 if(city){ctx.fields.location=city;ctx.step='description';found=search(data,{category:'police',q:city,date:dateValue(body.date,clock)},clock);}
 return answer('Pour un accident matériel sans blessé, les contacts restent disponibles : Police Secours 100 (ou 0103799144), Gendarmerie 145 selon la compétence territoriale.\n'+questions[ctx.step],ctx,[],'constat',found?{results:found.results,warnings:found.warnings,date:found.date}:{});}
export function accidentProtocol(body,data,clock,urgent){
 const text=normalize(body.message);let ctx=context(body.state);const isAccident=/\baccident\b/.test(text);const material=/sans blesse|pas de blesse|aucun blesse|personne n est blesse|materiel/.test(text);
 const riskText=text.replace(/\b(?:pas de|aucun(?:e)?|sans|ni(?: de)?) (?:feu|fumee|fuite|sang|incendie)\b/g,'');
 const positiveInjury=/\bblesse\w*\b/.test(text.replace(/\b(?:sans|pas de|aucun(?:e)?) blesse\w*\b|\bpersonne n est blesse\w*\b/g,''));
 const critical=(positiveInjury&&ctx?.route!=='injury')||/\b(inconscient\w*|coince\w*|respire (?:pas|plus)|saigne\w*|sang|hemorragie|incendie|feu|fumee|fuite)\b/.test(riskText);
 const medical=/\b(inconscient\w*|respire (?:pas|plus)|saigne\w*|sang|hemorragie)\b/.test(riskText);
 const fail=/\b(?:passe pas|repond pas|injoignable|pas de reponse|echec)\b/.test(text)&&(/\b180\b|\bappel\b|\bligne\b/.test(text)||ctx?.step==='call_check');
 if(fail&&!critical)return ctx?.route==='material'&&!/\b180\b/.test(text)?answer('100 — Police Secours (ou 0103799144) ; Gendarmerie 145. Aucun opérateur humain n’est connecté ici et aucun transfert n’a été effectué.',ctx,[...calls('police','gendarmerie'),...CHECKS]):failed(ctx||{version:1,route:'injury',step:'call_check',fields:{}});
 if(!ctx){
  if(!isAccident)return null;
  const fresh={version:1,route:'unknown',step:'check',fields:{}};
  if(critical)return start(fresh,medical);
  if(material)return beginMaterial(body,data,clock);
  if(/\bblesse\w*\b|ne sais pas|incertain|ignore/.test(text))return start(fresh,medical);
  return answer('180 — Si l’état des personnes est incertain, appelez les sapeurs-pompiers (ou 0101801328), sans attendre cette conversation.\n'+questions.check,fresh,[...calls('fire'),...INJURY_CHOICES],'emergency');
 }
 if(/^(annuler|stop|recommencer|effacer)$/.test(text))return answer('Préparation effacée. Les numéros restent disponibles : 180 pompiers, 185 SAMU, 100 Police Secours, 145 Gendarmerie.',null);
 if(urgent&&/\b(agression|violence\w*|cambriolage|menace\w*|braquage|attaque)\b/.test(text))return null;
 if(critical){const key=ctx.step==='victims'?'victims':ctx.step==='hazards'?'hazards':null;if(key)ctx.fields[key]=safe(body.message);return start({...ctx,resume:key==='victims'?'hazards':key==='hazards'?'call_check':ctx.step==='check'?'location':ctx.step},medical);}
 if(!urgent&&(/\b(humain|operateur)\b/.test(text)||(/^(?:je (?:cherche|veux|souhaite)|pharmacie de garde|porter plainte|trouver une?)/.test(text)&&/\b(pharmacie|plainte|gendarmerie|commissariat)\b/.test(text))))return null;
 if(ctx.step==='check'){
  if(/^non\b|sans blesse|pas de blesse|aucun blesse|personne n est blesse/.test(text))return beginMaterial(body,data,clock);
  if(/^oui\b|blesse|ne sais pas|ignore|incertain/.test(text))return start(ctx);
  return answer('180 — Si vous ne pouvez pas confirmer l’absence de blessés, appelez les pompiers (ou 0101801328).\n'+questions.check,ctx,[...calls('fire'),...INJURY_CHOICES],'emergency');
 }
 if(ctx.step==='call_check'){
  if(/^(oui|j ai joint|secours joints)\b/.test(text))return answer('Suivez les instructions du service que vous avez joint et restez joignable. L’application n’a déclenché aucune intervention.',null);
  if(/\b(non|echec|passe pas|repond pas|impossible|injoignable)\b/.test(text))return ctx.route==='material'?answer('100 — Police Secours (ou 0103799144) ; Gendarmerie 145. Aucun opérateur humain n’est connecté ici et aucun transfert n’a été effectué.',ctx,[...calls('police','gendarmerie'),...CHECKS]):failed(ctx);
  return answer('Avez-vous pu joindre les secours ?',ctx,[...calls(ctx.route==='material'?'police':'fire'),...CHECKS]);
 }
 if(ctx.step==='prepare'){ctx.step=ctx.resume||'location';delete ctx.resume;if(ctx.step==='call_check')return summary(ctx);if(/preparer|continuer|d accord|^ok$/.test(text))return answer(questions[ctx.step],ctx);}
 const step=ctx.step;ctx.fields[step]=safe(body.message);
 const next={location:'description',description:ctx.route==='material'?'call_check':'victims',victims:'hazards',hazards:'call_check'}[step];
 if(next==='call_check')return summary(ctx);ctx.step=next;return answer(questions[next],ctx);
}
