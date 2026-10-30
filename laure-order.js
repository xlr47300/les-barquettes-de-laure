/* Module public : aucune clé secrète n'est exposée à la navigateur. */
window.LaureOrders = (() => {
  let configuration = null;
  let widgetId = null;
  let widgetNode = null;
  let error = null;
  const configPromise = fetch('/api/config', {cache:'no-store'})
    .then(async response => {if (!response.ok) throw Error('Configuration indisponible'); configuration=await response.json();return configuration;})
    .catch(e => {error=e;return null;});
  async function ensureWidget(){
    const cfg=await configPromise;
    const node=document.getElementById('laure-turnstile');
    if(!node||!cfg?.ordersEnabled||!cfg.turnstileSiteKey||!window.turnstile) return;
    if(widgetNode!==node){
      if(widgetId!==null){try{window.turnstile.remove(widgetId);}catch(e){}widgetId=null;}
      widgetNode=node;
    }
    if(widgetId===null) widgetId=window.turnstile.render(node,{sitekey:cfg.turnstileSiteKey,theme:'light'});
  }
  async function submit(order){
    const cfg=await configPromise;
    if(error)throw Error('La prise de commande est temporairement indisponible.');
    if(!cfg?.ordersEnabled)throw Error('Les commandes en ligne ne sont pas encore ouvertes. Contactez Laure directement.');
    await ensureWidget();
    if(widgetId===null||!window.turnstile)throw Error('La vérification de sécurité ne s’est pas chargée. Réessayez.');
    const token=window.turnstile.getResponse(widgetId);
    if(!token)throw Error('Veuillez terminer la vérification de sécurité avant d’envoyer votre demande.');
    try{
      const response=await fetch('/api/order',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...order,turnstileToken:token})});
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error(result.error||'Enregistrement impossible, aucune confirmation émise.');
      return result;
    } finally {
      try{window.turnstile.reset(widgetId);}catch(e){}
    }
  }
  return {ensureWidget,submit};
})();
