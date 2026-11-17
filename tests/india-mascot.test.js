import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const originalHash='29641b9a300a52fe06bc5ff5bdd0ca874ab4eb4c34c180e4cd1112623eeb93d4';
test('the INDIA mascot asset is the exact supplied PNG, not a redrawing or cropped derivative',()=>{
 const asset=new URL('../public/assets/india.png',import.meta.url);
 assert.ok(existsSync(asset),'Supplied mascot must be available as a local asset');
 const bytes=readFileSync(asset);assert.equal(createHash('sha256').update(bytes).digest('hex'),originalHash);
 assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);
});

test('the existing home and Assistant welcome INDIA without hiding nonofficial status or controls',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const home=html.slice(html.indexOf('<section id="india-home-view"'),html.indexOf('<section id="india-conversation-view"'));
 const assistant=html.slice(html.indexOf('<section id="assistant"'),html.indexOf('<section id="sources"'));
 assert.ok(home.replace(/<[^>]*>/g,'').includes('Bonjour, je suis INDIA'));assert.ok(assistant.includes('Bonjour, je suis INDIA, votre assistant IA citoyen'));
 for(const text of [home,assistant]){assert.match(text,/<img[^>]+src="\/assets\/india-drawing\.png"/);assert.match(text,/indépendant.*Non officiel/);}
 for(const id of ['search-form','chat-form','private-form','private-open','private-file','private-clear','private-real-authorize','call-dialog','geo-dialog','sources-content'])assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/href="\/india-identity\.css"/);assert.match(html,/src="\/india-identity\.mjs"/);
});

test('identity styling keeps the complete image, modest sizes and readable responsive corporate surfaces',()=>{
 const file=new URL('../public/india-identity.css',import.meta.url);assert.ok(existsSync(file),'Identity stylesheet is required');const css=readFileSync(file,'utf8');
 assert.match(css,/object-fit:\s*contain/);assert.doesNotMatch(css,/(?:^|[;{])\s*(?:object-fit:\s*cover|filter:|mask:|clip-path:|transform:)/m);
 assert.match(css,/linear-gradient/);assert.match(css,/#fff(?:fff)?\b/i);assert.match(css,/@media/);assert.match(css,/\.india-avatar/);assert.match(css,/var\(--navy\)/);
});

test('assistant responses receive one intact-image avatar while user messages and text remain unchanged',async()=>{
 const file=new URL('../public/india-identity.mjs',import.meta.url);assert.ok(existsSync(file),'Reply identity adapter must exist');
 const {decorateIndiaReply}=await import(file);
 const make=(text,user=false)=>{const label={textContent:text,nodes:[],classList:{add(){}},querySelector(){return this.nodes.find(n=>n.className==='india-avatar')||null;},prepend(n){this.nodes.unshift(n);}};return {label,bubble:{classList:{contains:()=>user},querySelector:()=>label}};};
 const doc={createElement:()=>({})};
 for(const text of ['Assistant automatique','Moteur habituel','Base documentaire locale','Simulation — pas OpenAI','INDIA · OpenAI réel']){
  const {label,bubble}=make(text);assert.equal(decorateIndiaReply(bubble,doc),true);assert.equal(label.nodes[0].src,'/assets/india-drawing.png');assert.equal(label.nodes[0].width,34);assert.equal(label.textContent,text);assert.equal(decorateIndiaReply(bubble,doc),false);assert.equal(label.nodes.length,1);
 }
 for(const {bubble,label} of [make('Vous',true),make('Vous · essai privé')]){assert.equal(decorateIndiaReply(bubble,doc),false);assert.equal(label.nodes.length,0);}
 const script=readFileSync(file,'utf8');assert.doesNotMatch(script,/fetch\(|localStorage|sessionStorage|innerHTML|Bearer|apiKey/);assert.match(script,/MutationObserver/);
});
