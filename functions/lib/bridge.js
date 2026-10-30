export const asJson = (data, status=200) => new Response(JSON.stringify(data), {
 status, headers: {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}
});
export async function callAppsScript(env, action, data={}) {
  const url=String(env.APPS_SCRIPT_URL||'');
  const secret=String(env.API_SHARED_SECRET||'');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url) || secret.length < 32) {
    throw Object.assign(new Error('Liaison Google non configurée'),{status:503});
  }
  const response=await fetch(url, {
    method:'POST',
    headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({secret, action, data}),
    redirect:'follow'
  });
  if (!response.ok) throw Object.assign(new Error(`Google indisponible (${response.status})`),{status:502});
  const raw=await response.text();
  let result;
  try { result=JSON.parse(raw); } catch(e) {throw Object.assign(new Error('Réponse Google non exploitable'),{status:502});}
  if (!result || result.ok !== true) {
    const message=String(result?.error||'Erreur de gestion').slice(0,240);
    throw Object.assign(new Error(message), {status:Number(result?.status)||422});
  }
  return result.data;
}
export async function readBody(request, maxBytes=18_000) {
  const len=Number(request.headers.get('content-length'));
  if (len > maxBytes) throw Object.assign(new Error('Demande trop volumineuse'),{status:413});
  if (!(request.headers.get('content-type')||'').includes('application/json'))
    throw Object.assign(new Error('Format JSON attendu'),{status:415});
  let value;
  try {value=await request.json();}catch(e){throw Object.assign(new Error('Données illisibles'),{status:400});}
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length>maxBytes)
    throw Object.assign(new Error('Demande invalide'),{status:400});
  return value;
}
export function handleError(error){return asJson({ok:false,error:error.status?error.message:'Service temporairement indisponible'},error.status||503);}
