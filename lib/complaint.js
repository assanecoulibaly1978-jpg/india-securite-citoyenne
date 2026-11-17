import {normalize,search,dateValue} from './directory.js';
import {calls} from './emergency.js';
const SAFETY=[{type:'message',label:'Je suis en sécurité',message:'Je suis en sécurité'},{type:'message',label:'Je suis en danger',message:'Je suis en danger'},{type:'message',label:'Je suis blessé(e)',message:'Je suis blessé(e)'}];
const CONFIRM=[{type:'message',label:'Oui, c’est correct',message:'Oui, c’est correct'},{type:'message',label:'Corriger le résumé',message:'Corriger le résumé'}];
const SKIP={type:'message',label:'Passer cette question',message:'Passer cette question'};
const questions={facts:'Que s’est-il passé, en quelques mots, sans nom ni coordonnées personnelles ?',when:'Quand les faits ont-ils eu lieu, approximativement ?',location:'Dans quelle commune ou quel quartier les faits ont-ils eu lieu (un repère suffit) ?',role:'Êtes-vous la victime ou un témoin ?',author:'Connaissez-vous la personne mise en cause (oui ou non, sans nom ni identité ni coordonnées) ?',evidence:'Avez-vous des éléments utiles (indiquez seulement les types : messages, reçus, photos ou témoins, sans les envoyer) ?',damage:'Y a-t-il eu des dégâts matériels ou des blessures (sans détail médical) ?'};
const flow=['facts','when','location','role','author','evidence','damage'];
const labels={facts:'Faits',when:'Date',location:'Lieu',role:'Rôle',author:'Auteur connu',evidence:'Types de preuves',damage:'Conséquences'};
const allowed=new Set(['safety','injuries',...flow,'confirm','correction']);
const safe=s=>typeof s==='string'?s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[courriel à communiquer aux autorités]').replace(/(?<!\d)(?:\+?225[ .-]*)?(?:\d[ .-]*){8,13}(?!\d)/g,'[numéro à communiquer aux autorités]').slice(0,400):'';
function context(state){const c=state?.complaint;if(!c||c.version!==1||!allowed.has(c.step))return null;return {version:1,step:c.step,sensitive:c.sensitive===true,...(c.editing===true?{editing:true}:{}),fields:Object.fromEntries(flow.filter(k=>typeof c.fields?.[k]==='string').map(k=>[k,safe(c.fields[k])]))};}
function answer(reply,ctx,actions=[],intent='plainte',extra={}){return {intent,reply,actions,state:ctx?{complaint:ctx}:{},results:[],warnings:[],...extra};}
function proceed(ctx){if(ctx.sensitive){ctx.step='location';return answer('Votre sécurité passe avant le récit. Vous n’avez pas à raconter des faits intimes ici. Vous pouvez contacter directement Police Secours 100 ou Gendarmerie 145.\n'+questions.location,ctx,[...calls('police','gendarmerie'),SKIP]);}ctx.step='facts';return answer('Merci. Vous pouvez expliquer les faits avec vos mots, sans détail intime ni information d’identité.\n'+questions.facts,ctx,[SKIP]);}
function initial(ctx){return answer('100 — Police Secours ; Gendarmerie : 145. Cet assistant automatique ne dépose pas de plainte et ne transmet pas ce récit aux autorités.\nÊtes-vous en sécurité en ce moment ?',ctx,[...calls('police','gendarmerie'),...SAFETY]);}
function urgentReply(ctx,services){const medical=services.includes('medical')||services.includes('fire');return answer(medical?'180 — Sapeurs-pompiers (ou 0101801328) ; SAMU : 185 ou 0749960324. Appelez sans attendre cette conversation. Si une personne vous menace encore : Police Secours 100 ou Gendarmerie 145. L’application n’alerte aucun service.':'100 — Police Secours (ou 0103799144) ; Gendarmerie : 145. Contactez directement le service sans attendre ce questionnaire. Mettez-vous à l’abri si vous pouvez le faire sans vous exposer. Aucun service n’est alerté par l’application.',{...ctx,step:'safety'},[...calls(...(medical?['fire','medical','police','gendarmerie']:['police','gendarmerie'])),...SAFETY],'emergency');}
function summary(ctx){return answer('Voici ce que j’ai compris, selon vos indications (ce n’est pas une plainte déposée) :\n'+flow.map(k=>labels[k]+' : '+(ctx.fields[k]||'non précisé')).join('\n')+'\nEst-ce correct ?', {...ctx,step:'confirm'},CONFIRM);}
function orient(ctx,data,clock,date){const location=ctx.fields.location||'';const normalized=normalize(location);const city=[...new Set(data.records.map(r=>r.city).filter(Boolean))].sort((a,b)=>b.length-a.length).find(c=>(' '+normalized+' ').includes(' '+normalize(c)+' '));const q=city||location;const queryDate=dateValue(date,clock);const found=normalize(q)&&normalize(q)!=='non precise'?['police','gendarmerie'].map(category=>search(data,{category,q,date:queryDate,limit:5},clock)):[];const results=found.flatMap(r=>r.results);const total=found.reduce((n,r)=>n+r.total,0);
 const text='100 — Police Secours (ou 0103799144) ; Gendarmerie : 145.\n'+(results.length?total+' fiche(s) publique(s) correspondent au lieu indiqué ; '+results.length+' affichée(s).':'Je n’ai pas de fiche locale correspondante dans les données disponibles. Cela ne signifie pas qu’aucun service n’existe.')+' Confirmez auprès de ces services lequel est compétent : proximité et absence de fiche ne déterminent pas la compétence territoriale.\n\nPour préparer votre prise de contact, si vous les avez déjà : pièce d’identité, résumé des faits, copies des éléments utiles et contacts des témoins à communiquer directement aux autorités. Si un document médical existe, demandez au service s’il est utile ; il n’est pas demandé dans ce chat. Ne retardez pas un signalement urgent ni des soins pour réunir des documents. Le service vous précisera les pièces nécessaires.\n\nAucune plainte n’a été déposée ou transmise par cette application. Aucun opérateur humain n’est connecté ici.\nAvez-vous besoin d’autre chose ?';
 return answer(text,null,calls('police','gendarmerie'),'plainte',{results,date:queryDate,warnings:[...new Set(found.flatMap(r=>r.warnings))]});}
