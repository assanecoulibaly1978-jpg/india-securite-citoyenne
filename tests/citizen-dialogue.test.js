import test from 'node:test';
import assert from 'node:assert/strict';
import * as dialogue from '../lib/ai/citizen-dialogue.js';
import {prepareCitizenTurn,finishCitizenTurn} from '../lib/ai/citizen-dialogue.js';
test('a limited supported procedure stays on the same request instead of suggesting another procedure',()=>{
 const turn=prepareCitizenTurn('Je voudrais renouveler mon passeport.');
 const answer={answerType:'official_information',reply:'Référence insuffisante.',sources:[],knowledge:{procedureId:'passeport',status:'insufficient_scope',scopeLimitation:'Variante non vérifiée.',facts:[]}};
 const done=finishCitizenTurn(answer,turn);assert.equal(done.answer.dialogue.procedureId,'passeport');assert.equal(done.answer.dialogue.application,'renewal');assert.doesNotMatch(done.answer.reply,/autre démarche/i);assert.match(done.answer.reply,/confirmer/i);assert.deepEqual(done.answer.knowledge,answer.knowledge);
});

test('an explicit correction replaces rather than repeats the old renewal reason',()=>{
 const previous={documentary:{procedureId:'cni',application:'renewal'},reason:'expired'};
 assert.equal(prepareCitizenTurn('Non, elle n’est pas expirée, elle est détériorée.',previous).state.reason,'damaged');
 assert.equal(prepareCitizenTurn('Elle n’est pas encore expirée.',previous).state.reason,undefined);
 assert.equal(prepareCitizenTurn('Elle est expirée et perdue.',previous).state.reason,undefined);
});

test('model context is a bounded allowlist, never raw citizen data or permission for official claims',()=>{
 assert.equal(typeof dialogue.buildCitizenModelContext,'function');
 const state={mission:'assistance_citoyenne',documentary:{procedureId:'cni',application:'renewal',profile:'adult',cursor:12,privateNote:'PRIVATE-CONTENT'},reason:'expired',awaiting:'verification',rawMessage:'PRIVATE-CONTENT',phone:'PRIVATE-CONTENT',history:['PRIVATE-CONTENT'],token:'PRIVATE-CONTENT'};
 const context=dialogue.buildCitizenModelContext(state);assert.equal(context.country,'CI');assert.equal(context.procedureId,'cni');assert.equal(context.application,'renewal');assert.equal(context.reason,'expired');assert.equal(context.administrativeFactsAllowed,false);assert.equal(context.externalActionsAllowed,false);assert.deepEqual(context.allowedTasks,['clarify','rephrase']);assert.ok(JSON.stringify(context).length<1000);assert.doesNotMatch(JSON.stringify(context),/PRIVATE-CONTENT|cursor|history|token|phone/);
 assert.equal(dialogue.buildCitizenModelContext({mission:'urgences'}),null);
 let accessed=false;assert.doesNotThrow(()=>dialogue.buildCitizenModelContext({get documentary(){accessed=true;throw Error('no');}}));assert.equal(accessed,false);
});

test('the server layer scopes the four missions and preserves a prevention topic across a follow-up',()=>{
 assert.equal(prepareCitizenTurn('CNI').state.mission,'assistance_citoyenne');
 const prevention=prepareCitizenTurn('Comment prévenir les arnaques en ligne ?');assert.equal(prevention.state.mission,'prevention');assert.equal(prevention.state.topic,'online_safety');
 const next=prepareCitizenTurn('Et pour les enfants ?',prevention.state);assert.equal(next.state.mission,'prevention');assert.equal(next.state.topic,'online_safety');assert.equal(next.state.audience,'children');
 assert.equal(prepareCitizenTurn('Je veux vérifier une alerte dans mon quartier.').state.mission,'alertes');
 assert.equal(prepareCitizenTurn('Accident avec des blessés',{}, {protectedFlow:true}).state.mission,'urgences');
 const outside=prepareCitizenTurn('Donne une recette de riz.');assert.equal(outside.inScope,false);
 const reset=prepareCitizenTurn('Nouveau sujet : comment prévenir les arnaques en ligne ?', {documentary:{procedureId:'cni',application:'renewal'},reason:'expired'});assert.equal(reset.resetLocalContext,true);assert.deepEqual(reset.state.documentary,{});
});
