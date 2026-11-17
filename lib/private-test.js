import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,chmod,open,rename,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import {error} from './http.js';
import {createAIService} from './ai/service.js';
import {readAIConfig} from './ai/config.js';
import {createIndiaConversation} from './ai/india.js';
import {prepareCitizenTurn,finishCitizenTurn} from './ai/citizen-dialogue.js';
import {createCniReference} from './ai/cni-reference.js';
import {chat} from './assistant.js';
import {leavesWitnessFlow} from './accident-witness.js';
import {classifyCitizenMessage} from './ai/routing.js';
import {isAdministrativeInformationQuery} from './ai/knowledge.js';

const COOKIE='private_test_session';
const TTL=30*60*1000;
const cost=()=>({estimateUsd:0,sessionEstimateUsd:0,dailyLimitUsd:1,monthlyLimitUsd:2});
const cookie=(id,maxAge=1800)=>`${COOKIE}=${id}; HttpOnly; SameSite=Strict; Path=/api/private-test; Max-Age=${maxAge}`;

/** Only the local CLI opts in. The access file is never part of publicDir. */
export async function createPrivateTestGateway({root,clock=()=>new Date(),maxSessions=100,knowledgeDir=path.join(root,'knowledge'),deferAccessFile=false,realConfig=readAIConfig({},root),realPermit=null,indiaProvider,indiaLedgerFactory,indiaConversation}={}){
 const directory=path.join(root,'var');
 async function checkDirectory(){
  await mkdir(directory,{recursive:true,mode:0o700});
  const info=await lstat(directory);
  if(info.isSymbolicLink()||!info.isDirectory()||(typeof process.getuid==='function'&&info.uid!==process.getuid()))throw error(503,'Dossier privé non autorisé.');
  await chmod(directory,0o700);
 }
 await checkDirectory();
 const accessKey=randomBytes(32).toString('hex');let published=false;
 async function publishAccessFile(){
  if(published)return;
  await checkDirectory();
  // Publish only after a successful CLI bind; a duplicate must not rotate the live key.
  // Atomic replacement never truncates or follows an existing access-file link.
  const temporary=path.join(directory,`.private-test-${randomBytes(16).toString('hex')}`);
  const file=await open(temporary,'wx',0o600);
  try{
   try{await file.writeFile(JSON.stringify({accessKey})+'\n');await file.sync();}finally{await file.close();}
   await rename(temporary,path.join(directory,'private-test-access.json'));published=true;
  }finally{await rm(temporary,{force:true});}
 }
 if(!deferAccessFile)await publishAccessFile();
 const ai=createAIService({config:{...readAIConfig({},root),enabled:false,allowPaid:false,apiKey:'',knowledgeDir,maxSessions,sessionTtlMs:TTL},clock});
 const india=indiaConversation||createIndiaConversation({root,config:realConfig,permit:realPermit,provider:indiaProvider,ledgerFactory:indiaLedgerFactory,clock});
 const cniReference=createCniReference({dir:knowledgeDir});
 const sessions=new Map();let loginWindow={start:0,count:0};
 const now=()=>clock().getTime();
 const clear=(s,reason='cleared')=>{india.end(s.ownerId,reason);s.generation=(s.generation||0)+1;for(const c of s.requests||[])c.abort();s.requests?.clear();s.pending?.abort();s.pending=null;if(s.conversationId)ai.erase(s.conversationId);s.conversationId=null;s.citizenState={};s.witnessActive=false;s.simulationStage=0;};
 const sweep=()=>{for(const [id,s] of sessions)if(s.expires<=now()||s.last+TTL<=now()){clear(s);sessions.delete(id);}};
 const timer=setInterval(sweep,60000);timer.unref();
 const costFor=(s,currentAttempt=false)=>{const c=india.cost(s.ownerId);return c.sessionEstimateUsd>0?{...c,lastCallEstimateUsd:c.estimateUsd,estimateUsd:currentAttempt?c.estimateUsd:0}:cost();};
 const status=s=>({assistantName:'INDIA',authenticated:true,openaiEnabled:india.status(s.ownerId).authorized,simulationAvailable:true,cost:costFor(s),real:india.status(s.ownerId),localGeneralAllowed:s.localGeneralAllowed===true,expiresAt:new Date(s.expires).toISOString()});
 function endedNotice(s,currentAttempt=false){
  const real=india.status(s.ownerId),labels={expired:'La session OpenAI a expiré.',quota_exhausted:'Les trois appels OpenAI autorisés ont été utilisés.',budget_exhausted:'Un plafond ou une réservation financière empêche de poursuivre.',safety_boundary:'La conversation OpenAI a été interrompue pour donner priorité à la sécurité.',local_boundary:'La conversation OpenAI est fermée après une recherche dans l’annuaire.',administrative_boundary:'La conversation OpenAI est fermée après une démarche administrative.',sensitive_boundary:'La conversation OpenAI est fermée pour traiter une demande sensible.',cleared:'La conversation OpenAI a été effacée.',manual_local:'Vous avez choisi le mode local.'};
  const prefix=labels[real.endReason]||'La session OpenAI est interrompue.';
  return {assistantName:'INDIA',source:'session',answerType:'session_ended',blocked:true,openaiEnabled:false,mode:'session_ended',real,localGeneralAllowed:s.localGeneralAllowed===true,cost:costFor(s,currentAttempt),reply:prefix+(currentAttempt?' Aucune réponse IA exploitable ne peut être fournie pour cette tentative.':' Ce message général n’a pas été envoyé à OpenAI.')+' Le contexte conversationnel est fermé. Les urgences, l’annuaire et les démarches restent disponibles. Vous pouvez choisir explicitement de continuer en mode local.',warnings:currentAttempt?['Essai arrêté sans relance automatique ; le coût ou la provision de cette tentative reste conservé.']:[],actions:[],sources:[]};
 }
 async function handle(req,res,url,{send,jsonBody,loadData}){
  const host=req.headers.host,port=req.socket.localPort;
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||![`127.0.0.1:${port}`,`localhost:${port}`,...(port===80?['127.0.0.1','localhost']:[])].includes(host))throw error(403,'Hôte local refusé.');
  if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin!==`http://${host}`||req.headers['x-private-test']!=='1'||req.headers['sec-fetch-site']==='cross-site'))throw error(403,'Origine privée requise.');
  if(!published)throw error(503,'Préparation de l’accès privé en cours.');
  sweep();
  if(url.pathname==='/api/private-test/login'&&req.method==='POST'){
   if(now()-loginWindow.start>=60000)loginWindow={start:now(),count:0};
   if(++loginWindow.count>10){res.setHeader('Retry-After','60');throw error(429,'Trop de tentatives.');}
   const body=await jsonBody(req);
   if(!body||Array.isArray(body)||typeof body.accessKey!=='string'||Object.keys(body).some(k=>k!=='accessKey'))throw error(400,'Clé locale requise.');
   const supplied=Buffer.from(body.accessKey),expected=Buffer.from(accessKey);
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw error(403,'Accès privé refusé.');
   if(sessions.size>=maxSessions)throw error(503,'Trop de sessions locales.');
   const id=randomBytes(32).toString('hex'),s={ownerId:id,last:now(),expires:now()+TTL,citizenState:{},simulationStage:0,requests:new Set(),hadReal:false,localGeneralAllowed:false};sessions.set(id,s);
   res.setHeader('Set-Cookie',cookie(id));return send(200,status(s));
  }
  const id=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const session=sessions.get(id);
  if(!session||session.expires<=now())throw error(403,'Authentification locale requise.');
  session.last=now();
  if(url.pathname==='/api/private-test/status'&&req.method==='GET')return send(200,status(session));
  if(url.pathname==='/api/private-test/real-session'&&req.method==='POST'){
   const grantGeneration=session.generation||0;
   const body=await jsonBody(req);
   if((session.generation||0)!==grantGeneration)throw error(409,'Confirmation interrompue par l’effacement.');
   if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.acknowledgeCost!==true)throw error(400,'Confirmation explicite des frais requise.');
   if(sessions.get(id)!==session||session.expires<=now())throw error(403,'Session expirée.');
   try{
    if(!india.status(id).authorized){
     if(!india.status(id).available)throw error(403,'Autorisation propriétaire absente.');
     // Start the paid lease from a clean generation. An earlier free request
     // must never become billable merely because its upload finishes later.
     clear(session);
    }
    india.authorize(id,{acknowledgeCost:true});session.hadReal=true;session.localGeneralAllowed=false;
   }catch{throw error(403,'Une autorisation propriétaire préalable est nécessaire. Aucun appel OpenAI effectué.');}
   return send(200,status(session));
  }
  if(url.pathname==='/api/private-test/local-mode'&&req.method==='POST'){
   const generation=session.generation||0,body=await jsonBody(req);
   if((session.generation||0)!==generation||sessions.get(id)!==session||session.expires<=now())throw error(409,'Choix local interrompu.');
   if(!body||Array.isArray(body)||Object.keys(body).length!==1||body.enabled!==true)throw error(400,'Choix explicite du mode local requis.');
   clear(session,'manual_local');session.localGeneralAllowed=true;india.recordDecision?.(id,'local_selected','manual_local');
   return send(200,status(session));
  }
  if(req.method==='DELETE'&&['/api/private-test/conversation','/api/private-test/session'].includes(url.pathname)){
   clear(session,url.pathname.endsWith('/session')?'logout':'cleared');
   if(url.pathname.endsWith('/session')){sessions.delete(id);res.setHeader('Set-Cookie',cookie('',0));}
   return send(200,{ok:true,cost:costFor(session),real:india.status(id),openaiEnabled:false,localGeneralAllowed:session.localGeneralAllowed===true});
  }
  if(url.pathname==='/api/private-test/message'&&req.method==='POST'){
   if(session.requests.size>=2){
    // Admit the newest bounded request rather than reject an unread emergency.
    // Prefer cancelling an unfinished upload over an active generation.
    const victim=[...session.requests].find(c=>c!==session.pending)||session.requests.values().next().value;
    victim.preempt();session.requests.delete(victim);
   }
   const controller=new AbortController();let generation=session.generation||0;session.requests.add(controller);
   controller.preempt=()=>{
    controller.abort();
    if(!res.headersSent&&!res.destroyed){
     res.once('finish',()=>{if(!req.complete)req.destroy();});
     send(409,{error:'Message antérieur interrompu pour traiter la nouvelle demande.'});
    }
   };
   const active=()=>!controller.signal.aborted&&sessions.get(id)===session&&(session.generation||0)===generation&&session.expires>now();
   const disconnected=()=>{if(!res.writableFinished)controller.abort();};res.once('close',disconnected);
   try{
    const body=await jsonBody(req);
    if(!active())throw error(409,'Réponse interrompue.');
    if(!body||Array.isArray(body)||typeof body.message!=='string'||!body.message.trim()||body.message.length>1000||typeof body.simulation!=='boolean'||Object.keys(body).some(k=>!['message','simulation'].includes(k)))throw error(400,'Message privé invalide.');
    const data=await loadData();if(!active())throw error(409,'Réponse interrompue.');
    const baseline=chat({message:body.message,state:{}},data,clock);
    const protectedFlow=['emergency','accident','plainte','constat'].includes(baseline.intent)||Boolean(session.witnessActive&&!leavesWitnessFlow(body.message));
    const deterministicPriority=protectedFlow||baseline.intent!=='other'||classifyCitizenMessage(body.message)!=='general'||isAdministrativeInformationQuery(body.message);
    const category=classifyCitizenMessage(body.message);
    const boundaryReason=protectedFlow?'safety_boundary':category==='sensitive'?'sensitive_boundary':category==='local_search'||['pharmacy','police','gendarmerie','fire'].includes(baseline.intent)?'local_boundary':category==='official_information'||isAdministrativeInformationQuery(body.message)?'administrative_boundary':'sensitive_boundary';
    const fenceBoundary=(reason=boundaryReason)=>{
     india.end(id,reason);
     for(const c of session.requests)if(c!==controller)c.abort();
     // Every deterministic boundary invalidates older confirmations, even
     // when no generation is currently pending (e.g. a partial consent body).
     session.generation=(session.generation||0)+1;generation=session.generation;

    };
    if(session.pending&&session.pending!==controller&&!deterministicPriority)throw error(409,'Une réponse est déjà en préparation.');
    if(deterministicPriority)fenceBoundary();
    session.pending=controller;
    const turn=prepareCitizenTurn(body.message,protectedFlow?{}:session.citizenState,{protectedFlow});
    if(turn.resetLocalContext&&session.conversationId){ai.erase(session.conversationId);session.conversationId=null;}
    const prepared=protectedFlow?body.message:turn.message;
    let answer=await ai.reply({message:prepared,...(session.conversationId?{conversationId:session.conversationId}:{})},data,{signal:controller.signal});
    if(!active()){ai.erase(answer.conversationId);throw error(409,'Réponse interrompue.');}
    session.conversationId=answer.conversationId;
    session.witnessActive=answer.report?.kind==='accident_witness';
    const dialogue=finishCitizenTurn(answer,turn,{cniReference});
    answer=dialogue.answer;session.citizenState=dialogue.state;
    if(!deterministicPriority&&['official_information','local_search','safety_orientation','protected_protocol'].includes(answer.answerType))fenceBoundary(answer.answerType==='official_information'?'administrative_boundary':answer.answerType==='local_search'?'local_boundary':'safety_boundary');
    const {conversationId,...view}=answer;
    let source=answer.answerType==='official_information'&&answer.knowledge?'documentation':'rules';
    const realBefore=india.status(id),general=answer.answerType==='general'&&answer.fallback==='disabled';
    if(general&&(realBefore.state==='ended'||session.hadReal)&&!realBefore.authorized&&!session.localGeneralAllowed){
     india.recordDecision?.(id,'general_blocked',realBefore.endReason||'cancelled');return send(200,endedNotice(session));
    }
    if(general&&!turn.inScope){
     india.recordDecision?.(id,'local_routed','none');
     return send(200,{...view,source:'rules',answerType:'scope_orientation',reply:'Je me limite à l’assistance citoyenne, la prévention, les urgences et les alertes en Côte d’Ivoire. Quel besoin dans ce cadre souhaitez-vous aborder ?',assistantName:'INDIA',cost:costFor(session),real:india.status(id),openaiEnabled:false,localGeneralAllowed:session.localGeneralAllowed===true});
    }
    if(body.simulation&&general&&!realBefore.authorized&&!session.localGeneralAllowed){
     source='simulation';
     if(session.simulationStage===0){view.reply='Bonjour, je suis INDIA. Je peux vous aider à clarifier votre besoin. Par quoi souhaitez-vous commencer ?';session.simulationStage=1;}
     else{view.reply='Avançons une étape à la fois. Quel point souhaitez-vous préciser ?';session.simulationStage++;}
     view.warnings=[...(view.warnings||[]),'Démonstration locale à réponses fixes : pas une réponse générée, aucun appel à OpenAI.'];
    }
    if(general&&realBefore.authorized){
     const usedBefore=realBefore.usedRequests||0;
     try{
      const realAnswer=await india.reply(id,body.message,{data,signal:controller.signal,citizenContext:session.citizenState});
      if(!active())throw error(409,'Réponse interrompue.');
      return send(200,{...view,...realAnswer,assistantName:'INDIA',source:'openai',mode:'ai',openaiEnabled:true,real:india.status(id),cost:costFor(session,true),localGeneralAllowed:false});
     }catch{
      if(!active())throw error(409,'Réponse interrompue.');
      if(india.status(id).state!=='ended')india.end(id,'cancelled');
      return send(200,endedNotice(session,(india.status(id).usedRequests||0)>usedBefore));
     }
    }
    if(source!=='simulation')india.recordDecision?.(id,'local_routed',deterministicPriority?boundaryReason:'manual_local');
    return send(200,{...view,assistantName:'INDIA',source,cost:costFor(session),real:india.status(id),openaiEnabled:false,localGeneralAllowed:session.localGeneralAllowed===true});
   }finally{res.removeListener('close',disconnected);session.requests.delete(controller);if(session.pending===controller)session.pending=null;}
  }
  throw error(404,'Route privée introuvable.');
 }
 return {handle,publishAccessFile,close(){clearInterval(timer);for(const s of sessions.values())clear(s);sessions.clear();ai.close();india.close();}};
}
