// Experimental local accident flow. Used only by the isolated development copy.
import {normalize} from './directory.js';
import {calls} from './emergency.js';
const keys=['location','description','victims','hazards'];
const questions={check:'Y a-t-il des blessés, à votre connaissance ?',location:'Où se trouve l’accident ? Une commune, une voie ou un repère suffit.',description:'Que s’est-il passé : quels véhicules ou usagers sont impliqués ?',victims:'Combien de personnes semblent blessées, approximativement ?',hazards:'Quel danger persiste autour de l’accident, sans vous en approcher ?',rescue:'Les secours sont-ils déjà appelés ou présents sur place ?',traffic:'Quelle voie ou quel sens de circulation est surtout touché ?',sector:'Quel est le secteur exact ou le repère de la route bloquée ?'};
const numbers={un:1,une:1,deux:2,trois:3,quatre:4,cinq:5,six:6,sept:7,huit:8,neuf:9,dix:10};
const safe=(value,limit=280)=>typeof value==='string'?value.replace(/<[^>]*>/g,'').replace(/[\u0000-\u001f]/g,' ').replace(/(?<!\d)(?:\+?225[ .-]*)?(?:\d[ .-]*){8,15}(?!\d)/g,'[numéro à donner directement aux secours]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[courriel omis]').trim().slice(0,limit):'';
const noInjury=/\b(?:sans|pas de|aucun(?:e)?|zero|0) blesse\w*\b|\bpersonne n est blesse\w*\b/g;
const past=/\b(?:hier|avant hier|la semaine derniere|autrefois|il y avait|il y a \d+ jours)\b/;
const clinicalLabels={unconscious:'Inconscience signalée — non évaluée',breathing:'Difficulté ou absence de respiration signalée — non évaluée',bleeding:'Saignement important signalé — non évalué',chest_pain:'Douleur thoracique signalée — non évaluée'};
const riskWords={fire:'(?:feu|incendie|flamme\\w*)',smoke:'fumee\\w*',fuel:'(?:fuite(?: de carburant)?|carburant|essence)',traffic:'(?:circulation dangereuse|risque de collision)',general:'danger immediat'};
const riskLabels={fire:['Feu signalé','Pas de feu signalé'],smoke:['Fumée signalée','Pas de fumée signalée'],fuel:['Fuite de carburant signalée','Pas de fuite de carburant signalée'],traffic:['Circulation dangereuse signalée','Pas de circulation dangereuse signalée'],general:['Danger immédiat signalé','Aucun danger observé selon votre déclaration']};
const possibleLabels={fire:'Feu possible — non constaté',smoke:'Fumée possible — non constatée',fuel:'Fuite de carburant possible — non constatée',traffic:'Collision possible — non constatée',general:'Danger possible — non constaté'};
function hazardFacts(message){
 const facts={},parts=String(message).split(/[.;!?\n]|\b(?:mais|cependant)\b/iu).map(normalize);
 for(const part of parts){
  if(/\b(?:aucun danger|pas de danger|tout danger est ecarte)\b/.test(part))for(const k of Object.keys(riskWords))facts[k]='absent';
  for(const [key,word] of Object.entries(riskWords))for(const m of part.matchAll(new RegExp('\\b'+word+'\\b','g'))){
   const prefix=part.slice(0,m.index).trim(),suffix=part.slice(m.index+m[0].length).trim();
   const absent=/\b(?:pas de|sans|aucun\w*|ni(?: de)?|n y a plus de)$/.test(prefix)||/^(?:(?:est|a ete|a) )?(?:deja )?(?:colmate\w*|eteint\w*|disparu\w*|cesse\w*|ecarte\w*)\b/.test(suffix);
   const possible=/\b(?:risque de|risque d|peut etre(?: un| une| du| de la)?|possible|pourrait provoquer(?: un| une)?)$/.test(prefix)||/^(?:est )?(?:possible|potentiel\w*|pourrait)\b/.test(suffix)||/\brisque\b/.test(m[0]);
   facts[key]=absent?'absent':possible?'possible':'present';
  }
 }
 return facts;
}
function hazardText(facts){return Object.keys(riskWords).filter(k=>facts[k]).map(k=>facts[k]==='possible'?possibleLabels[k]:riskLabels[k][facts[k]==='absent'?1:0]).join(' ; ');}
function medicalSigns(text){
 const negativePatterns={unconscious:/\b(?:personne n est|n est pas|n est plus|pas|aucun\w*) inconscient\w*\b/g,breathing:/\b(?:pas de|aucune) difficulte\w* (?:a respirer|respiratoire\w*)\b|\brespire normalement\b|\ba repris sa respiration\b/g,bleeding:/\bpersonne ne saigne beaucoup\b|\bne saigne (?:pas|plus)(?: beaucoup)?\b|\b(?:pas d|aucune) hemorragie\b/g,chest_pain:/\b(?:pas de|aucune) douleur thoracique\b/g};
 const negative=Object.keys(negativePatterns).filter(k=>new RegExp(negativePatterns[k].source).test(text));
 let positiveText=text;for(const p of Object.values(negativePatterns))positiveText=positiveText.replace(p,'');
 const positivePatterns={unconscious:/\binconscient\w*\b/,breathing:/\b(?:ne respire (?:pas|plus)|n arrive (?:pas|plus) a respirer|(?:a du mal|difficulte\w*) a respirer|difficulte\w* respiratoire\w*)\b/,bleeding:/\b(?:saigne beaucoup|saignement abondant|hemorragie)\b/,chest_pain:/\bdouleur thoracique\b/};
 return {positive:Object.keys(positivePatterns).filter(k=>positivePatterns[k].test(positiveText)),negative};
}
function injuries(text){return /\b(?:blesse\w*|victimes?)\b/.test(text.replace(noInjury,''))||medicalSigns(text).positive.length>0;}
function danger(text){return Object.values(hazardFacts(text)).some(v=>['present','possible'].includes(v))||medicalSigns(text).positive.length>0;}
function roadEvent(text){return /\b(?:accident|collision)\b/.test(text)||/\b(?:renvers\w*|percut\w*|heurt\w*)\b/.test(text)&&/\b(?:camions?|voitures?|motos?|motocyclistes?|cyclistes?|pietons?|velos?|bus|taxis?)\b/.test(text)&&! /^(?:comment|explique|pourquoi|que faire)\b/.test(text);}
function evacuationReport(raw){
 const parts=(raw.match(/[^.;!?\n]+[.;!?\n]?/gu)||[]).flatMap(p=>p.split(/\bmais\b/iu)),complete=/\b(?:(?:ont|a) (?:deja )?evacue(?:s|e|es)?|(?:a|ont) (?:deja )?ete evacue(?:s|e|es)?)\b/;
 const index=parts.findLastIndex(p=>!p.includes('?')&&!/\b(?:si|peut etre|pas vrai|est ce que)\b/.test(normalize(p))&&complete.test(normalize(p)));
 if(index<0)return {reported:false,count:null,byFire:false,afterInjury:false};
 const text=normalize(parts[index]),m=/\bevacue(?:s|e|es)? (?:les? )?(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:blesse\w*|personnes?|victimes?)\b/.exec(text);
 const count=m?Number(numbers[m[1]]??m[1]):/\bevacue(?:s|e|es)? (?:le blesse|la blessee|une? (?:blesse\w*|personne|victime))\b/.test(text)?1:null;
 const totals=[...new Set(parts.slice(0,index).flatMap(p=>[...normalize(p).matchAll(/\b(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix) (?:personnes? )?blesse\w*\b/g)].map(x=>Number(numbers[x[1]]??x[1]))))];
 const presentNow=parts.slice(index).some(p=>!p.includes('?')&&!/\b(?:si|peut etre|pas vrai|est ce que)\b/.test(normalize(p))&&/\b(?:pompiers|secours) (?:sont (?:(?:toujours|encore|maintenant|actuellement|deja) )?|restent )sur place\b/.test(normalize(p)));
 return {reported:true,count,reportedTotal:totals.length===1?totals[0]:null,presentNow,all:/\btous les (?:blesse\w*|victimes?|personnes?)\b/.test(text),byFire:/\bpompiers (?:sont (?:deja )?arrives et )?ont (?:deja )?evacue\b|\bevacu\w*.*\bpar les pompiers\b/.test(text),afterInjury:parts.slice(index+1).some(p=>injuries(normalize(p)))};
}
function careHandled(ctx){return ctx.careStatus==='evacuated'&&!Object.values(ctx.hazardFacts||{}).some(v=>['present','possible'].includes(v));}
function signals(raw){
 const text=normalize(raw),parts=raw.split(/[.;!?,\n]|\b(?:mais|cependant|en revanche)\b|(?=\b(?:maintenant|actuellement)\b)/iu).map(normalize),historical=past.test(text),endPattern=/\b(?:tout est termine|accident (?:est )?termine|intervention (?:est )?terminee|tout est fini)\b/;
 const closingClauses=(raw.match(/[^.;!?\n]+[.;!?\n]?/gu)||[]).filter(p=>!p.includes('?')&&!/\b(?:si|est ce que|peut etre|serait|je ne sais pas)\b/.test(normalize(p))&&endPattern.test(normalize(p))).map(normalize),ended=closingClauses.length>0;
 const closes=p=>Boolean(p)&&endPattern.test(p)&&closingClauses.some(c=>c.includes(p));
 let pastScope=false;const lastClosure=parts.findLastIndex(closes);
 const present=parts.map(p=>{if(past.test(p)||closes(p))pastScope=true;if(/\b(?:maintenant|actuellement|encore|en cours|nouveau\w*|vient de|je vois|il y a|attend\w*)\b/.test(p))pastScope=false;return !pastScope;});
 const current=parts.some((p,i)=>i>lastClosure&&present[i]&&(injuries(p)||danger(p)));
 const onsite=/\b(?:secours|pompiers|samu|ambulance)\s+(?:(?:sont|est)\s+)?(?:(?:deja|maintenant|actuellement|enfin)\s+){0,2}sur place\b|\b(?:secours|pompiers) sont (?:(?:deja|maintenant|actuellement) )?arrives\b/.test(text);
 const called=/\b(?:j ai|nous avons|on a) (?:appele|joint|contacte) (?:les? |la )?(?:pompiers|secours|180|samu)\b|\b(?:secours|pompiers) (?:ont (?:deja )?ete|sont) (?:deja )?(?:appele\w*|prevenu\w*)\b/.test(text);
 const traffic=/\b(?:embouteillage|bouchon|ralentissement|circulation perturbee|(?:perturbation|probleme) de (?:la )?circulation)\b/.test(text)&&!injuries(text)&&!danger(text)&&(new RegExp(noInjury.source).test(text)||ended);
 let situation=(historical||ended)&&!current?(traffic?'traffic':'finished'):onsite?'onsite':called?'called':traffic?'traffic':null;
 return {text,situation,current,ended,evacuation:evacuationReport(raw),trafficBlocked:/\b(?:route|chaussee|voie|circulation) (?:est )?(?:(?:completement|totalement|encore|toujours) )?(?:bloquee|coupee|impraticable)\b/.test(text),trafficMention:/\b(?:embouteillage|bouchon|ralentissement|circulation perturbee|(?:perturbation|probleme) de (?:la )?circulation)\b/.test(text),trafficCleared:/\b(?:circulation (?:est )?(?:retablie|fluide)|(?:route|voie) (?:est )?(?:debloquee|degagee|ouverte)|embouteillage (?:est )?(?:resorbe|termine)|plus de bouchon)\b/.test(text),danger:danger(text)&&(!historical||current),injuries:injuries(text),clinical:medicalSigns(text)};
}
function context(state){
 const s=state?.accident;if(s?.version!==2||!['ongoing','called','onsite','finished','traffic'].includes(s.situation))return null;
 const hazards=s.hazardFacts&&typeof s.hazardFacts==='object'?Object.fromEntries(Object.keys(riskWords).filter(k=>['present','absent','possible'].includes(s.hazardFacts[k])).map(k=>[k,s.hazardFacts[k]])):hazardFacts(s.fields?.hazards||'');
 return {version:2,situation:s.situation,route:['material','unknown'].includes(s.route)?s.route:'injury',step:Object.hasOwn(questions,s.step)?s.step:'call_check',incidentStatus:['ongoing','finished'].includes(s.incidentStatus)?s.incidentStatus:['finished','traffic'].includes(s.situation)?'finished':'ongoing',rescueStatus:['called','onsite','not_reported'].includes(s.rescueStatus)?s.rescueStatus:['called','onsite'].includes(s.situation)?s.situation:'not_reported',trafficStatus:['not_reported','congested','blocked','cleared'].includes(s.trafficStatus)?s.trafficStatus:s.situation==='traffic'?'congested':'not_reported',previousRescueStatus:['called','onsite'].includes(s.previousRescueStatus)?s.previousRescueStatus:'not_reported',careStatus:['evacuated','partial'].includes(s.careStatus)?s.careStatus:'not_reported',evacuatedCount:Number.isSafeInteger(s.evacuatedCount)&&s.evacuatedCount>0&&s.evacuatedCount<=999?s.evacuatedCount:null,evacuationService:s.evacuationService==='fire'?'fire':'not_reported',sectorAsked:s.sectorAsked===true,sectorKnown:s.sectorKnown===true,triageAsked:s.triageAsked===true,rescueAsked:s.rescueAsked===true,trafficAsked:s.trafficAsked===true,trafficDetail:safe(s.trafficDetail),hazardFacts:hazards,criticalSigns:Array.isArray(s.criticalSigns)?[...new Set(s.criticalSigns.filter(k=>Object.hasOwn(clinicalLabels,k)))].slice(0,4):[],fields:Object.fromEntries(keys.filter(k=>typeof s.fields?.[k]==='string').map(k=>[k,safe(s.fields[k])]))};
}
function updateEvolution(ctx,d){
 const closed=ctx.incidentStatus==='finished';
 if((closed||d.ended)&&d.current){ctx.incidentStatus='ongoing';ctx.previousRescueStatus=ctx.rescueStatus;ctx.rescueStatus='not_reported';}
 if(['finished','traffic'].includes(d.situation))ctx.incidentStatus='finished';
 if(['onsite','called'].includes(d.situation))ctx.rescueStatus=d.situation;
 if(d.trafficMention)ctx.trafficStatus='congested';
 if(d.trafficBlocked)ctx.trafficStatus='blocked';
 if(d.trafficCleared)ctx.trafficStatus='cleared';
 ctx.situation=ctx.incidentStatus==='finished'?(['congested','blocked'].includes(ctx.trafficStatus)?'traffic':'finished'):['onsite','called'].includes(ctx.rescueStatus)?ctx.rescueStatus:'ongoing';
}
function extract(message,data={},step){
 const raw=safe(message,2000),text=normalize(raw),parts=raw.split(/[,;.!?\n]+/).map(x=>x.trim()).filter(Boolean),fields={};
 const place=parts.find(p=>/(?:^|\s)(?:à|au|sur|dans|devant)\s+/iu.test(p));
 if(place){const match=/(?:^|\s)(?:à|au|sur|dans|devant)\s+(.+)/iu.exec(place);if(match&&!/^(?:respirer|l abri|place|l arret|la maison|le point|la route|la chaussee|la tete|la poitrine)\b/.test(normalize(match[1])))fields.location=safe(match[1].split(/\s+(?:avec|dont)\s+/iu)[0]);const at=parts.indexOf(place);if(fields.location&&parts[at+1]&&/^(?:(?:au|le|du)\s+)?carrefour\b|^près\b|^pres\b|^rond[- ]point\b/iu.test(parts[at+1]))fields.location=safe(fields.location+', '+parts[at+1]);}
 if(!fields.location){
  const cities=[...new Set((data.records||[]).filter(r=>typeof r.city==='string').map(r=>normalize(r.city)))].filter(Boolean);
  for(const m of raw.matchAll(/(?=(?:^|\s)a\s+([^,;.!?]+))/giu)){
   const candidate=m[1].split(/\s+(?:avec|dont)\s+/iu)[0],n=normalize(candidate);
   if(cities.some(city=>n===city||n.startsWith(city+' ')))fields.location=safe(candidate);
  }
 }
 if(!fields.location&&!/\b(?:pas|non)\b/.test(text)){
  const landmark=/(?:^|\s)((?:carrefour|rond[- ]point)\s+[^,;.!?]+)/iu.exec(raw);if(landmark)fields.location=step==='location'&&!/\b(?:accident|blesse\w*|carburant|secours|pompiers)\b/.test(text)?safe(raw):safe(landmark[1]);
 }
 const description=parts.find(p=>/\b(?:accident|collision|heurt\w*|percut\w*|renvers\w*)\b/.test(normalize(p))&&/\b(?:voitures?|motos?|motocyclistes?|camions?|bus|taxi|pieton\w*|velo\w*)\b/.test(normalize(p)));
 if(description)fields.description=safe(description.replace(/^.*?(?=accident|collision)/iu,'').split(/\s(?:à|au|sur|dans)\s/iu)[0]);
 const counts=[...text.matchAll(/\b(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s+(?:personnes?\s+)?(?:blesse\w*|victimes?)\b/g)].filter(m=>! /\b(?:pas|non|au lieu de|plutot que)(?: de| des)?$/.test(text.slice(0,m.index).trim()));
 const count=counts[0];
 if(counts.length>1)fields.victims='inconnu — plusieurs nombres rapportés, total à préciser';
 else if(count)fields.victims=String(numbers[count[1]]??count[1])+' blessé(s) environ, selon vos indications';
 else if(/\bplusieurs blesse\w*\b/.test(text))fields.victims='Plusieurs blessés ; nombre non précisé';
 if(new RegExp(noInjury.source).test(text)&&!injuries(text))fields.victims='Aucun blessé selon votre déclaration — non vérifié';
 const hazards=parts.filter(p=>/\b(?:feu|fumee|fuite|carburant|danger|circulation dangereuse)\b/.test(normalize(p)));if(hazards.length)fields.hazards=safe(hazards.join(' ; '));
 return fields;
}
function render(ctx,message,{critical=false,failed=false,suppressQuestion=false}={}){
 const closed=ctx.incidentStatus==='finished',handled=careHandled(ctx);let missing;
 if(handled&&ctx.trafficStatus==='blocked'&&!ctx.sectorAsked&&!ctx.sectorKnown&&!/[,]|\b(?:carrefour|quartier|pres|rue|avenue|boulevard|pont|repere)\b/.test(normalize(ctx.fields.location||'')))missing='sector';
 else if(closed||handled)missing=['congested','blocked'].includes(ctx.trafficStatus)&&!ctx.trafficAsked&&!ctx.trafficDetail?'traffic':null;
 else if(ctx.rescueStatus==='onsite')missing=ctx.fields.location?null:'location';
 else if(ctx.route==='unknown'&&!ctx.fields.victims&&!ctx.triageAsked)missing='check';
 else if(ctx.route==='unknown'&&ctx.fields.location&&ctx.rescueStatus==='not_reported'&&!ctx.rescueAsked)missing='rescue';
 else missing=keys.find(k=>!(ctx.route==='unknown'&&k==='victims')&&(!ctx.fields[k]||k==='victims'&&ctx.fields[k].startsWith('inconnu — plusieurs')));
 ctx.step=missing||'call_check';
 const observations=(ctx.criticalSigns||[]).map(k=>clinicalLabels[k]),report={kind:'accident_witness',title:'Signalement préparé — non transmis',transmitted:false,source:'declarations_citoyen',situation:ctx.situation,incidentStatus:ctx.incidentStatus,rescueStatus:ctx.rescueStatus,careStatus:ctx.careStatus,evacuatedCount:ctx.evacuatedCount,sceneSafety:'not_confirmed',trafficStatus:ctx.trafficStatus,trafficDetail:ctx.trafficDetail,previousRescueStatus:ctx.previousRescueStatus,observations,fields:Object.fromEntries(keys.map(k=>[k,ctx.fields[k]||'inconnu — non renseigné']))};
 const reportedHazards=Object.keys(riskWords).filter(k=>ctx.hazardFacts?.[k]==='present'),possibleRisks=Object.keys(riskWords).filter(k=>ctx.hazardFacts?.[k]==='possible');
 report.reportedHazards=reportedHazards;report.possibleRisks=possibleRisks;
 const safety='Restez à l’abri de la circulation. Ne déplacez pas les blessés, sauf danger immédiat ; rien à boire ni à manger.';
 const introductions={ongoing:ctx.route==='unknown'&&!reportedHazards.length&&!possibleRisks.length&&!observations.length?'180 — Si l’état des personnes est incertain, appelez les sapeurs-pompiers sans attendre cette conversation. INDIA n’a contacté aucun service.':'180 — Appelez immédiatement les sapeurs-pompiers. Ne retardez pas l’appel. INDIA n’a contacté aucun service.',called:'Vous indiquez avoir appelé les secours ; leur présence reste à confirmer. INDIA n’a effectué aucun appel.',onsite:'Secours sur place, selon le témoin. Suivez les instructions des pompiers. INDIA n’a contacté aucun service.',finished:'Vous rapportez un accident passé ou une intervention terminée. Ce récit n’est pas une alerte en temps réel vérifiée.',traffic:'Vous signalez une perturbation de circulation après la clôture déclarée de l’accident ou de l’intervention. INDIA ne vérifie pas le trafic et ne diffuse aucune alerte.'};
 const lines=[introductions[ctx.situation]];
 if(handled&&!closed)lines[0]='Selon votre déclaration : '+(ctx.fields.description||'accident signalé')+(ctx.fields.location?' à '+ctx.fields.location:'')+'. '+(ctx.evacuationService==='fire'?'Les pompiers ont évacué le blessé.':'Une évacuation du blessé est déclarée.')+(ctx.trafficStatus==='blocked'?' La route reste bloquée.':'')+' Sécurité du site non confirmée.';
 const material=ctx.route==='material'&&!observations.length&&!danger(normalize(ctx.fields.hazards||''));
 if(material&&!closed)lines[0]='Vous indiquez aucun blessé et des dégâts matériels, sans vérification médicale. La compétence territoriale est à confirmer avec le service. Les contacts restent disponibles ; signalez toute nouvelle blessure ou tout danger.';
 if(critical)lines[0]='180 — Signalez immédiatement cette aggravation aux sapeurs-pompiers ; le 185 (SAMU) est également disponible ci-dessous. Si les secours sont présents, prévenez-les sans attendre. Ne retardez pas l’appel pour répondre ici. INDIA ne contacte aucun service.';
 if(critical&&ctx.situation==='onsite')lines[0]='Signalez immédiatement cette aggravation aux secours présents. Suivez leurs instructions. Les contacts 180 et 185 restent accessibles ; INDIA n’a contacté aucun service.';
 if(failed&&!closed&&ctx.situation!=='onsite')lines[0]='180 — Si l’appel n’aboutit pas, essayez l’autre ligne des pompiers ou le SAMU : les contacts existants sont proposés ci-dessous, notamment le 185. Aucun opérateur n’est connecté dans INDIA et aucun service n’a été alerté par l’application.';
 if(!closed&&!handled&&ctx.situation!=='onsite')lines.push(safety);
 const guidance={fuel:'Restez à distance du carburant.',fire:'Restez à distance du feu.',smoke:'Restez à distance des fumées.',traffic:'Restez hors des voies de circulation.',general:'Restez à l’écart du danger signalé.'};
 if(!closed&&reportedHazards.length)lines.push(reportedHazards.map(k=>guidance[k]).join(' ')+' '+(ctx.situation==='onsite'?'Signalez ces dangers aux secours présents.':'Signalez ces dangers lors de l’appel.'));
 const incidentLabel=closed?'Accident ou intervention terminé(e), selon le témoin':handled?'Évacuation déclarée ; état du site non confirmé':'Accident en cours';
 const rescueLabel=ctx.rescueStatus==='onsite'?(closed?'Présence des secours précédemment déclarée par le témoin':'Secours sur place, selon le témoin'):ctx.rescueStatus==='called'?'Secours appelés — présence non confirmée':'non renseignée';
 const declared=Object.fromEntries(Object.entries(ctx.hazardFacts||{}).filter(([,v])=>v!=='possible'));
 if(!missing||closed||handled||ctx.rescueStatus==='onsite'||/\b(?:recapitulatif|resume|signalement|lire aux secours)\b/.test(normalize(message)))lines.push([report.title,'Déclarations non vérifiées :','Situation : '+incidentLabel,...(ctx.rescueStatus!=='not_reported'?['Prise en charge : '+rescueLabel]:[]),...(ctx.careStatus!=='not_reported'?['Évacuation : '+(ctx.careStatus==='evacuated'?'blessé évacué selon le témoin':'prise en charge partielle ou à préciser')]:[]),'Lieu : '+report.fields.location,'Accident : '+report.fields.description,'Blessés : '+report.fields.victims,(closed?'Dangers précédemment rapportés (actualité non confirmée) : ':'Dangers signalés : ')+(hazardText(declared)||'non renseignés'),...(ctx.trafficStatus!=='not_reported'?['Circulation : '+({congested:'embouteillage signalé — non vérifié',blocked:'route bloquée selon le témoin — non vérifié',cleared:'retour à la normale déclaré — non vérifié'}[ctx.trafficStatus])]:[]),...(ctx.trafficDetail?['Précision circulation : '+ctx.trafficDetail]:[]),...(possibleRisks.length?['Risques possibles, non constatés : '+possibleRisks.map(k=>possibleLabels[k]).join(' ; ')]:[]),...(observations.length?['Observations rapportées, évolution non vérifiée : '+observations.join(' ; ')]:[])].join('\n'));
 if(closed&&ctx.trafficStatus==='congested')lines.push('Je n’ai pas d’état du trafic vérifié ni de délai de retour à la normale.');
 if(missing&&!critical&&!failed&&!suppressQuestion){const question=missing==='sector'&&ctx.fields.location?'Dans quel secteur exact de '+ctx.fields.location+' la route est-elle bloquée ?':questions[missing];lines.push((closed||handled?'':'Si vous pouvez poursuivre sans retarder l’appel : ')+question);if(missing==='sector')ctx.sectorAsked=true;if(missing==='check')ctx.triageAsked=true;if(missing==='rescue')ctx.rescueAsked=true;if(missing==='traffic')ctx.trafficAsked=true;}
 return {intent:closed||handled?'accident':material?'constat':'emergency',reply:lines.join('\n\n'),actions:material?calls('fire','police','gendarmerie'):critical||failed||!closed&&observations.length?calls('fire','medical'):calls('fire'),state:{accident:ctx},report,results:[],warnings:['Informations déclarées, non vérifiées ; aucun signalement transmis.']};
}
export function leavesWitnessFlow(message){
 const s=signals(message);if(s.current&&(s.injuries||s.danger))return false;
 return /^(?:nouveau sujet|autre question|passons a|je cherche|je recherche|je veux trouver|trouve moi)\b/.test(s.text)||/\b(?:cni|passeport|permis de conduire|visa|extrait de naissance)\b/.test(s.text);
}
export function witnessAccidentProtocol(body,data){
 const detected=signals(body.message),{text}=detected;
 const old=body.state?.accident;
 if(old?.version===1&&old.route!=='unknown'&&!(detected.injuries&&detected.current))return null;
 const ctx=context(body.state)||(old?.version===1?context({accident:{...old,version:2,situation:'ongoing',triageAsked:old.route==='unknown'}}):null);
 if(ctx&&leavesWitnessFlow(body.message))return null;
 if(!ctx&&(!roadEvent(text)||!detected.injuries&&!detected.situation&&!detected.danger&&(/\bmateriel\b/.test(text)||new RegExp(noInjury.source).test(text))))return null;
 const next=ctx||context({accident:{version:2,situation:'ongoing',route:detected.injuries?'injury':'unknown',fields:{}}});
 if(ctx&&/^(?:stop|effacer|annuler|recommencer)$/.test(text))return {intent:'accident',reply:'Les informations de ce parcours ne sont plus reprises ici. INDIA n’a contacté aucun service. Les contacts d’urgence restent accessibles.',actions:calls('fire'),state:{},results:[],warnings:[]};
 updateEvolution(next,detected);
 const notCalled=/\baucun(?:e)? (?:secours|pompier)\w*.*\bappele\w*\b|\b(?:secours|pompiers).*(?:pas encore|ne sont pas|n ont pas ete) appele\w*\b|\bje n ai pas (?:appele|joint)\b/.test(text);
 const notOnsite=/\b(?:secours|pompiers).*(?:ne sont pas|pas encore)\s+(?:encore )?sur place\b/.test(text);
 if(notCalled||notOnsite&&next.rescueStatus==='onsite'){next.rescueStatus='not_reported';if(next.incidentStatus==='ongoing')next.situation='ongoing';}
 const fields=extract(body.message,data,ctx?.step),control=/^(?:oui|non|merci|ok|d accord|continuer?|preparer les informations|preparer les infos|recommencer|stop|effacer|annuler)$/.test(text);
 if(ctx?.step==='sector'&&!control&&!detected.current&&!detected.situation){if(!fields.location)fields.location=safe((ctx.fields.location?.split(',')[0]||'')+', '+body.message);next.sectorKnown=true;}
 if(ctx?.step==='check'){
  if(/^non\b/.test(text)&&!detected.injuries)fields.victims='Aucun blessé selon votre déclaration — non vérifié';
  else if(/^oui\b/.test(text)&&!fields.victims){fields.victims='Présence de blessés signalée, nombre inconnu';next.route='injury';}
  else if(/^(?:je ne sais pas|je sais pas|incertain|aucune idee)\b/.test(text))fields.victims='inconnu — non observé';
 }
 if(ctx?.step==='traffic'&&!control&&!detected.current&&!detected.situation&&!detected.trafficCleared&&!/\?|^(?:quel|quelle|comment|combien|pourquoi)\b/.test(body.message))next.trafficDetail=safe(body.message);
 if(ctx?.fields.location&&fields.location&&/^(?:carrefour|rond[- ]point)\s+/iu.test(fields.location)){
  fields.location=normalize(ctx.fields.location).includes(normalize(fields.location))?ctx.fields.location:safe(ctx.fields.location.split(',')[0]+', '+fields.location);
 }
 if(ctx&&/^(?:correction|non|en fait|finalement|je corrige)\b/.test(text)&&!fields.location){
  const affirmed=body.message.split(/\bmais\b/iu).at(-1).split(/,\s*(?:pas|non)\b|\s+(?:pas|au lieu de)\s+/iu)[0];
  const vehicles=/((?:un|une|deux|trois|2|3)\s+(?:camion\w*|voiture\w*|moto\w*|bus|taxi|piéton\w*|vélo\w*)(?:\s+(?:et|avec)\s+(?:un|une|deux|trois|2|3)\s+(?:camion\w*|voiture\w*|moto\w*|bus|taxi|piéton\w*|vélo\w*))?)/iu.exec(affirmed);
  if(vehicles)fields.description=safe(vehicles[1]);
 }
 if(ctx?.fields.location&&/\b(?:pas|non)\b/.test(text)&&/\bmais\b/.test(text)){
  const [before,...after]=body.message.split(/\bmais\b/iu),oldPlace=normalize(ctx.fields.location.split(',')[0]);
  if(oldPlace&&normalize(before).includes(oldPlace))fields.location=safe(after.join(' mais ').trim().replace(/^(?:à|a|au)\s+/iu,'').replace(/[.!?]+$/u,''));
 }
 if(ctx&&!Object.keys(fields).length&&!control){
  if(/^(?:je ne sais pas|je sais pas|impossible a dire|inconnu|aucune idee)\b/.test(text)&&keys.includes(ctx.step))fields[ctx.step]='inconnu — non observé';
  else if(ctx.step==='location'&&!/\b(?:secours|pompiers|appele|termine|corrige|correction|blesse|carburant|feu)\b/.test(text))fields.location=safe(body.message);
  else if(ctx.step==='description'&&/\b(?:voiture|moto|camion|bus|taxi|pieton|velo)\b/.test(text))fields.description=safe(body.message);
  else if(ctx.step==='victims'){
   const n=/^(\d{1,3}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)(?:$|\s+(?:personnes?|blesse\w*|victimes?)\b)/.exec(text);if(n)fields.victims=String(numbers[n[1]]??n[1])+' blessé(s) environ, selon vos indications';
  }
 }
 let critical=detected.clinical.positive.length>0&&detected.current;const failed=/\b(?:180|appel)\b.*\b(?:ne passe pas|n aboutit pas|impossible|sans reponse|echou\w*)\b|\bimpossible d appeler\b/.test(text);
 next.criticalSigns=[...new Set([...(next.criticalSigns||[]).filter(k=>!detected.clinical.negative.includes(k)),...detected.clinical.positive])].slice(0,4);
 if(new RegExp(noInjury.source).test(text)&&!detected.injuries)next.route='material';else if(detected.injuries)next.route='injury';
 if(ctx?.step==='check'&&/^non\b/.test(text)&&!detected.injuries)next.route='material';
 const updatedHazards=hazardFacts(body.message);for(const [k,v] of Object.entries(updatedHazards))if(v!=='possible'||next.hazardFacts[k]!=='present')next.hazardFacts[k]=v;
 if(Object.values(updatedHazards).some(v=>v==='present'))delete next.hazardFacts.general;
 if(Object.keys(updatedHazards).length)fields.hazards=safe(hazardText(next.hazardFacts));
 if(detected.evacuation.reported){
  const ev=detected.evacuation,prior=/^(\d+)\b/.exec(ctx?.fields.victims||''),total=prior?Number(prior[1]):ev.reportedTotal;
  next.evacuatedCount=ev.all&&total?total:ev.count;next.evacuationService=ev.byFire?'fire':'not_reported';next.careStatus=ev.afterInjury||!ev.all&&next.evacuatedCount===null||total&&(!next.evacuatedCount||next.evacuatedCount<total)?'partial':'evacuated';
  if(total&&!/\b(?:correction|finalement)\b/.test(text))fields.victims=ctx?.fields.victims||String(total)+' blessé(s) environ, selon vos indications';
  if(!fields.victims&&!ctx?.fields.victims&&ev.count)fields.victims=String(ev.count)+' blessé évacué, selon votre déclaration';
  if(next.rescueStatus==='onsite')next.previousRescueStatus='onsite';next.rescueStatus=ev.presentNow?'onsite':'not_reported';if(!ev.afterInjury)critical=false;
 }else if(next.careStatus==='evacuated'&&detected.current)next.careStatus='not_reported';
 if(next.incidentStatus==='ongoing')next.situation=['onsite','called'].includes(next.rescueStatus)?next.rescueStatus:'ongoing';
 if(careHandled(next)&&['congested','blocked'].includes(next.trafficStatus))next.situation='traffic';
 if(failed&&next.incidentStatus!=='finished'&&next.situation!=='onsite'){next.incidentStatus='ongoing';next.rescueStatus='not_reported';next.situation='ongoing';}
 Object.assign(next.fields,fields);return render(next,body.message,{critical,failed,suppressQuestion:body.location!==undefined&&(!Number.isFinite(Number(body.location?.lat))||!Number.isFinite(Number(body.location?.lon)))||body.date!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(body.date)});
}
