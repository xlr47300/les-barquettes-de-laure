import {asJson} from '../lib/bridge.js';
export async function onRequestGet({env}) {
  return asJson({ok:true, ordersEnabled:env.ORDERS_ENABLED==='true' && Boolean(env.TURNSTILE_SECRET) && Boolean(env.TURNSTILE_SITE_KEY),
    turnstileSiteKey:String(env.TURNSTILE_SITE_KEY||'')});
}
