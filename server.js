import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chat} from './lib/assistant.js';
import {loadData,search,status} from './lib/directory.js';
import {headers,jsonBody,originGuard,limiter,staticFile,error} from './lib/http.js';
import {readAIConfig,loadServerEnvironment} from './lib/ai/config.js';
import {createAIService} from './lib/ai/service.js';
import {createPrivateTestGateway} from './lib/private-test.js';
import {loadIndiaPermit} from './lib/ai/india-permit.js';
const root=path.dirname(fileURLToPath(import.meta.url));

/** Public /api/chat stays stateless; the isolated, gated pilot owns ephemeral sessions. */
export function createServer({dataDir=path.join(root,'data'),publicDir=path.join(root,'public'),clock=()=>new Date(),rateLimit={},aiConfig=readAIConfig(process.env,root),aiProvider,aiLedgerFactory,privateTestGateway}={}){
 const limit=limiter(rateLimit);
 const pilotLimit=limiter({max:aiConfig.requestsPerMinute,windowMs:60000});
 const ai=createAIService({config:aiConfig,clock,provider:aiProvider,ledgerFactory:aiLedgerFactory});
 const server=http.createServer(async(req,res)=>{
  headers(res);
  const send=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://localhost');
   if(!url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method))throw error(405,'Méthode non autorisée.');
    return await staticFile(publicDir,url.pathname,req,res);
   }
   if(url.pathname==='/api/private-test'||url.pathname.startsWith('/api/private-test/')){
    if(!privateTestGateway)throw error(404,'Route introuvable.');
    return await privateTestGateway.handle(req,res,url,{send,jsonBody,loadData:()=>loadData(dataDir)});
   }
   if(url.pathname==='/api/assistant'||url.pathname.startsWith('/api/assistant/conversation/')){
    originGuard(req);ai.authorize(req);
    if(url.pathname==='/api/assistant'){
     if(req.method!=='POST')throw error(405,'Méthode non autorisée.');
     pilotLimit(req,res);
     const cancellation=new AbortController();
     const disconnected=()=>{if(!res.writableFinished)cancellation.abort();};
     res.once('close',disconnected);
     try{
      const body=await jsonBody(req),data=await loadData(dataDir);
      const answer=await ai.reply(body,data,{signal:cancellation.signal});
      if(!res.destroyed)return send(200,answer);
      return;
     }finally{res.removeListener('close',disconnected);}
    }
    if(req.method!=='DELETE')throw error(405,'Méthode non autorisée.');
    let id;try{id=decodeURIComponent(url.pathname.slice('/api/assistant/conversation/'.length));}catch{throw error(400,'Conversation invalide.');}
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id))throw error(400,'Conversation invalide.');
    ai.erase(id);return send(200,{ok:true});
   }
   if(url.pathname==='/api/chat'){
    if(req.method!=='POST')throw error(405,'Méthode non autorisée.');
    originGuard(req);limit(req,res);
    const body=await jsonBody(req),data=await loadData(dataDir);
    return send(200,chat(body,data,clock));
   }
   if(req.method!=='GET')throw error(405,'Méthode non autorisée.');
   if(url.pathname==='/api/health')return send(200,{ok:true});
   limit(req,res);
   const data=await loadData(dataDir);
   if(url.pathname==='/api/search')return send(200,search(data,url.searchParams,clock));
   if(url.pathname==='/api/status')return send(200,status(data,clock));
   if(url.pathname==='/api/sources')return send(200,{sources:data.sources,coverage:data.coverage,notice:'Couverture partielle, informations sourcées à confirmer auprès du service.'});
   if(url.pathname.startsWith('/api/record/')){
    let id;try{id=decodeURIComponent(url.pathname.slice(12));}catch{throw error(400,'Identifiant invalide.');}
    const record=data.records.find(r=>r.id===id);
    return send(record?200:404,record||{error:'Fiche introuvable.'});
   }
   send(404,{error:'Route introuvable.'});
  }catch(e){if(!res.headersSent)send(e.status||500,{error:e.status?e.message:'Erreur interne.'});else res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 server.on('close',()=>{ai.close();privateTestGateway?.close();});
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 loadServerEnvironment(path.join(root,'.env'));
 const host='127.0.0.1',port=Number(process.env.PORT||8780);
 try{
  const realConfig=readAIConfig(process.env,root);
  const realPermit=loadIndiaPermit(root,realConfig);
  // A future owner grant arms only this isolated private controller, never /api/chat
  // or the legacy pilot. Persistent environment enable flags remain untouched.
  const privateTestGateway=await createPrivateTestGateway({root,deferAccessFile:true,realConfig:{...realConfig,enabled:realPermit!==null,allowPaid:realPermit!==null},realPermit});
  const server=createServer({privateTestGateway});server.on('error',()=>{privateTestGateway.close();console.error('Démarrage impossible : vérifiez la configuration réseau.');process.exitCode=1;});
  server.listen(port,host,async()=>{
   try{await privateTestGateway.publishAccessFile();console.log(`Secours Citoyen: http://${host}:${server.address().port}`);}
   catch{server.close();console.error('Démarrage impossible : accès privé non préparé.');process.exitCode=1;}
  });
 }catch{console.error('Démarrage impossible : vérifiez les permissions et la configuration locale.');process.exitCode=1;}
}
