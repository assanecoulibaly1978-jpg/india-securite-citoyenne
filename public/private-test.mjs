import {phoneHref} from './utils.mjs';

export function safeSourceUrl(value) {
  try { const url=new URL(value); return ['http:','https:'].includes(url.protocol)?url.href:null; } catch { return null; }
}
export function sourceBadge(source,openaiEnabled=false) {
  if(source==='openai'&&openaiEnabled===true)return 'INDIA · OpenAI réel';
  switch(source){case 'rules':return 'Moteur local';case 'session':return 'Session OpenAI terminée';case 'documentation':return 'Base documentaire locale';case 'simulation':return 'Simulation — pas OpenAI';default:return 'Provenance non indiquée';}
}
export function costLabel(cost={}) {
  const amount=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?String(value):'non indiquée';
  const last=typeof cost.lastCallEstimateUsd==='number'&&Number.isFinite(cost.lastCallEstimateUsd)&&cost.lastCallEstimateUsd>=0?` · dernier appel OpenAI (estimé) : ${amount(cost.lastCallEstimateUsd)} USD`:'';
  return `Estimation du message : ${amount(cost.estimateUsd)} USD${last} · session : ${amount(cost.sessionEstimateUsd)} USD · plafonds : ${amount(cost.dailyLimitUsd)} $/jour, ${amount(cost.monthlyLimitUsd)} $/mois.`;
}

// A display-only clock: expiry here never authorizes or sends a message.
export function sessionView(real={},now=Date.now()) {
  const maxRequests=3;
  const remainingRequests=Number.isInteger(real.remainingRequests)?Math.max(0,Math.min(maxRequests,real.remainingRequests)):0;
  const usedRequests=Number.isInteger(real.usedRequests)?Math.max(0,Math.min(maxRequests,real.usedRequests)):(real.expiresAt||real.authorized===true||real.state==='ended'?maxRequests-remainingRequests:0);
  const expiry=Date.parse(real.expiresAt),start=Date.parse(real.startedAt);
  const observed=Number.isFinite(real.observedAt)?real.observedAt:null;
  const allowance=typeof real.remainingSeconds==='number'&&Number.isFinite(real.remainingSeconds)?Math.max(0,Math.min(300,real.remainingSeconds)):300;
  const deadline=Math.min(Number.isFinite(start)?Math.min(expiry,start+300000):expiry,observed===null?Infinity:observed+allowance*1000);
  const remainingSeconds=Number.isFinite(deadline)?Math.max(0,Math.min(300,Math.ceil((deadline-now)/1000))):0;
  let state=real.state||(real.authorized===true?'active':real.available===true?'ready':'unavailable');
  const inferred=state==='active'&&remainingSeconds===0;
  if(inferred)state='ended';
  return {...real,state,remainingRequests,usedRequests,remainingSeconds:state==='ended'?0:remainingSeconds,endReason:inferred?'expired':real.endReason,inferred};
}

