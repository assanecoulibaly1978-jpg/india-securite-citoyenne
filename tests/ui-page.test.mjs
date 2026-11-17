import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const p=new URL('../public/index.html',import.meta.url);
test('real directory UI exposes date, provenance and emergency contacts independently of search',()=>{
 assert.ok(fs.existsSync(p),'application page must exist');
 const html=fs.readFileSync(p,'utf8');
 for(const id of ['search-form','query','category','duty-date','results','chat-form','chat-log','sources-content','call-dialog'])assert.ok(html.includes(`id="${id}"`),id);
 for(const n of ['180','185','100','145'])assert.ok(html.includes(`data-number="${n}"`));
 assert.match(html,/non officiel/i);
 assert.match(html,/aria-live="polite"/);
 assert.doesNotMatch(html,/localStorage|sessionStorage|onload=|onclick=/i);
});
