import {asJson,callAppsScript,handleError,readBody} from '../lib/bridge.js';
export async function onRequestPost({request,env}) {
  try {
    if(env.ORDERS_ENABLED!=='true' || !env.TURNSTILE_SECRET || !env.TURNSTILE_SITE_KEY)
      throw Object.assign(new Error('Les commandes en ligne ne sont pas encore ouvertes.'),{status:503});
    const origin=request.headers.get('Origin');
    if (origin !== new URL(request.url).origin) throw Object.assign(new Error('Origine de la demande invalide'),{status:403});
    const body=await readBody(request);
    if(body.website) throw Object.assign(new Error('Demande non acceptée'),{status:400});
    if (!body.turnstileToken) throw Object.assign(new Error('Vérification de sécurité manquante'),{status:400});
    const form=new URLSearchParams({secret:env.TURNSTILE_SECRET,response:String(body.turnstileToken),remoteip:request.headers.get('CF-Connecting-IP')||''});
    const challenge=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',body:form});
    const checked=await challenge.json();
    if(!challenge.ok || !checked.success) throw Object.assign(new Error('Vérification de sécurité échouée. Réessayez.'),{status:403});
    if (checked.hostname !== new URL(request.url).hostname) throw Object.assign(new Error('Origine de vérification incorrecte'),{status:403});
    const {turnstileToken,website,...order}=body;
    const data=await callAppsScript(env,'order',order);
    return asJson({ok:true,...data},201);
  } catch(error){return handleError(error);}
}
export function onRequestGet(){return asJson({ok:false,error:'Méthode non autorisée'},405);}
