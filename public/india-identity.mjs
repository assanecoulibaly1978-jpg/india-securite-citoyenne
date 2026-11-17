// Presentation-only avatar adapter. No conversation text is copied or retained.
const asset='/assets/india-drawing.png';
export function decorateIndiaReply(bubble,doc){
 const label=bubble.querySelector('.who, .private-badge');
 if(!label||bubble.classList.contains('user')||/^Vous(?:\s|$)/.test(label.textContent)||label.querySelector('.india-avatar'))return false;
 const avatar=doc.createElement('img');
 avatar.src=asset;avatar.alt='';avatar.className='india-avatar';avatar.width=34;avatar.height=34;avatar.decoding='async';avatar.setAttribute?.('aria-hidden','true');
 label.classList.add('india-message-identity');label.prepend(avatar);return true;
}
export function mountIndiaIdentity(doc,Observer=globalThis.MutationObserver){
 const roots=['chat-log','private-log'].map(id=>doc.getElementById(id)).filter(Boolean);
 const decorate=node=>{
  if(node.nodeType!==1)return;
  if(node.matches('.bubble, .private-bubble'))decorateIndiaReply(node,doc);
  for(const bubble of node.querySelectorAll('.bubble, .private-bubble'))decorateIndiaReply(bubble,doc);
 };
 for(const root of roots)decorate(root);
 if(typeof Observer!=='function')return ()=>{};
 const observer=new Observer(changes=>{for(const change of changes)for(const node of change.addedNodes)decorate(node);});
 for(const root of roots)observer.observe(root,{childList:true,subtree:true});
 return ()=>observer.disconnect();
}
if(typeof document!=='undefined'){
 const mount=()=>mountIndiaIdentity(document);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
}
