// Internal server-only reader. It grants no HTTP access and accepts no tools,
// provider, payment or write capability. The private HTTP gate stays in server.js.
import {fileURLToPath} from 'node:url';
import {administrativeReferenceReply} from './knowledge.js';
const defaultDir=fileURLToPath(new URL('../../knowledge/',import.meta.url));
export function createAdministrativeKnowledge({dir=defaultDir}={}){
 return Object.freeze({
  reply(message,{previousId,previousLimitation}={}){
   if(typeof message!=='string'||!message.trim()||message.length>1000)return null;
   const result=administrativeReferenceReply(message,{dir,previousId,previousLimitation});
   if(!result)return null;
   const {knowledge,...view}=result;
   return {...view,reply:'À CONFIRMER — consultation documentaire privée.\n'+view.reply,administration:knowledge,verification:'documentary_reference_requires_confirmation'};
  }
 });
}
