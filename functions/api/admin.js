import {asJson,callAppsScript,handleError,readBody} from '../lib/bridge.js';
export async function onRequestGet({env,data}) {
  try {if(!data.laureAdmin) throw Object.assign(new Error('Accès refusé'),{status:403});
    return asJson({ok:true,...await callAppsScript(env,'snapshot')});
  } catch(error){return handleError(error);}
}
export async function onRequestPost({request,env,data}) {
  try {
    if(!data.laureAdmin) throw Object.assign(new Error('Accès refusé'),{status:403});
    const origin=request.headers.get('Origin');
    if (origin !== new URL(request.url).origin) throw Object.assign(new Error('Origine incorrecte'),{status:403});
    const body=await readBody(request);
    if (!['status','payment','product','manualOrder','slot','slotCreate','productCreate'].includes(body.action))
      throw Object.assign(new Error('Opération non autorisée'),{status:400});
    return asJson({ok:true,...await callAppsScript(env,body.action,body)});
  } catch(error){return handleError(error);}
}