// No public chat state is read or modified by this controller.
export function mountPrivateTest(doc,win,fetcher=fetch) {
  const $=id=>doc.getElementById(id);
  if(!$('private-open'))return;
  let authenticated=false,busy=false,generation=0,controller=null,expiryTimer=null,privateCall=false,lastState={},realTimer=null;
  let serverOffset=0,clockLast=0,terminal=null;
  const reasons={expired:'Session réelle expirée : durée de 5 minutes écoulée.',quota_exhausted:'Quota épuisé : 3 appels réels utilisés.',budget_exhausted:'Budget de la session réelle épuisé.',safety_boundary:'Session interrompue : limite de sécurité.',local_boundary:'Session interrompue : demande traitée localement.',sensitive_boundary:'Session interrompue : sujet sensible.',administrative_boundary:'Session interrompue : démarche administrative locale.',cleared:'Session réelle terminée après effacement.',logout:'Session réelle terminée après déconnexion.',provider_error:'Session interrompue : erreur du fournisseur.',output_rejected:'Session interrompue : réponse rejetée.',invalid_usage:'Session interrompue : données d’usage non valides.',timeout:'Session interrompue : délai dépassé.',cancelled:'Session réelle annulée.',ledger_unavailable:'Session interrompue : registre des coûts indisponible.',audit_unavailable:'Session interrompue : audit indisponible.',server_closed:'Session interrompue : serveur fermé.',manual_local:'Session réelle terminée : mode local choisi.'};
  const node=(tag,text,className)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);if(className)el.className=className;return el;};
  const status=text=>{$('private-status').textContent=text;};
  function lockComposer(value){busy=value;$('private-send').disabled=value||!authenticated;$('private-input').disabled=value||!authenticated;for(const b of doc.querySelectorAll('[data-private-message]'))b.disabled=value||!authenticated;$('private-log').setAttribute('aria-busy',String(value));realControls();}
  function realControls(){
    clearTimeout(realTimer);realTimer=null;
    clockLast=Math.max(clockLast,Date.now()+serverOffset);
    let real=sessionView(lastState.real,clockLast);
    if(real.state==='ended'&&!terminal)terminal=real;
    if(terminal)real=terminal;
    const ended=real.state==='ended';
    $('private-real-authorize').disabled=!authenticated||busy||real.available!==true||real.authorized===true||ended;
    $('private-real-confirm').disabled=$('private-real-authorize').disabled;
    $('private-local-continue').hidden=!authenticated||!ended||lastState.localGeneralAllowed===true;
    $('private-local-continue').disabled=!authenticated||busy||!ended||lastState.localGeneralAllowed===true;
    $('private-real-timer').textContent=real.state==='active'||ended?`Temps restant : ${String(Math.floor(real.remainingSeconds/60)).padStart(2,'0')}:${String(real.remainingSeconds%60).padStart(2,'0')}`:'Session réelle : 5 minutes maximum';
    $('private-real-count').textContent=`Appels utilisés : ${real.usedRequests} sur 3 · restants : ${real.remainingRequests}${ended?' (non autorisés)':''}.`;
    const expiry=real.expiresAt?` Échéance initiale : ${real.expiresAt}.`:'';
    $('private-real-status').textContent=ended?`${Object.hasOwn(reasons,real.endReason)?reasons[real.endReason]:'Session réelle terminée : motif non indiqué.'}${real.inferred?' Expiration déduite de l’horloge ; confirmation du serveur en attente.':''}${expiry} Aucune relance automatique. ${lastState.localGeneralAllowed===true?'Mode local choisi explicitement.':'Pour les questions générales, choisissez « Continuer en mode local ». Les urgences et parcours locaux restent disponibles.'}`:real.state==='active'?`Session réelle autorisée.${expiry} Aucune relance automatique.`:real.available===true?'Essai réel disponible uniquement après confirmation explicite.':'OpenAI réel indisponible : accord du propriétaire requis. Aucun appel réel activé.';
    if(authenticated&&real.state==='active'){realTimer=setTimeout(realControls,Math.min(1000,Math.max(1,Date.parse(real.expiresAt)-clockLast)));realTimer.unref?.();}
  }
  function serverState(data){
    if(typeof data.openaiEnabled!=='boolean')throw new Error('private-contract');
    const r=data.real;
    const lastSuccessful=data.source==='openai'&&data.openaiEnabled===true&&data.blocked!==true&&r?.available===false&&r.authorized===false&&r.state==='ended'&&r.endReason==='quota_exhausted'&&r.maxRequests===3&&r.usedRequests===3&&r.remainingRequests===0;
    if(data.openaiEnabled===true&&r?.authorized!==true&&!lastSuccessful)throw new Error('private-contract');
    const stamp=Date.parse(r?.serverNow||data.serverNow);
    if(Number.isFinite(stamp)){serverOffset=stamp-Date.now();clockLast=stamp;}
    if(r?.state==='active'&&r.authorized===true)terminal=null;
    if(r?.state==='ended'&&r.endReason){
      if(!(r.endReason==='manual_local'&&terminal))terminal=sessionView(r,clockLast||Date.now()+serverOffset);
    }
    const nextReal=terminal&&(!r?.state||!['active','ended'].includes(r.state))?terminal:r?{...r,observedAt:Date.now()+serverOffset}:lastState.real;
    lastState={...lastState,...data,real:nextReal};if(data.cost)$('private-cost').textContent=costLabel(data.cost);realControls();
  }
  function cancel(){generation++;controller?.abort();controller=null;lockComposer(false);return generation;}
  function closeCall(){if(!privateCall)return;privateCall=false;const dialog=$('call-dialog');if(dialog.open)dialog.close();$('confirm-call').removeAttribute('href');$('call-title').textContent='Ouvrir le téléphone ?';$('call-description').textContent='';}
  $('call-dialog').addEventListener('close',()=>{if(privateCall){privateCall=false;$('call-title').textContent='Ouvrir le téléphone ?';$('call-description').textContent='';$('confirm-call').removeAttribute('href');}});
  function forget(){authenticated=false;lastState={};terminal=null;serverOffset=0;clockLast=0;cancel();clearTimeout(expiryTimer);clearTimeout(realTimer);expiryTimer=null;$('private-log').replaceChildren();$('private-input').value='';$('private-file').value='';$('private-expiry').textContent='';$('private-cost').textContent='';$('private-session').hidden=true;$('private-login').hidden=false;closeCall();if($('private-real-dialog').open)$('private-real-dialog').close();}
  function fail(error){if(error?.status===401||error?.status===403){forget();status('Accès verrouillé ou session expirée. Sélectionnez de nouveau votre fichier d’accès.');return;}status(error?.name==='AbortError'?'Délai dépassé. Résultat non confirmé ; vous pouvez réessayer, effacer ou vous déconnecter.':'Opération non confirmée par le serveur. Réessayez ; aucune suppression ni déconnexion n’est confirmée.');}
  async function request(path,method='GET',body){
    const active=new AbortController();controller=active;const timer=setTimeout(()=>active.abort(),15000);
    const options={method,credentials:'same-origin',cache:'no-store',signal:active.signal,headers:method==='GET'?{}:{'x-private-test':'1'}};
    if(method==='POST'){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);body=null;}
    try{const pending=fetcher('/api/private-test/'+path,options);options.body=undefined;const response=await pending;if(!response.ok){const error=new Error('private-request-failed');error.status=response.status;throw error;}return response.status===204?{}:await response.json();}
    finally{clearTimeout(timer);options.body=undefined;if(controller===active)controller=null;}
  }
  function acceptSession(data){
    if(data?.authenticated!==true)throw new Error('private-contract');
    serverState(data);
    authenticated=true;$('private-login').hidden=true;$('private-session').hidden=false;$('private-cost').textContent=costLabel(data.cost);lockComposer(false);
    clearTimeout(expiryTimer);const expiry=new Date(data.expiresAt).getTime();
    $('private-expiry').textContent=Number.isFinite(expiry)?'Session locale jusqu’au '+new Date(expiry).toLocaleString('fr-FR')+'.':'Session locale authentifiée.';
    if(Number.isFinite(expiry)){expiryTimer=setTimeout(()=>{forget();status('Session expirée. Reconnectez-vous avec votre fichier.');},Math.max(0,Math.min(expiry-Date.now(),2147483647)));expiryTimer.unref?.();}
    $('private-simulation').disabled=data.simulationAvailable!==true;
    if(data.simulationAvailable!==true)$('private-simulation').checked=false;
  }
  async function checkStatus(){const ticket=cancel();lockComposer(true);status('Vérification de l’accès local…');try{const data=await request('status');if(ticket!==generation)return;acceptSession(data);status('Bienvenue, je suis INDIA. Comment puis-je vous aider ? Utilisez un exemple fictif.');}catch(error){if(ticket===generation)fail(error);}finally{if(ticket===generation)lockComposer(false);}}
  async function open(){const opening=$('private-panel').hidden;$('private-panel').hidden=!opening;$('private-open').setAttribute('aria-expanded',String(opening));if(opening)await checkStatus();}
  $('private-open').addEventListener('click',open);
  $('private-file').addEventListener('change',async()=>{
    const ticket=cancel();lockComposer(true);status('Ouverture de la session locale…');
    let file=$('private-file').files?.[0],raw=null,payload=null;
    $('private-file').value='';
    try{
      if(!file||file.size>16384||!file.name.toLowerCase().endsWith('.json'))throw new Error('private-file');
      raw=await file.text();file=null;if(ticket!==generation)return;
      payload=JSON.parse(raw);raw=null;
      if(typeof payload?.accessKey!=='string'||!payload.accessKey||payload.accessKey.length>4096)throw new Error('private-file');
      const pending=request('login','POST',{accessKey:payload.accessKey});payload.accessKey='';payload=null;
      const data=await pending;if(ticket!==generation)return;acceptSession(data);status('Bienvenue, je suis INDIA. Comment puis-je vous aider ? Utilisez un exemple fictif.');
    }catch(error){if(ticket===generation){if(error?.status||error?.name==='AbortError')fail(error);else status('Fichier d’accès illisible ou connexion impossible. Sélectionnez le fichier JSON local prévu.');}}
    finally{file=null;raw=null;if(payload)payload.accessKey='';payload=null;$('private-file').value='';if(ticket===generation)lockComposer(false);}
  });
  function call(number,name){const href=phoneHref(number);if(!href)return;closeCall();$('call-title').textContent='Appeler '+(name||'ce service')+' ?';$('call-description').textContent='Numéro : '+number+'. Confirmez pour ouvrir votre application téléphone. Aucun service n’a été alerté.';$('confirm-call').href=href;privateCall=true;$('call-dialog').showModal();}
  const button=(text,action)=>{const b=node('button',text,'secondary');b.type='button';b.addEventListener('click',action);return b;};
  function sourceLine(source){
    if(typeof source==='string')return node('p',source,'private-source');
    const line=node('p',undefined,'private-source');if(!source||typeof source!=='object')return line;
    const urls=[source.access_url,source.url||source.source_url].filter((url,i,list)=>url&&list.indexOf(url)===i);
    line.append(node('span',source.title||source.label||source.source_label||source.publisher||'Source publiée'));
    for(const value of urls){const safe=safeSourceUrl(value);if(safe){const a=node('a',value);a.href=safe;a.target='_blank';a.rel='noopener noreferrer';a.referrerPolicy='no-referrer';line.append(node('span',' · '),a);}}
    line.append(node('span',' · Consultée le '+(source.consulted_on||source.retrieved_at||source.consultedAt||'date non indiquée')));
    const publication=source.published_on||source.published_at||source.updated_at;
    if(publication)line.append(node('span',' · Publication / mise à jour : '+publication));
    for(const reserve of [source.reserve,...(Array.isArray(source.reserves)?source.reserves:[]),...(Array.isArray(source.warnings)?source.warnings:[])].filter(Boolean))line.append(node('span',' · '+reserve));
    if(source.linkStatus==='unavailable')line.append(node('span',' · Lien non revalidé : exigences à confirmer.'));
    return line;
  }
  function bubble(text,label){const el=node('article',undefined,'private-bubble');el.append(node('strong',label,'private-badge'),node('p',text,'private-copy'));$('private-log').append(el);return el;}
  function render(data){
    let reply=typeof data.reply==='string'?data.reply:'Aucune réponse exploitable.';
    if(/à confirmer/i.test([data.documentaryDetails,...(Array.isArray(data.warnings)?data.warnings:[])].join(' '))&&!/à confirmer/i.test(reply))reply+='\nÀ confirmer auprès du service compétent.';
    const el=bubble(reply,sourceBadge(data.source,data.openaiEnabled));
    const actions=node('div',undefined,'private-actions');
    for(const action of Array.isArray(data.actions)?data.actions:[]){if(action.type==='call'&&phoneHref(action.number))actions.append(button('Appeler '+(action.label||action.service||'le service')+' · '+action.number,()=>call(action.number,action.label||action.service)));else if(action.type==='message'&&typeof action.message==='string'&&action.message.length<=1000)actions.append(button(action.label||'Continuer',()=>send(action.message)));}
    el.append(actions);
    for(const record of Array.isArray(data.results)?data.results:[]){
      const card=node('section',undefined,'private-result');card.append(node('h3',record.name||'Service'),node('p',record.address||record.city||'Adresse non indiquée.'),sourceLine(record));
      const numbers=(Array.isArray(record.callable_phones)?record.callable_phones:[]).filter(number=>phoneHref(number));
      card.append(node('p',numbers.length?'Téléphone publié : '+numbers.join(' / '):'Téléphone activable non renseigné ou format non validé.'));
      for(const number of numbers)card.append(button('Appeler '+number,()=>call(number,record.name)));
      el.append(card);
    }
    const sources=Array.isArray(data.sources)?data.sources:(Array.isArray(data.knowledge?.sources)?data.knowledge.sources:[]);
    if(sources.length||typeof data.documentaryDetails==='string'||data.warnings?.length){
      const details=node('details',undefined,'private-documentation');details.append(node('summary','Voir les sources'));
      if(typeof data.documentaryDetails==='string')details.append(node('p',data.documentaryDetails,'private-copy'));
      for(const source of sources)details.append(sourceLine(source));
      if(Array.isArray(data.warnings))for(const warning of data.warnings)details.append(node('p',warning,'private-note'));
      el.append(details);
    }
    el.append(node('small',costLabel(data.cost),'private-note'));$('private-cost').textContent=costLabel(data.cost);$('private-log').scrollTop=$('private-log').scrollHeight;
  }
  async function send(message){
    if(!authenticated||busy)return;message=message.trim();if(!message||message.length>1000){status('Saisissez entre 1 et 1 000 caractères.');return;}
    const ticket=cancel();lockComposer(true);const submitted=message;bubble(message,'Vous · essai privé');$('private-input').value='';status('Réponse en cours…');
    try{const pending=request('message','POST',{message,simulation:$('private-simulation').checked});message='';const data=await pending;if(ticket!==generation)return;
      if(data.openaiEnabled===true&&data.source!=='openai')throw new Error('private-contract');
      if(data.source==='openai'&&data.openaiEnabled!==true)throw new Error('private-contract');
      serverState({...data,real:data.real||lastState.real});render(data);
      if(data.blocked===true&&!$('private-input').value)$('private-input').value=submitted;
      status(data.source==='openai'?'Réponse INDIA reçue via OpenAI réel. Coût estimé affiché.':data.cost?.estimateUsd>0?'Réponse non générative ; un coût ou une provision IA est conservé. Consultez l’estimation.':data.source==='session'?'Session OpenAI terminée. Aucun renvoi automatique de votre question.':`Réponse reçue — ${sourceBadge(data.source)}. Aucun appel OpenAI pour cette réponse locale.`);}
    catch(error){if(ticket===generation)fail(error);}finally{message='';if(ticket===generation)lockComposer(false);}
  }
  $('private-form').addEventListener('submit',event=>{event.preventDefault();return send($('private-input').value);});
  for(const shortcut of doc.querySelectorAll('[data-private-message]'))shortcut.addEventListener('click',()=>send(shortcut.dataset.privateMessage));
  async function remove(logout){
    const ticket=cancel();lockComposer(true);status(logout?'Déconnexion en cours…':'Effacement en cours…');
    try{const data=await request(logout?'session':'conversation','DELETE');if(ticket!==generation)return;if(logout){forget();status('Déconnexion confirmée : session et mémoire de test supprimées.');}else{serverState({...data,openaiEnabled:data.openaiEnabled??false,real:data.real||{}});$('private-log').replaceChildren();$('private-input').value='';closeCall();status('Essai effacé : suppression de la conversation confirmée par le serveur. Coûts conservés.');}}
    catch(error){if(ticket===generation)fail(error);}finally{if(ticket===generation)lockComposer(false);}
  }
  $('private-clear').addEventListener('click',()=>remove(false));$('private-logout').addEventListener('click',()=>remove(true));
  $('private-real-authorize').addEventListener('click',()=>{if(!authenticated||$('private-real-authorize').disabled)return;$('private-real-dialog').showModal();});
  $('private-real-cancel').addEventListener('click',()=>{$('private-real-dialog').close();});
  $('private-real-confirm').addEventListener('click',async()=>{
    if(!authenticated||$('private-real-confirm').disabled||!$('private-real-dialog').open)return;
    $('private-real-dialog').close();const ticket=cancel();lockComposer(true);
    try{const data=await request('real-session','POST',{acknowledgeCost:true});if(ticket!==generation)return;if(data.authenticated!==true)throw new Error('private-contract');serverState(data);status('Autorisation confirmée par le serveur. Aucun message envoyé automatiquement.');}
    catch(error){if(ticket===generation){if(error.status===403)status('Autorisation réelle refusée : accord du propriétaire requis. Votre session privée reste disponible.');else fail(error);}}
    finally{if(ticket===generation)lockComposer(false);}
  });
  function hashEntry(){if(!['#assistant','#mode-test-prive'].includes(win.location.hash))return;doc.querySelector('[data-tab="assistant"]')?.click();if(win.location.hash==='#mode-test-prive'&&$('private-panel').hidden)return open();}
  $('private-local-continue').addEventListener('click',async()=>{
    if(!authenticated||busy||$('private-local-continue').hidden||$('private-local-continue').disabled)return;
    const ticket=cancel();lockComposer(true);
    try{const data=await request('local-mode','POST',{enabled:true});if(ticket!==generation)return;
      if(data.authenticated!==true||data.localGeneralAllowed!==true||data.real?.authorized===true)throw new Error('private-contract');
      serverState(data);status('Mode local choisi explicitement et confirmé par le serveur. Aucune question renvoyée.');
    }catch(error){if(ticket===generation)fail(error);}finally{if(ticket===generation)lockComposer(false);}
  });
  async function refreshVisible(){if(!authenticated||busy||doc.visibilityState==='hidden')return;return checkStatus();}
  doc.addEventListener('visibilitychange',refreshVisible);
  win.addEventListener('hashchange',hashEntry);win.addEventListener('pagehide',()=>{forget();status('');});win.addEventListener('pageshow',refreshVisible);
  lockComposer(false);hashEntry();
}
if(typeof document!=='undefined'){
  const mount=()=>mountPrivateTest(document,window);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}
