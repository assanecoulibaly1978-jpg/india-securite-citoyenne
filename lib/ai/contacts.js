import {search,categories} from '../directory.js';

export const CONTACT_TOOL=Object.freeze({
 type:'function',name:'rechercher_contact',description:'Recherche en lecture seule dans l’annuaire importé. Les pharmacies sont filtrées sur la garde publiée pour la date de recherche.',strict:true,
 parameters:{type:'object',additionalProperties:false,required:['service','commune'],properties:{service:{type:'string',enum:['pharmacy','police','gendarmerie','fire']},commune:{type:'string'}}}
});
const fields=['id','category','name','city','address','callable_phones','source_url','source_label','source_kind','retrieved_at','duty_periods','lat','lon','location_source_kind','location_source_url'];

export function searchContacts(raw,data,clock,date){
 const args=typeof raw==='string'?JSON.parse(raw):raw;
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).sort().join(',')!=='commune,service'||!categories.includes(args.service)||typeof args.commune!=='string'||!args.commune.trim()||args.commune.length>100)throw Error('Recherche non autorisée');
 const found=search(data,{category:args.service,q:args.commune,limit:5,date,...(args.service==='pharmacy'?{duty:'1'}:{})},clock);
 return {service:args.service,date:found.date,total:found.total,warnings:found.warnings,records:found.results.map(record=>Object.fromEntries(fields.filter(key=>record[key]!==undefined).map(key=>[key,record[key]])))};
}
