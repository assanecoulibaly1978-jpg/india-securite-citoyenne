// Presentation adapter only: the existing forms own all transport and permissions.
const ROUTES=Object.freeze({
 '#accueil':{view:'accueil'},'#converser':{view:'converser'},'#assistant':{view:'converser'},
 '#mode-test-prive':{view:'converser',private:true},'#services':{view:'services',legacy:'directory'},
 '#annuaire':{view:'services',legacy:'directory'},'#sources':{view:'services',legacy:'sources'},
 '#urgences':{view:'services',legacy:'directory',emergency:true},'#historique':{view:'historique'},
 '#mon-compte':{view:'compte'}
});
const HASHES=Object.freeze({accueil:'#accueil',converser:'#converser',services:'#services',historique:'#historique',compte:'#mon-compte'});
export function routeForHash(hash){return {...(ROUTES[hash]||ROUTES['#accueil'])};}
export function routeForLegacyTab(tab,hash){return tab==='assistant'?{view:'converser',legacy:'assistant',private:hash==='#mode-test-prive'}:{view:'services',legacy:tab==='sources'?'sources':'directory'};}
export function composerIsBusy(doc,privateMode){
 const input=doc.getElementById(privateMode?'private-input':'chat-input'),form=doc.getElementById(privateMode?'private-form':'chat-form');
 return Boolean(input?.disabled||form?.querySelector('[type="submit"]')?.disabled||(!privateMode&&doc.getElementById('chat-status')?.textContent?.trim()));
}
export function sessionSummary(doc){return {
 publicMessages:doc.getElementById('chat-log')?.querySelectorAll('.user').length||0,
 privateMessages:[...(doc.getElementById('private-log')?.querySelectorAll('.private-badge')||[])].filter(node=>node.textContent?.startsWith('Vous')).length,
 privateOpen:doc.getElementById('private-session')?.hidden===false
};}
export function mountIndiaShell(doc=document,win=window){
 const body=doc.body;
 const screens={accueil:doc.getElementById('india-home-view'),converser:doc.getElementById('india-conversation-view'),services:doc.getElementById('india-services-view'),historique:doc.getElementById('india-history-view'),compte:doc.getElementById('india-account-view')};
 if(!screens.accueil||body.dataset.indiaMounted==='true')return null;
 body.dataset.indiaMounted='true';
 const oldViews=['directory','assistant','sources'].map(id=>doc.getElementById(id));
 // Move, never recreate, the existing nodes: IDs, listeners and controls survive.
 doc.getElementById('directory').prepend(doc.querySelector('.top-grid'));
 screens.services.append(doc.getElementById('directory'),doc.getElementById('sources'));
 screens.converser.append(doc.getElementById('assistant'));
 const menu=doc.getElementById('india-menu-panel'),menuButton=doc.getElementById('india-menu');
 let routing=false;
 const listeners=[];
 function listen(node,event,handler){if(node){node.addEventListener(event,handler);listeners.push(()=>node.removeEventListener(event,handler));}}
 function text(id,value){const node=doc.getElementById(id);if(node&&node.textContent!==value)node.textContent=value;}
 function closeMenu(){menu.hidden=true;menuButton.setAttribute('aria-expanded','false');}
 function updateSummary(){
  const s=sessionSummary(doc);
  text('india-history-public',s.publicMessages?`${s.publicMessages} message${s.publicMessages>1?'s':''} envoyé${s.publicMessages>1?'s':''} sur cette page.`:'Aucun message envoyé sur cette page.');
  text('india-history-private',s.privateOpen?`${s.privateMessages} message${s.privateMessages>1?'s':''} privé${s.privateMessages>1?'s':''} envoyé${s.privateMessages>1?'s':''} sur cette page. Mémoire temporaire côté serveur.`:'Mode privé verrouillé. Aucun contenu privé affiché ici.');
  text('india-account-status',s.privateOpen?'Session privée locale ouverte.':'Mode test privé verrouillé.');
  text('india-home-mode',s.privateOpen?'Session privée ouverte · Le badge précise l’origine de chaque réponse':'Mode local gratuit · Conversation privée disponible dans Converser');
  doc.getElementById('india-reset-private').disabled=!s.privateOpen||Boolean(doc.getElementById('private-clear')?.disabled);
 }
 function focusScroll(node){if(!node)return;node.setAttribute('tabindex','-1');node.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:'auto'});}
 function show(view,options={}){
  if(routing||!screens[view])return;
  routing=true;
  try{
   body.dataset.view=view;
   for(const [name,node]of Object.entries(screens))node.hidden=name!==view;
   doc.getElementById('india-prevention').hidden=true;
   doc.getElementById('india-alerts-note').hidden=true;
   if(view==='converser'||view==='services'){
    const legacy=view==='converser'?'assistant':(options.legacy==='sources'?'sources':'directory');
    doc.querySelector(`.india-legacy-tabs [data-tab="${legacy}"]`)?.click();
   }else for(const node of oldViews)node.hidden=true;
   for(const button of doc.querySelectorAll('.india-navigation [data-india-view]')){
    const active=button.dataset.indiaView===view;button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
   }
   closeMenu();updateSummary();
   if(options.private&&doc.getElementById('private-panel').hidden)doc.getElementById('private-open').click();
   if(options.updateHash!==false){
    const hash=options.private?'#mode-test-prive':options.emergency?'#urgences':options.legacy==='sources'?'#sources':HASHES[view];
    win.history.replaceState(null,'',hash);
   }
   if(options.scroll!==false){
    if(options.emergency)focusScroll(doc.querySelector('.emergency'));
    else if(options.private)focusScroll(doc.getElementById('private-entry'));
    else{win.scrollTo(0,0);screens[view].querySelector('h1')?.focus({preventScroll:true});}
   }
  }finally{routing=false;}
 }
 function openPrivate(){show('converser',{private:true});}
 function source(){show('services',{legacy:'sources'});}
 function service(key){
  if(key==='urgences')show('services',{emergency:true});
  else if(key==='administration')openPrivate();
  else if(key==='autour'){
   show('services');
   const category=doc.getElementById('category');category.value='all';category.dispatchEvent(new win.Event('change',{bubbles:true}));
   doc.getElementById('search-form').requestSubmit();focusScroll(doc.querySelector('.search-panel'));
  }else if(key==='securite'){
   show('services');for(const node of oldViews)node.hidden=true;
   const panel=doc.getElementById('india-prevention');panel.hidden=false;focusScroll(panel);
  }else if(key==='infos'){
   source();doc.getElementById('india-alerts-note').hidden=false;focusScroll(doc.getElementById('india-alerts-note'));
  }else if(key==='assistance')show('converser');
 }
 for(const button of doc.querySelectorAll('[data-india-view]'))listen(button,'click',()=>show(button.dataset.indiaView));
 for(const button of doc.querySelectorAll('[data-india-service]'))listen(button,'click',()=>service(button.dataset.indiaService));
 for(const button of doc.querySelectorAll('[data-india-private]'))listen(button,'click',openPrivate);
 for(const button of doc.querySelectorAll('[data-india-source]'))listen(button,'click',source);
 for(const button of doc.querySelectorAll('[data-india-directory]'))listen(button,'click',()=>show('services'));
 for(const button of doc.querySelectorAll('[data-tab]'))listen(button,'click',()=>{if(!routing){const route=routeForLegacyTab(button.dataset.tab,win.location.hash);show(route.view,route);}});
 listen(menuButton,'click',()=>{menu.hidden=!menu.hidden;menuButton.setAttribute('aria-expanded',String(!menu.hidden));});
 listen(doc,'keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();closeMenu();menuButton.focus();}});
 listen(doc,'click',event=>{if(!menu.hidden&&!menu.contains(event.target)&&!menuButton.contains(event.target))closeMenu();});
 listen(doc.getElementById('india-quick-help'),'click',()=>service('urgences'));
 listen(doc.getElementById('india-notices'),'click',()=>service('infos'));
 listen(doc.getElementById('india-account'),'click',()=>show('compte'));
 listen(doc.getElementById('india-reset-public'),'click',()=>{doc.getElementById('reset-chat').click();updateSummary();});
 listen(doc.getElementById('india-reset-private'),'click',()=>{if(sessionSummary(doc).privateOpen){openPrivate();doc.getElementById('private-clear').click();}});
 for(const button of doc.querySelectorAll('[data-india-protocol]'))listen(button,'click',()=>{
  const privateMode=sessionSummary(doc).privateOpen;
  show('converser',{private:privateMode});
  const input=doc.getElementById(privateMode?'private-input':'chat-input');
  const form=doc.getElementById(privateMode?'private-form':'chat-form');
  input.value=button.dataset.indiaProtocol==='accident'?'Un accident vient de se produire.':'Je souhaite préparer une plainte.';
  if(!composerIsBusy(doc,privateMode))form.requestSubmit();
 });
 listen(doc.getElementById('india-home-form'),'submit',event=>{
  event.preventDefault();const homeInput=doc.getElementById('india-home-input'),message=homeInput.value.trim();if(!message)return;
  const privateMode=sessionSummary(doc).privateOpen;
  const input=doc.getElementById(privateMode?'private-input':'chat-input');
  const form=doc.getElementById(privateMode?'private-form':'chat-form');
  if(composerIsBusy(doc,privateMode)){text('india-home-mode','Une réponse est en cours. Votre question reste dans ce champ ; réessayez après sa fin.');return;}
  show('converser',{private:privateMode,scroll:false});input.value=message;homeInput.value='';form.requestSubmit();
  focusScroll(privateMode?doc.getElementById('private-panel'):doc.getElementById('chat-log'));
 });
 const observer=new win.MutationObserver(updateSummary);
 for(const id of ['chat-log','private-log']){const node=doc.getElementById(id);if(node)observer.observe(node,{childList:true,subtree:true});}
 observer.observe(doc.getElementById('private-session'),{attributes:true,attributeFilter:['hidden']});
 observer.observe(doc.getElementById('private-clear'),{attributes:true,attributeFilter:['disabled']});
 function hashRoute(){const route=routeForHash(win.location.hash);show(route.view,{...route,updateHash:false});}
 listen(win,'hashchange',hashRoute);
 const initial=routeForHash(win.location.hash);show(initial.view,{...initial,updateHash:false,scroll:false});
 return {show,service,destroy(){observer.disconnect();for(const unlisten of listeners)unlisten();delete body.dataset.indiaMounted;}};
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mountIndiaShell(),{once:true});else mountIndiaShell();
}