export function complaintProtocol(body,data,clock,urgent){
 const text=normalize(body.message);let ctx=context(body.state); const sensitiveText=/\b(viol(?:s)?|violences? conjugales?|agression sexuelle|violences? sexuelles?|inceste|enfant en danger|mineur en danger)\b/.test(text);
 const explicit=/\bplainte\b/.test(text);if(!ctx&&!explicit&&!sensitiveText)return null;
 const historical=/\bhier\b|semaine derniere|autrefois|deja soigne|il y a \d/.test(text)&&!/maintenant|actuellement|encore/.test(text);
 const risk=text.replace(/\b(?:pas(?: de| ete)?|sans|aucun(?:e)?) blesse\w*\b|\bpersonne n est blesse\w*\b|\bpas en danger\b/g,'');
 const ongoing=body.message.split(/[,;.!?\n]+|\bmais\b/i).map(normalize).some(c=>{const current=c.replace(/\bpas (?:maintenant|actuellement)\b/g,'');return /\b(maintenant|actuellement|encore|en ce moment)\b/.test(current)&&/\b(agress\w*|menac\w*|frapp\w*|violence\w*|arme\w*|braqu\w*|attaque\w*)\b/.test(current);});
 const unsafe=ongoing||/\b(pas en securite|en danger|en cours|il est (?:encore )?la|elle est (?:encore )?la|pres de moi|a cote de moi|me frappe|me menace|m attaque|me poursuit)\b/.test(risk);
 const injury=!historical&&/\b(blesse\w*|saigne\w*|inconscient\w*|respire (?:pas|plus)|malaise|sang)\b/.test(risk);
 const specificUrgency=urgent&&urgent.length<4&&!historical&&(!ctx||ctx.step==='safety'||urgent.includes('fire')||urgent.includes('medical'));
 if(!ctx)ctx={version:1,step:'safety',sensitive:sensitiveText,fields:{}};
 if(sensitiveText)ctx.sensitive=true;
 if(ctx.sensitive){ctx.fields.facts='Situation sensible — détails à communiquer directement à un professionnel';delete ctx.fields.author;delete ctx.fields.evidence;delete ctx.fields.damage;delete ctx.fields.role;}
 if(injury||unsafe||specificUrgency)return urgentReply(ctx,injury||(urgent&&urgent.length<4&&(urgent.includes('medical')||urgent.includes('fire')))?['fire','medical']:['police','gendarmerie']);
 if(/^(stop|annuler|effacer|recommencer)$/.test(text))return answer('La préparation est effacée. Aucun récit n’a été transmis aux autorités. Police Secours : 100 ; Gendarmerie : 145.',null);
 if(/\b(humain|operateur|conseiller)\b/.test(text))return answer('Aucun opérateur humain n’est connecté à l’application. Aucun transfert n’a été effectué. Vous pouvez contacter directement Police Secours 100 ou Gendarmerie 145.',null,calls('police','gendarmerie'),'human');
 if(/^(?:je cherche|je veux|je souhaite|pharmacie de garde|nouvel accident|il y a un accident)/.test(text)&&/\b(pharmacie|accident|caserne|constat)\b/.test(text)&&!explicit)return null;
 if(ctx.step==='safety'){
  if(/^non$/.test(text))return urgentReply(ctx,['police','gendarmerie']);
  if(/^(oui|je suis en securite|en securite)\b/.test(text)){ctx.step='injuries';return answer('Êtes-vous blessé(e) ou avez-vous besoin de soins urgents maintenant ?',ctx,[{type:'message',label:'Non, pas de blessure',message:'Non, pas de blessure'},{type:'message',label:'Oui, j’ai besoin de secours',message:'Oui, j’ai besoin de secours'},SKIP]);}
  return initial(ctx);
 }
 if(ctx.step==='injuries'){
  if(/^non\b|pas (?:de )?blesse|sans blesse/.test(text))return proceed(ctx);
  if(/^oui\b|ne sais pas|incertain|besoin de secours|soins urgents/.test(text))return urgentReply(ctx,['fire','medical']);
  if(/^passer|je prefere ne pas/.test(text)){const r=proceed(ctx);r.reply='Si vous avez besoin de secours médicaux : 180 ou 185, sans attendre le récit.\n'+r.reply;r.actions=[...calls('fire','medical'),...r.actions];return r;}
  return answer('Avez-vous besoin de secours médicaux maintenant ?',ctx,[...calls('fire','medical'),SKIP]);
 }
 if(ctx.step==='confirm'){
  if(/^(oui|correct|c est correct|je confirme)\b/.test(text)&&!/\b(mais|sauf|corriger|non)\b/.test(text))return orient(ctx,data,clock,body.date);
  if(/^non\b|corrig|modifier/.test(text))return answer('Quel élément souhaitez-vous corriger ?', {...ctx,step:'correction'},(ctx.sensitive?['location','when']:flow).map(k=>({type:'message',label:labels[k],message:labels[k]})));
  return summary(ctx);
 }
 if(ctx.step==='correction'){const key=(ctx.sensitive?['location','when']:flow).find(k=>normalize(labels[k])===text);if(!key)return answer('Choisissez un élément du résumé à corriger.',ctx,(ctx.sensitive?['location','when']:flow).map(k=>({type:'message',label:labels[k],message:labels[k]})));ctx.step=key;ctx.editing=true;return answer(questions[key],ctx,[SKIP]);}
 if(ctx.sensitive&&!['location','when'].includes(ctx.step)){ctx.step='location';return answer('Vous n’avez pas à détailler les faits intimes ici.\n'+questions.location,ctx,[...calls('police','gendarmerie'),SKIP]);}
 const step=ctx.step;const skip=/^passer|^je prefere ne pas|^non precise/.test(text);ctx.fields[step]=skip?'non précisé':step==='author'?(/^oui\b/.test(text)?'Oui — identité à communiquer directement aux autorités':/^non\b/.test(text)?'Non':'À préciser directement aux autorités'):safe(body.message);
 if(ctx.editing){delete ctx.editing;return summary(ctx);}if(ctx.sensitive)return summary(ctx);
 const next=flow[flow.indexOf(step)+1];if(!next)return summary(ctx);ctx.step=next;return answer((step==='facts'?'Merci de me l’expliquer.\n':'')+questions[next],ctx,[SKIP]);
}
