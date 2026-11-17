import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {createPrivateTestGateway} from '../lib/private-test.js';
import {readAIConfig} from '../lib/ai/config.js';
import {loadData} from '../lib/directory.js';
import {headers, jsonBody} from '../lib/http.js';

const project = path.resolve(import.meta.dirname, '..');
const scratch = '/Users/assane/.hermes/cache/scratch';
const opening = 'Je suis témoin d’un accident avec des blessés.';
const complete = 'Accident entre une moto et une voiture à Cocody, près du carrefour témoin HTTP. Deux blessés. Une fuite de carburant.';

// Exercise the actual private gateway, body parser and directory over HTTP.
// Deliberately do not import server.js, load .env or bind the development port.
async function fixture(t) {
  const root = await mkdtemp(path.join(scratch, 'accident-witness-http-'));
  let gateway, server;
  const providerRequests = [];
  t.after(async () => {
    try {
      if (server?.listening) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      try { gateway?.close(); }
      finally { await rm(root, {recursive: true, force: true}); }
    }
    assert.equal(providerRequests.length, 0, 'no accident narrative or later context may reach a provider');
  });
  gateway = await createPrivateTestGateway({
    root,
    knowledgeDir: path.join(project, 'knowledge'),
    realConfig: {...readAIConfig({}, root), enabled: false, allowPaid: false, apiKey: ''},
    realPermit: null,
    indiaProvider: async request => {
      providerRequests.push(request);
      throw new Error('Unexpected fictitious provider request');
    },
  });
  server = http.createServer(async (req, res) => {
    headers(res);
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    try {
      await gateway.handle(req, res, new URL(req.url, 'http://localhost'), {
        send, jsonBody, loadData: () => loadData(path.join(project, 'data')),
      });
    } catch (error) {
      send(error.status || 500, {error: error.status ? error.message : 'Erreur interne.'});
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.notEqual(server.address().port, 8780);
  const access = JSON.parse(await readFile(path.join(root, 'var/private-test-access.json'), 'utf8'));
  const commonHeaders = {Origin: base, 'x-private-test': '1', 'Content-Type': 'application/json'};
  async function owner() {
    const login = await fetch(base + '/api/private-test/login', {
      method: 'POST', headers: commonHeaders, body: JSON.stringify(access),
    });
    assert.equal(login.status, 200, 'local fixture login succeeds');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = async (route, method = 'GET', body) => {
      const response = await fetch(base + '/api/private-test/' + route, {
        method, headers: {...commonHeaders, cookie},
        ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      });
      return {status: response.status, body: await response.json()};
    };
    const message = async text => {
      // No state, report, conversation ID or previous messages sent by the client.
      const response = await request('message', 'POST', {message: text, simulation: false});
      assert.equal(response.status, 200);
      assert.equal(response.body.source, 'rules');
      assert.equal(response.body.openaiEnabled, false);
      assert.equal(response.body.real.authorized, false);
      assert.equal(response.body.cost.estimateUsd, 0);
      assert.equal(response.body.cost.sessionEstimateUsd, 0);
      assert.equal(response.body.state, undefined, 'protocol state stays server-side');
      assert.equal(response.body.conversationId, undefined);
      assert.equal(providerRequests.length, 0);
      return response.body;
    };
    return {request, message};
  }
  return {...await owner(), owner, providerRequests};
}

function witness(answer, situation = 'ongoing') {
  assert.equal(answer.answerType, 'protected_protocol');
  assert.equal(answer.verification, 'server_protocol');
  assert.equal(answer.dialogue.mission, 'urgences');
  assert.ok(answer.report, 'a declarative accident report is returned');
  assert.equal(answer.report.transmitted, false);
  assert.equal(answer.report.source, 'declarations_citoyen');
  assert.equal(answer.report.situation, situation);
  assert.deepEqual(Object.keys(answer.report.fields).sort(), ['description', 'hazards', 'location', 'victims']);
  assert.match(answer.report.title, /non transmis/i);
  return answer.report.fields;
}

test('HTTP existing Accident shortcut retains server context and adopts the witness flow on an injury answer',async t=>{
 const f=await fixture(t);await f.message('Accident');
 const answer=await f.message('Une voiture a heurté une moto à Cocody. Deux blessés, fuite de carburant.');
 const fields=witness(answer);assert.match(fields.location,/Cocody/);assert.match(fields.description,/voiture.*moto/i);assert.match(fields.victims,/2/);assert.match(fields.hazards,/carburant/);assert.doesNotMatch(answer.reply,/\?/);
});

test('HTTP manual witness phrase updates rescue presence, preserves Siporex and separates possible fire from the fuel leak',async t=>{
 const f=await fixture(t);
 const initial=await f.message('Accident entre une voiture et une moto à Yopougon, au carrefour Siporex. Trois blessés, fuite de carburant.');
 const before=witness(initial);assert.match(before.location,/Yopougon.*carrefour Siporex/);
 let answer=await f.message('Les pompiers sont maintenant sur place et prennent en charge les trois blessés.');
 assert.deepEqual(witness(answer,'onsite'),before);assert.equal(answer.report.incidentStatus,'ongoing');assert.equal(answer.report.rescueStatus,'onsite');assert.match(answer.reply,/Secours sur place, selon le témoin/);assert.doesNotMatch(answer.reply,/Appelez immédiatement|feu|fumée/i);assert.ok(answer.actions.some(a=>a.number==='180'));
 answer=await f.message('C’est au carrefour Siporex.');assert.deepEqual(witness(answer,'onsite'),before);
 answer=await f.message('Il y a un risque d’incendie.');witness(answer,'onsite');assert.deepEqual(answer.report.reportedHazards,['fuel']);assert.deepEqual(answer.report.possibleRisks,['fire']);assert.doesNotMatch(answer.reply,/Feu signalé/);
 answer=await f.message('Résumé');witness(answer,'onsite');assert.match(answer.report.fields.location,/Yopougon.*Siporex/);assert.deepEqual(answer.report.possibleRisks,['fire']);assert.doesNotMatch(answer.reply,/Appelez immédiatement/);
 assert.equal(f.providerRequests.length,0);
});

for(const location of ['Il y a un accident à Bingerville, près du Jardin botanique.','À Bingerville, près du Jardin botanique.'])test('HTTP unknown-victim accident keeps continuity through a place follow-up, responders and residual traffic: '+location,async t=>{
 const f=await fixture(t);let answer=await f.message('Il y a un accident.');witness(answer);
 answer=await f.message(location);assert.match(witness(answer).location,/Bingerville.*Jardin botanique/);assert.doesNotMatch(answer.reply,/Y a-t-il des blessés/);
 answer=await f.message('Les pompiers sont déjà sur place.');const prior=witness(answer,'onsite');assert.match(prior.victims,/inconnu/);assert.doesNotMatch(answer.reply,/Appelez immédiatement|Y a-t-il des blessés/);
 answer=await f.message("L'intervention est terminée, mais il y a un gros embouteillage.");const fields=witness(answer,'traffic');assert.equal(answer.report.incidentStatus,'finished');assert.equal(answer.report.rescueStatus,'onsite');assert.equal(answer.report.trafficStatus,'congested');assert.deepEqual(fields,prior);assert.doesNotMatch(answer.reply,/Appelez immédiatement|Y a-t-il des blessés/);
 answer=await f.message('La voie vers Abidjan est bloquée.');witness(answer,'traffic');assert.match(answer.report.trafficDetail,/voie vers Abidjan/);assert.doesNotMatch(answer.reply,/\?/);assert.equal(f.providerRequests.length,0);
 assert.equal((await f.request('conversation','DELETE')).status,200);answer=await f.message('Il y a un accident.');assert.match(witness(answer).location,/inconnu/);assert.equal(answer.report.trafficStatus,'not_reported');assert.equal(answer.report.rescueStatus,'not_reported');assert.doesNotMatch(JSON.stringify(answer),/Jardin botanique/);
});

test('HTTP exact multi-fact renverser message retains evacuation and blocked traffic without a paid provider',async t=>{
 const f=await fixture(t);const message='Un camion vient de renverser un motocycliste à Cocody. Les pompiers sont arrivés et ont évacué le blessé. Maintenant, la route est complètement bloquée.';
 let answer=await f.message(message);let fields=witness(answer,'traffic');assert.match(fields.description,/camion.*motocycliste/i);assert.match(fields.location,/Cocody/);assert.match(fields.victims,/^1 /);assert.equal(answer.report.careStatus,'evacuated');assert.equal(answer.report.evacuatedCount,1);assert.equal(answer.report.trafficStatus,'blocked');assert.equal(answer.report.incidentStatus,'ongoing');assert.equal(answer.report.sceneSafety,'not_confirmed');assert.match(answer.reply,/secteur exact/);assert.doesNotMatch(answer.reply,/Appelez immédiatement|Contactez maintenant/);
 answer=await f.message('Au carrefour de la Riviera 2.');fields=witness(answer,'traffic');assert.match(fields.location,/Cocody.*Riviera 2/);assert.equal(answer.report.careStatus,'evacuated');assert.match(answer.reply,/sens de circulation/);
 answer=await f.message('Vers le Plateau.');witness(answer,'traffic');assert.match(answer.report.trafficDetail,/Plateau/);assert.equal(answer.report.careStatus,'evacuated');assert.doesNotMatch(answer.reply,/\?|Appelez immédiatement/);
 answer=await f.message('Maintenant il y a du feu.');witness(answer);assert.ok(answer.reply.startsWith('180'));assert.equal(answer.report.careStatus,'not_reported');assert.equal(f.providerRequests.length,0);
 assert.equal((await f.request('conversation','DELETE')).status,200);answer=await f.message('Il y a un accident.');witness(answer);assert.equal(answer.report.careStatus,'not_reported');assert.equal(answer.report.trafficStatus,'not_reported');assert.doesNotMatch(JSON.stringify(answer),/Riviera|Plateau/);
});

async function filled(f) {
  const answer = await f.message(complete);
  const fields = witness(answer);
  assert.match(fields.location, /Cocody.*carrefour témoin HTTP/i);
  assert.match(fields.description, /moto.*voiture/i);
  assert.match(fields.victims, /2/);
  assert.match(fields.hazards, /carburant/i);
  return fields;
}

test('HTTP witness opening is local, urgent and explicitly not transmitted', async t => {
  const f = await fixture(t);
  const answer = await f.message(opening);
  const fields = witness(answer);
  assert.ok(answer.actions.some(action => action.type === 'call' && action.number === '180'));
  assert.match(answer.reply, /ne retardez pas l’appel/i);
  assert.match(answer.reply, /aucun service/i);
  assert.match(answer.reply, /où.*accident/i);
  for (const value of Object.values(fields)) assert.match(value, /inconnu|non renseigné/i);
});

test('HTTP witness follow-ups recover all four fields from server context without client state', async t => {
  const f = await fixture(t);
  await f.message(opening);
  let fields = witness(await f.message('À Cocody, près du carrefour témoin HTTP.'));
  assert.match(fields.location, /Cocody/i);
  fields = witness(await f.message('Une moto et une voiture.'));
  assert.match(fields.description, /moto.*voiture/i);
  fields = witness(await f.message('Deux blessés.'));
  assert.match(fields.victims, /2/);
  const answer = await f.message('Une fuite de carburant.');
  fields = witness(answer);
  assert.match(fields.location, /Cocody/i);
  assert.match(fields.description, /moto.*voiture/i);
  assert.match(fields.victims, /2/);
  assert.match(fields.hazards, /carburant/i);
  assert.match(answer.reply, /Signalement préparé.*non transmis/i);
});

test('HTTP witness accepts unknown observations without fabricating a victim count', async t => {
  const f = await fixture(t);
  await f.message(opening);
  await f.message('À Cocody.');
  await f.message('Une moto et une voiture.');
  const fields = witness(await f.message('Je ne sais pas.'));
  assert.match(fields.victims, /inconnu|non observé/i);
  assert.doesNotMatch(fields.victims, /\d/);
});

test('HTTP witness corrects the location while preserving other reported facts', async t => {
  const f = await fixture(t);
  const before = await filled(f);
  const fields = witness(await f.message('Correction : le lieu est à Yopougon, près du carrefour correction HTTP.'));
  assert.match(fields.location, /Yopougon.*correction HTTP/i);
  assert.doesNotMatch(fields.location, /Cocody/i);
  for (const key of ['description', 'victims', 'hazards']) assert.equal(fields[key], before[key]);
});

test('HTTP witness corrects the victim count rather than retaining a negated former count', async t => {
  const f = await fixture(t);
  const before = await filled(f);
  const fields = witness(await f.message('Correction : trois blessés, pas deux.'));
  assert.match(fields.victims, /3/);
  assert.doesNotMatch(fields.victims, /2/);
  for (const key of ['description', 'location', 'hazards']) assert.equal(fields[key], before[key]);
});

test('HTTP rejects every client-owned accident/context injection and keeps genuine server facts', async t => {
  const f = await fixture(t);
  await filled(f);
  const injected = {version: 2, situation: 'finished', fields: {location: 'CLIENT_FORGED_LOCATION'}};
  for (const key of ['state', 'accident', 'citizenState', 'citizenContext', 'mission', 'conversationId', 'report']) {
    const response = await f.request('message', 'POST', {
      message: 'Merci', simulation: false,
      [key]: key === 'state' ? {accident: injected} : injected,
    });
    assert.equal(response.status, 400, key + ' is not an allowed HTTP input');
  }
  const answer = await f.message('Merci');
  assert.match(witness(answer).location, /Cocody/i);
  assert.doesNotMatch(JSON.stringify(answer), /CLIENT_FORGED_LOCATION/);
});

for (const [situation, message] of [
  ['called', 'Les secours ont déjà été appelés.'],
  ['onsite', 'Les pompiers sont déjà sur place.'],
  ['finished', 'L’intervention est terminée.'],
  // A traffic-only update must explicitly resolve the previously reported injured people/danger.
  ['traffic', 'L’intervention est terminée. Il reste seulement un problème de circulation.'],
]) {
  test('HTTP witness records rescue status ' + situation + ' without restarting the emergency call', async t => {
    const f = await fixture(t);
    const before = await filled(f);
    const answer = await f.message(message);
    const fields = witness(answer, situation);
    assert.deepEqual(fields, before, 'a status update does not overwrite observations');
    assert.doesNotMatch(answer.reply, /appelez immédiatement|appelez maintenant|ne retardez pas l’appel/i);
    assert.doesNotMatch(answer.reply, /INDIA a (?:contacté|appelé)|secours (?:envoyés|dépêchés)/i);
  });
}

test('HTTP witness does not mistake a negated rescue call for an already-called status', async t => {
  const f = await fixture(t);
  await filled(f);
  const answer = await f.message('Non, les secours ne sont pas encore appelés.');
  witness(answer);
  assert.match(answer.reply, /180/);
  assert.match(answer.reply, /appelez immédiatement|appelez maintenant/i);
});

test('HTTP conversation deletion erases accident context and allows a clean new accident', async t => {
  const f = await fixture(t);
  await filled(f);
  const erased = await f.request('conversation', 'DELETE');
  assert.equal(erased.status, 200);
  assert.equal(erased.body.ok, true);
  const continuation = await f.message('Merci');
  assert.equal(continuation.report, undefined);
  assert.doesNotMatch(JSON.stringify(continuation), /carrefour témoin HTTP|Cocody|carburant/);
  const fresh = witness(await f.message(opening));
  for (const value of Object.values(fresh)) assert.match(value, /inconnu|non renseigné/i);
});

test('HTTP logout invalidates the former owner and a new login has no accident context', async t => {
  const f = await fixture(t);
  await filled(f);
  assert.equal((await f.request('session', 'DELETE')).status, 200);
  assert.equal((await f.request('message', 'POST', {message: 'Merci', simulation: false})).status, 403);
  const newOwner = await f.owner();
  const answer = await newOwner.message('Merci');
  assert.equal(answer.report, undefined);
  assert.doesNotMatch(JSON.stringify(answer), /carrefour témoin HTTP|Cocody|carburant/);
});

test('HTTP accident reports are owner-isolated and deleting one owner preserves the other', async t => {
  const f = await fixture(t);
  const other = await f.owner();
  await filled(f);
  const outside = await other.message('Merci');
  assert.equal(outside.report, undefined);
  assert.doesNotMatch(JSON.stringify(outside), /carrefour témoin HTTP|Cocody|carburant/);
  await other.message('Accident entre un bus et un taxi à Bouaké, près du carrefour autre propriétaire HTTP. Trois blessés. Une fumée épaisse.');
  const first = witness(await f.message('Merci'));
  assert.match(first.location, /Cocody/i);
  assert.doesNotMatch(first.location, /Bouaké/i);
  assert.match(first.victims, /2/);
  assert.equal((await f.request('conversation', 'DELETE')).status, 200);
  const second = witness(await other.message('Merci'));
  assert.match(second.location, /Bouaké/i);
  assert.match(second.victims, /3/);
  assert.match(second.hazards, /fumée/i);
  assert.doesNotMatch(second.location, /Cocody/i);
});

test('HTTP accident then explicit prevention topic never dispatches narrative or context to a provider', async t => {
  const f = await fixture(t);
  await filled(f);
  const answer = await f.message('Nouveau sujet : comment prévenir les arnaques en ligne ?');
  assert.equal(answer.dialogue.mission, 'prevention');
  assert.equal(answer.dialogue.topic, 'online_safety');
  assert.equal(answer.report, undefined);
  assert.doesNotMatch(answer.reply, /carrefour témoin HTTP|Cocody|carburant/);
  assert.deepEqual(f.providerRequests, []);
});
