// Presentation adapter only: use the existing select and its existing change handler.
const select=document.getElementById('category');
const pills=document.getElementById('service-pills');
if(select&&pills){
  const buttons=[...pills.querySelectorAll('button[data-category]')];
  const sync=()=>buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===select.value)));
  for(const button of buttons)button.addEventListener('click',()=>{
    select.value=button.dataset.category;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    sync();
  });
  select.addEventListener('change',sync);
  sync();select.hidden=true;pills.hidden=false;
}
// Wrap the existing service label without changing its content or provenance.
function badge(overline){
  const text=[...overline.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
  if(!text)return;
  const span=document.createElement('span');span.className='service-tag';span.textContent=text.textContent;text.replaceWith(span);
}
document.querySelectorAll('.overline').forEach(badge);
new MutationObserver(mutations=>{
  for(const mutation of mutations)for(const node of mutation.addedNodes){
    if(node.nodeType!==Node.ELEMENT_NODE)continue;
    if(node.matches('.overline'))badge(node);
    node.querySelectorAll('.overline').forEach(badge);
  }
}).observe(document.body,{childList:true,subtree:true});
