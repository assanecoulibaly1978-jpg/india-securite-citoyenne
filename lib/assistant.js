import {normalize,bad,coordinates,dateValue,search,categories} from './directory.js';
import {contacts,emergencySource} from './emergency.js';
import {accidentProtocol} from './accident.js';
import {witnessAccidentProtocol} from './accident-witness.js';
import {complaintProtocol} from './complaint.js';
export {emergencySource};
const noInjury=/\b(?:sans|pas de|aucun(?:e)?) blesse\w*\b|\bpersonne n est blesse\w*\b/g;
function materialAccident(text){return /\baccident\b/.test(text)&&(/\bmateriel\b/.test(text)||text.replace(noInjury,'')!==text);}
function urgency(raw){
 const text=normalize(raw),accident=/\baccident\b/.test(text);
 const clauses=raw.split(/[,;.!?\n]+|\bmais\b/i).map(normalize).map(c=>c.replace(noInjury,'').replace(/\b(?:pas de|sans|aucun(?:e)?) (?:incendie|feu|violences?|agression|cambriolage|malaise|sang)\b/g,''));
 const live=clauses.filter(c=>!(/\bhier\b|semaine derniere|autrefois|peut etre|ne sais pas si/.test(c))||/maintenant|en cours|actuellement/.test(c));const found=[];
 if(live.some(c=>/\b(incendie|feu|brule\w*|explosion|inondation|noyade)\b/.test(c)||(accident&&/\bblesse\w*\b/.test(c))))found.push('fire');
 if(live.some(c=>/\b(respire (?:plus|pas)|inconscient\w*|malaise|sang|saigne\w*|hemorragie|etouffe\w*|douleur thoracique|suicid\w*|me tuer)\b|\bn arrive (?:plus|pas) a respirer\b/.test(c)))found.push('medical');
 if(live.some(c=>/\b(agression|violences?|cambriolage|menace\w*|braquage|attaque|arme|viol en cours)\b/.test(c)))found.push('police');
 if(found.length)return found;
 if(/\b(urgence|danger|au secours|accident|blesse\w*)\b/.test(text)&&!materialAccident(text)&&!/\b(sans danger|pas d urgence|non urgent)\b/.test(text))return ['fire','medical','police','gendarmerie'];
 return null;
}
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function chat(body,data,clock){if(!object(body)||typeof body.message!=='string'||!body.message.trim()||body.message.length>2000)throw bad('Message requis, de 1 à 2000 caractères.');const text=normalize(body.message),urgent=urgency(body.message);const complaint=complaintProtocol(body,data,clock,urgent);if(complaint)return complaint;const witness=witnessAccidentProtocol(body,data);if(witness)return witness;const accident=accidentProtocol(body,data,clock,urgent);if(accident)return accident;if(urgent){const actions=contacts.filter(c=>urgent.includes(c.service)).map(c=>({type:'call',...c}));return {reply:`Contactez maintenant : ${actions.map(c=>`${c.label} ${c.number}`).join(' ; ')}. L’appel nécessite votre confirmation sur votre téléphone. Cet assistant automatique ne contacte aucun service.`,intent:'emergency',actions,state:{},results:[],warnings:['Numéros de secours publics; aucune intervention déclenchée par cet assistant.']};}
 if(body.state!==undefined&&!object(body.state))throw bad('État client invalide.');if(body.location!==undefined&&(!object(body.location)||body.location.lat===undefined||body.location.lon===undefined))throw bad('Position invalide.');const location=body.location?coordinates(body.location.lat,body.location.lon):null;const date=dateValue(body.date,clock),previous=body.state||{};let state={};const reply=(message,intent,results=[],warnings=[],actions=[])=>({reply:message,intent,actions,state,results,warnings,date});
 if(/\b(humain|operateur|conseiller|agent en ligne)\b/.test(text))return reply('Aucun opérateur n’est connecté à cet assistant automatique : pas de transfert possible. Vous pouvez contacter directement un service de l’annuaire.','human',[],[],[{type:'human'}]);
 if(/\b(payant|payer|partenaire)\b/.test(text))return reply('Aucun service partenaire payant n’est disponible ici. Cet assistant automatique recherche uniquement les services du catalogue.','paid');
 let intent=/\b(pharmacie|pharmacies|medicament)\b/.test(text)?'pharmacy':/\b(gendarmerie|gendarme|brigade)\b/.test(text)?'gendarmerie':/\b(plainte|porter plainte)\b/.test(text)?'plainte':materialAccident(text)||/\bconstat\b/.test(text)?'constat':/\b(police|commissariat)\b/.test(text)?'police':/\b(pompier|pompiers|caserne)\b/.test(text)?'fire':null;
 const explicit=!!intent;let category=intent==='plainte'||intent==='constat'?'police':intent;
 if(!category&&categories.includes(previous.category)){category=previous.category;intent=['constat','plainte'].includes(previous.intent)?previous.intent:category;}
 if(!category)return reply('Je suis un assistant automatique à règles, relié à l’annuaire, sans IA générative. Je peux rechercher police, gendarmerie, pompiers ou pharmacies. Précisez le service et la commune.','other');
 const cities=[...new Set(data.records.map(r=>r.city).filter(c=>typeof c==='string'&&normalize(c)))].sort((a,b)=>b.length-a.length);const city=cities.find(c=>(` ${text} `).includes(` ${normalize(c)} `));const near=/\b(pres de moi|autour de moi|proximite)\b/.test(text);const extracted=body.message.trim().match(/(?:\s(?:à|a|dans|sur|vers)\s+)([\p{L}\p{N}'’ -]{2,80})[?.!]*$/u)?.[1]?.trim();const followup=!explicit&&previous.awaiting==='locality'&&/^[\p{L}\p{N}'’ -]{2,80}$/u.test(body.message.trim())?body.message.trim():'';const locality=city||(!near&&(extracted||followup))||(!explicit&&!near&&typeof previous.locality==='string'?previous.locality:'');const duty=category==='pharmacy'&&(explicit?/\b(garde|nuit|ouverte|ouvert)\b/.test(text):previous.duty===true);
 state={category,intent,duty,...(locality?{locality}:{})};
 if(!locality&&!location){state.awaiting='locality';return reply(near?'Votre position n’est pas disponible. Indiquez une commune ou partagez votre position avec votre accord.':'Dans quelle commune ou localité souhaitez-vous rechercher ce service ?',intent);}
 const found=search(data,{category,q:locality,date,duty:duty?'1':'0',...(location?location:{})},clock);let message=found.total?`${found.total} résultat(s) dans le catalogue${locality?` pour ${locality}`:''}. Consultez les coordonnées et leur source; confirmez les informations auprès du service.`:'Aucun résultat dans les données disponibles pour cette recherche. Cela ne signifie pas qu’aucun service n’existe; essayez une commune voisine ou consultez les sources.';if(intent==='plainte'||intent==='constat')message+=' Cet assistant ne dépose aucune plainte et ne fournit pas de conseil juridique.';return reply(message,intent,found.results,found.warnings);
}
