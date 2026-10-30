const state={page:'accueil',data:null,query:'',status:'Toutes',date:'Toutes',busy:false};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eur=value=>Number(value||0).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
const shortDate=value=>{const d=new Date(String(value||'')+'T12:00:00');return Number.isNaN(d.valueOf())?value:d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});};
const statusClass=v=>v==='Annulée'?'red':v==='Prête'||v==='Retirée'?'green':v==='À confirmer'?'orange':'gray';
let timer;
function notice(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>el.classList.remove('show'),4200);}
async function api(payload){
  const opts=payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{method:'GET'};
  const response=await fetch('/api/admin',{...opts,credentials:'same-origin',cache:'no-store'});
  let body;try{body=await response.json();}catch{throw Error('Réponse du serveur indisponible : vérifier la connexion privée.');}
  if(!response.ok||!body.ok)throw Error(body.error||`Erreur ${response.status}`);
  return body;
}
async function refresh(silent=false){
  try{const result=await api();state.data=result;$('#updated').textContent='Actualisé '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});render();if(!silent)notice('Données actualisées');}
  catch(error){$('#main').innerHTML=`<div class="error"><b>Chargement impossible</b><p>${esc(error.message)}</p><p class="helper">Vérifier Cloudflare Access, le lien Apps Script et les autorisations Google.</p></div>`;}
}
async function mutate(payload){
  if(state.busy)return;
  state.busy=true;
  try{await api(payload);await refresh(true);notice('Modification enregistrée');return true;}
  catch(error){notice(error.message);return false;}
  finally{state.busy=false;}
}
function label(title,subtitle=''){return `<div class="section-title"><h2>${esc(title)}</h2>${subtitle?`<span class="muted short">${esc(subtitle)}</span>`:''}</div>`;}
function orders(){return state.data?.orders||[];}
function activeOrders(){return orders().filter(o=>o.status!=='Annulée');}
function lines(o){return o.lines.map(l=>`${l.qty} × ${esc(l.name)} <small>(${esc(l.label)})</small>`).join(' · ');}
function orderCard(o){
  const badges=`<span class="badge ${statusClass(o.status)}">${esc(o.status)}</span> <span class="badge ${o.payment==='Réglée'?'green':'gray'}">${esc(o.payment)}</span>`;
  const selectOpts=['À confirmer','Confirmée','En préparation','Prête','Retirée','Annulée']
    .map(s=>`<option value="${esc(s)}" ${o.status===s?'selected':''} ${o.status==='Annulée'&&s!=='Annulée'?'disabled':''}>${esc(s)}</option>`).join('');
  return `<article class="order" data-id="${esc(o.id)}"><div class="top"><div><strong>${esc(o.name)}</strong> <small>· ${esc(o.id)}</small><div class="meta"><span class="muted">${esc(shortDate(o.pickupDate))} à ${esc(o.pickupTime)}</span><span>${badges}</span></div></div><b>${eur(o.total)}</b></div><div class="details">${lines(o)}${o.note?`<p class="helper">Note : ${esc(o.note)}</p>`:''}</div><div class="bottom"><span class="short muted">${esc(o.phone)}${o.email?' · '+esc(o.email):''}</span><div class="row wrap"><select aria-label="Modifier le statut" class="order-status" ${o.status==='Annulée'?'disabled':''}>${selectOpts}</select><button type="button" class="btn secondary payment-toggle" ${o.status==='Annulée'?'disabled':''}>${o.payment==='Réglée'?'Marquer non réglée':'Marquer réglée'}</button></div></div></article>`;
}
function statsHtml(arr){return `<div class="stats">${arr.map(([v,k])=>`<div class="stat"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>`;}
function dateOptions(){
  return [...new Set(orders().map(o=>o.pickupDate).concat((state.data?.slots||[]).map(s=>s.date)))].filter(Boolean).sort();
}
function filterOrders(){
  const q=state.query.trim().toLocaleLowerCase('fr');
  return orders().filter(o=>(state.status==='Toutes'||o.status===state.status)&&
    (state.date==='Toutes'||o.pickupDate===state.date)&&
    (!q||[o.id,o.name,o.phone,o.email,o.pickupDate,o.note,...o.lines.map(l=>l.name)].join(' ').toLocaleLowerCase('fr').includes(q)));
}
function renderOrderResults(){const el=$('#order-results');if(!el)return;const result=filterOrders();el.innerHTML=result.length?result.map(orderCard).join(''):'<div class="empty">Aucune commande ne correspond à cette recherche.</div>';$('#order-count').textContent=`${result.length} commande(s)`;}
function renderOrders(){return `<section class="panel">${label('Retrouver une commande','Recherche par client, plat ou référence')}<div class="toolbar"><input id="search-order" type="search" placeholder="Nom, plat, téléphone, numéro…" aria-label="Rechercher" value="${esc(state.query)}"><select id="filter-status" aria-label="Statut"><option value="Toutes">Tous les statuts</option>${['À confirmer','Confirmée','En préparation','Prête','Retirée','Annulée'].map(s=>`<option value="${esc(s)}" ${state.status===s?'selected':''}>${esc(s)}</option>`).join('')}</select><select id="filter-date" aria-label="Date"><option value="Toutes">Toutes les dates</option>${dateOptions().map(d=>`<option value="${esc(d)}" ${state.date===d?'selected':''}>${esc(shortDate(d))}</option>`).join('')}</select></div><div class="section-title"><b id="order-count"></b><span class="helper">Modification des statuts directement dans chaque fiche</span></div><div id="order-results" class="order-list"></div></section>`;}
function production(date){
  const grouped=new Map();
  activeOrders().filter(o=>o.pickupDate===date&&!['Prête','Retirée'].includes(o.status)).forEach(o=>o.lines.forEach(l=>{
    const key=l.platId+'|'+l.variant+'|'+l.conservation;
    if(!grouped.has(key))grouped.set(key,{name:l.name,format:l.label,conservation:l.conservation,n:0,pending:0});
    grouped.get(key).n+=l.qty;
    if(o.status==='À confirmer')grouped.get(key).pending+=l.qty;
  }));
  return [...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
}
function renderKitchen(){
  const days=dateOptions().filter(d=>d>=new Date().toISOString().slice(0,10)).slice(0,14);
  if(!days.length)return '<div class="empty">Aucun créneau de production à venir.</div>';
  return `<div class="notice">Les quantités regroupent les demandes à confirmer et les commandes confirmées restant à préparer. Les commandes prêtes, retirées ou annulées sont exclues.</div>${days.map(day=>{
    const list=production(day);
    const qty=list.reduce((n,l)=>n+l.n,0);
    return `<section class="panel">${label('Cuisine · '+shortDate(day),qty+' portion(s) à traiter')}${list.length?`<div class="sums">${list.map(l=>`<div class="sum-line"><span><b>${esc(l.name)}</b><div class="short muted">${esc(l.format)} · ${esc(l.conservation)} ${l.pending?`· dont ${l.pending} à confirmer`:''}</div></span><strong>${l.n}</strong></div>`).join('')}</div>`:'<div class="empty">Rien à préparer sur ce créneau.</div>'}</section>`;
  }).join('')}`;
}
function renderHome(){
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
  const dayOrders=activeOrders().filter(o=>o.pickupDate===today);
  const pending=activeOrders().filter(o=>o.status==='À confirmer');
  const due=activeOrders().filter(o=>o.pickupDate>=today&&!['Retirée','Prête'].includes(o.status));
  const portions=due.reduce((n,o)=>n+o.lines.reduce((s,l)=>s+l.qty,0),0);
  const money=activeOrders().filter(o=>o.payment==='Réglée').reduce((n,o)=>n+o.total,0);
  return statsHtml([[dayOrders.length,'Retraits aujourd’hui'],[pending.length,'À confirmer'],[portions,'Portions à traiter'],[eur(money),'Règlements enregistrés']])+`<div class="two-col"><section class="panel">${label('Demandes à confirmer',pending.length+' en attente')}${pending.length?`<div class="order-list">${pending.slice(0,7).map(orderCard).join('')}</div>`:'<div class="empty">Aucune demande en attente.</div>'}</section><section class="panel">${label('Retraits du jour',shortDate(today))}${dayOrders.length?`<div class="order-list">${dayOrders.sort((a,b)=>a.pickupTime.localeCompare(b.pickupTime)).map(orderCard).join('')}</div>`:'<div class="empty">Aucun retrait prévu aujourd’hui.</div>'}</section></div>`;
}
function renderClients(){
  const people=new Map();
  orders().forEach(o=>{
    const key=o.phone.replace(/\s/g,'');if(!key)return;
    if(!people.has(key))people.set(key,{name:o.name,phone:o.phone,email:o.email,n:0,total:0,last:''});
    const p=people.get(key);if(!o.email&&p.email){}else p.email=o.email||p.email;
    p.n++;if(o.status!=='Annulée')p.total+=o.total;
    if(o.created>p.last){p.last=o.created;p.name=o.name;}
  });
  const list=[...people.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  return `<section class="panel">${label('Carnet clients',list.length+' client(s)')}<div class="toolbar"><input type="search" id="client-search" placeholder="Rechercher un client ou un téléphone…" aria-label="Rechercher un client"></div><p class="helper">Les coordonnées sont issues des commandes, sans double saisie.</p><div class="clients" style="margin-top:15px">${list.length?list.map(p=>`<article class="client" data-client-search="${esc((p.name+' '+p.phone+' '+p.email).toLowerCase())}"><strong>${esc(p.name)}</strong><div class="muted short">${esc(p.phone)}${p.email?'<br>'+esc(p.email):''}</div><div class="short">${p.n} commande(s) · ${eur(p.total)}</div></article>`).join(''):'<div class="empty">Aucun client enregistré.</div>'}</div></section>`;
}
// Photo de Google Drive déjà référencée dans la fiche.
function photoUrl(value){
  const url=String(value||'').trim();
  const match=url.match(/\/d\/([A-Za-z0-9_-]+)/)||url.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if(match)return `https://lh3.googleusercontent.com/d/${match[1]}=w800`;
  return /^https:\/\//.test(url)?url:'';
}
const photoState={base64:'',preview:'',busy:false};
function resetPhoto(product){
  photoState.base64='';photoState.preview='';photoState.busy=false;
  $('#photo-preview').src=product?.image?photoUrl(product.image):'';
  $('#photo-preview').hidden=!product?.image;
  $('#photo-help').textContent=product?.image?'Photo actuellement enregistrée. Vous pouvez la remplacer.':'Aucune photo. Choisissez ou prenez une photo.';
  $('#remove-photo').hidden=!product?.image;
  $('#photo-camera').value='';$('#photo-library').value='';
}
function toggleDuoFields(){
  const isNew=!$('#product-form').elements.editId.value;
  const enabled=isNew&&$('#duo-active').checked;
  ['price2','stock2'].forEach(name=>{const el=$('#product-form').elements[name];el.disabled=!enabled;el.required=enabled;});
  $('#duo-active').closest('.duo-toggle').hidden=!isNew;
  document.querySelectorAll('.duo-input').forEach(el=>el.hidden=!isNew);
}
async function compressPhoto(file){
  if(!file||file.size>20_000_000)throw Error('Photo trop volumineuse (20 Mo maximum avant réduction).');
  const objectUrl=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Photo illisible. Utilisez une image JPEG ou convertissez votre photo HEIC en JPEG.'));img.src=objectUrl;});
    let edge=1400, quality=.80, dataUrl='';
    for(let attempt=0;attempt<7;attempt++){
      const scale=Math.min(1,edge/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
      const context=canvas.getContext('2d');
      if(!context)throw Error('Traitement de la photo indisponible sur cet appareil.');
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(img,0,0,canvas.width,canvas.height);
      dataUrl=canvas.toDataURL('image/jpeg',quality);
      canvas.width=0;canvas.height=0;
      if(dataUrl.startsWith('data:image/jpeg;base64,')&&dataUrl.length<650000)break;
      edge=Math.max(650,Math.round(edge*.83));quality=Math.max(.62,quality-.035);
    }
    if(!dataUrl.startsWith('data:image/jpeg;base64,')||dataUrl.length>700000)
      throw Error('Impossible de réduire suffisamment la photo. Essayez une photo moins lourde.');
    return {dataUrl,base64:dataUrl.split(',')[1]};
  }finally{URL.revokeObjectURL(objectUrl);}
}
function renderCatalogue(){
  const ps=state.data?.products||[];
  return `<div class="row space wrap" style="margin-bottom:13px"><h2>Les plats</h2><button type="button" id="new-product" class="btn primary">+ Nouveau plat</button></div><div class="notice">Modification directe des stocks et prix du Google Sheets « Catalogue ». Les informations du site public se mettent à jour à son prochain chargement.</div><div class="catalogue-grid">${ps.map(p=>`<article class="product" data-product="${esc(p.id)}"><div class="head"><h3>${esc(p.name)}</h3><label class="row"><input type="checkbox" class="product-active" ${p.active?'checked':''}> <span class="short">Publié</span></label></div>${p.image?`<img class="product-thumb" src="${esc(photoUrl(p.image))}" loading="lazy" alt="Photo de ${esc(p.name)}">`:''}<div class="row space" style="margin-top:9px"><span class="muted short">${esc(p.conservation)} · ${p.dlc?'DLC renseignée':'DLC à renseigner'}</span><button type="button" class="btn secondary product-edit">Modifier la fiche</button></div>${p.variants.filter(v=>v.id!=='fam').map(v=>`<div class="variant" data-variant="${esc(v.id)}"><div><b class="short">${esc(v.label)}</b><label class="row"><input type="checkbox" class="variant-active" style="width:16px;min-height:16px" ${v.active?'checked':''}> Format actif</label></div><label>Prix (€)<input type="number" class="price" min="0" max="1000" step="0.01" value="${v.price}"></label><label>Stock<input type="number" class="stock" min="0" max="9999" step="1" value="${v.stock}"></label><button type="button" class="btn secondary product-save">Enregistrer</button></div>`).join('')}</article>`).join('')}</div>`;
}
function slotCards(slots){
  return `<div class="slot-grid">${slots.map(s=>`<article class="slot-card" data-date="${esc(s.date)}" data-time="${esc(s.time)}"><b>${esc(shortDate(s.date))}</b><p>${esc(s.time)}</p><label>Places disponibles<input class="places" type="number" min="0" max="1000" step="1" value="${s.available}"></label><label class="row"><input type="checkbox" class="slot-active" style="width:17px;min-height:17px" ${s.active?'checked':''}> Créneau ouvert</label><button class="btn secondary slot-save" type="button">Enregistrer</button></article>`).join('')}</div>`;
}
function renderRetraits(){
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
  const slots=[...(state.data?.slots||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  const future=slots.filter(s=>s.date>=today);
  const previous=slots.filter(s=>s.date<today).reverse();
  return `<div class="row space wrap" style="margin-bottom:13px"><h2>Les créneaux</h2><button type="button" id="new-slot" class="btn primary">+ Nouveau créneau</button></div><div class="notice">Le nombre de places correspond aux commandes possibles, et non au nombre de barquettes. Les créneaux passés restent dans l'historique.</div>${label('Retraits à venir',future.length+' créneau(x)')}${future.length?slotCards(future):'<div class="empty">Aucun retrait programmé. Cliquez sur « Nouveau créneau ».</div>'}${previous.length?`<details class="slot-archive"><summary>Historique des retraits (${previous.length})</summary>${slotCards(previous)}</details>`:''}`;
}
const pages={accueil:['Tableau de bord',renderHome],commandes:['Les commandes',renderOrders],cuisine:['Préparation en cuisine',renderKitchen],clients:['Fichier clients',renderClients],catalogue:['Catalogue des plats',renderCatalogue],retraits:['Créneaux de retrait',renderRetraits]};
function render(){
  if(!state.data)return;
  const [title,fn]=pages[state.page];$('#page-title').textContent=title;
  document.querySelectorAll('[data-page]').forEach(x=>{x.classList.toggle('active',x.dataset.page===state.page);x.setAttribute('aria-current',x.dataset.page===state.page?'page':'false');});
  $('#main').innerHTML=fn();
  if(state.page==='commandes')renderOrderResults();
}
function nav(page){if(!pages[page])return;state.page=page;render();window.scrollTo({top:0,behavior:'smooth'});}
function manualOptions(){
  return (state.data?.products||[]).filter(p=>p.active).flatMap(p=>p.variants.filter(v=>v.active&&v.stock>0).map(v=>`<option value="${esc(p.id+'|'+v.id)}">${esc(p.name)} · ${esc(v.label)} (${eur(v.price)}, stock ${v.stock})</option>`)).join('');
}
function addManualLine(){
  const div=document.createElement('div');div.className='manual-line';
  div.innerHTML=`<select class="manual-product" required aria-label="Plat">${manualOptions()}</select><input class="manual-qty" type="number" min="1" max="30" value="1" required aria-label="Quantité"><button class="remove" type="button" aria-label="Supprimer la ligne">×</button>`;
  $('#manual-lines').append(div);
}
function openManual(){
  const choices=(state.data?.slots||[]).filter(s=>s.active&&s.available>0&&s.date>=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'}));
  $('#manual-slot').innerHTML=choices.map(s=>`<option value="${esc(s.date+'|'+s.time)}">${esc(shortDate(s.date))} · ${esc(s.time)}</option>`).join('');
  $('#manual-form').reset();$('#manual-lines').innerHTML='';addManualLine();
  $('#manual-modal').showModal();
}
document.addEventListener('click',async e=>{
  const tab=e.target.closest('[data-page]');if(tab){nav(tab.dataset.page);return;}
  const closer=e.target.closest('[data-close]');if(closer){document.getElementById(closer.dataset.close)?.close();return;}
  if(e.target.closest('#new-product')){const form=$('#product-form');form.reset();form.elements.name.readOnly=false;form.elements.price.disabled=false;form.elements.stock.disabled=false;form.elements.editId.value='';$('#duo-active').disabled=false;$('#duo-active').checked=false;$('#product-title').textContent='Créer une fiche plat';$('#save-product-details').textContent='Enregistrer le brouillon';resetPhoto(null);toggleDuoFields();$('#product-modal').showModal();return;}
  const edit=e.target.closest('.product-edit');if(edit){const id=edit.closest('[data-product]').dataset.product;const product=(state.data?.products||[]).find(p=>p.id===id);if(!product)return;const form=$('#product-form');form.reset();form.elements.editId.value=id;for(const key of ['description','ingredients','allergens','dlc','reheating','conservation'])form.elements[key].value=product[key]||'';form.elements.name.value=product.name;form.elements.name.readOnly=true;form.elements.price.disabled=true;form.elements.stock.disabled=true;form.elements.price.value=(product.variants.find(v=>v.id==='indiv')||{}).price||0;form.elements.stock.value=(product.variants.find(v=>v.id==='indiv')||{}).stock||0;$('#duo-active').disabled=true;$('#duo-active').checked=!!product.variants.find(v=>v.id==='duo')?.active;toggleDuoFields();resetPhoto(product);$('#product-title').textContent='Modifier la fiche : '+product.name;$('#save-product-details').textContent='Enregistrer la fiche';$('#product-modal').showModal();return;}
  if(e.target.closest('#new-slot')){
    const form=$('#slot-form');form.reset();
    form.elements.date.min=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
    form.elements.time.value='17:30';
    $('#slot-modal').showModal();return;
  }
  if(e.target.closest('#refresh')){await refresh();return;}
  if(e.target.closest('#add-order')){openManual();return;}
  if(e.target.closest('#close-manual')||e.target.closest('#cancel-manual')){$('#manual-modal').close();return;}
  if(e.target.closest('#add-line')){addManualLine();return;}
  if(e.target.closest('.manual-line .remove')){const lines=document.querySelectorAll('.manual-line');if(lines.length>1)e.target.closest('.manual-line').remove();return;}
  const payment=e.target.closest('.payment-toggle');if(payment){const card=payment.closest('[data-id]');const order=orders().find(x=>x.id===card.dataset.id);if(order)await mutate({action:'payment',id:order.id,payment:order.payment==='Réglée'?'Non réglée':'Réglée'});return;}
  const product=e.target.closest('.product-save');if(product){const card=product.closest('[data-product]'),line=product.closest('[data-variant]');const price=Number(line.querySelector('.price').value),stock=Number(line.querySelector('.stock').value);if(!Number.isFinite(price)||!Number.isInteger(stock)){notice('Prix ou stock incorrect');return;}await mutate({action:'product',id:card.dataset.product,variant:line.dataset.variant,price,stock,variantActive:line.querySelector('.variant-active').checked});return;}
  if(e.target.closest('#remove-photo')){
    const id=$('#product-form').elements.editId.value;
    if(!id||state.busy)return;
    if(!window.confirm('Supprimer la photo de ce plat sur le site et dans Drive ?'))return;
    if(await mutate({action:'photoDelete',id})){
      const updated=state.data?.products?.find(p=>p.id===id);
      resetPhoto(updated);notice('Photo supprimée.');
    }
    return;
  }
  const slot=e.target.closest('.slot-save');if(slot){const card=slot.closest('[data-date]');await mutate({action:'slot',date:card.dataset.date,time:card.dataset.time,available:Number(card.querySelector('.places').value),active:card.querySelector('.slot-active').checked});return;}
});
document.addEventListener('change',async e=>{
  if(e.target.matches('#duo-active')){toggleDuoFields();return;}
  if(e.target.matches('#photo-camera, #photo-library')){
    const file=e.target.files?.[0];if(!file)return;
    photoState.busy=true;$('#photo-help').textContent='Préparation de la photo…';
    try{
      const photo=await compressPhoto(file);
      photoState.base64=photo.base64;photoState.preview=photo.dataUrl;
      $('#photo-preview').src=photo.dataUrl;$('#photo-preview').hidden=false;
      $('#photo-help').textContent='Photo prête à être enregistrée avec la fiche.';
    }catch(error){photoState.base64='';photoState.preview='';$('#photo-help').textContent=error.message;notice(error.message);}
    finally{photoState.busy=false;}
    return;
  }
  if(e.target.matches('#filter-status')){state.status=e.target.value;renderOrderResults();}
  else if(e.target.matches('#filter-date')){state.date=e.target.value;renderOrderResults();}
  else if(e.target.matches('.order-status')){const card=e.target.closest('[data-id]');const id=card?.dataset.id,stat=e.target.value;if(stat==='Annulée'&&!window.confirm('Annuler la commande et rétablir les stocks ?')){render();return;}await mutate({action:'status',id,status:stat});}
  else if(e.target.matches('.product-active')){const id=e.target.closest('[data-product]').dataset.product;await mutate({action:'product',id,active:e.target.checked});}
});
document.addEventListener('input',e=>{if(e.target.matches('#search-order')){state.query=e.target.value;renderOrderResults();}else if(e.target.matches('#client-search')){const q=e.target.value.toLowerCase();document.querySelectorAll('.client[data-client-search]').forEach(el=>{el.style.display=el.dataset.clientSearch.includes(q)?'':'none';});}});
$('#manual-form').addEventListener('submit',async e=>{
  e.preventDefault();if(state.busy)return;
  const form=e.currentTarget,values=new FormData(form),[pickupDate,pickupTime]=String(values.get('pickupSlot')||'').split('|');
  const items=[...form.querySelectorAll('.manual-line')].map(line=>{const [platId,variantId]=line.querySelector('.manual-product').value.split('|');const product=state.data.products.find(p=>p.id===platId);return {platId,variantId,conservation: 'Frais',qty:Number(line.querySelector('.manual-qty').value),_name:product?.name};});
  // La conservation réelle du plat doit venir du catalogue (non de l'interface).
  // On la récupère de la feuille PLATS côté serveur en mode saisie manuelle.
  const payload={action:'manualOrder',name:values.get('name'),phone:values.get('phone'),email:values.get('email'),note:values.get('note'),pickupDate,pickupTime,items:items.map(({_name,...rest})=>rest),requestKey:crypto.randomUUID()};
  if(await mutate(payload)){$('#manual-modal').close();nav('commandes');}
});
refresh(true);

$('#slot-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const data=new FormData(e.currentTarget);
  const time=String(data.get('time')||'').trim();
  const match=time.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if(!match){notice('Choisissez une heure valide dans le sélecteur.');return;}
  const payload={action:'slotCreate',date:data.get('date'),time:`${match[1]}h${match[2]}`,available:Number(data.get('available'))};
  if(await mutate(payload)){$('#slot-modal').close();nav('retraits');}
});
$('#product-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if(state.busy||photoState.busy){notice('Veuillez terminer la préparation de la photo.');return;}
  const data=new FormData(e.currentTarget);
  const editId=String(data.get('editId')||'');
  const details={description:data.get('description'),ingredients:data.get('ingredients'),allergens:data.get('allergens'),dlc:data.get('dlc'),reheating:data.get('reheating'),conservation:data.get('conservation')};
  const payload=editId?{action:'product',id:editId,details}:{action:'productCreate',name:data.get('name'),...details,
    price:Number(data.get('price')),stock:Number(data.get('stock')),
    active2:data.has('active2'),price2:Number(data.get('price2')),stock2:Number(data.get('stock2'))};
  state.busy=true;
  $('#save-product-details').disabled=true;
  let savedDetails=false;
  try{
    const result=await api(payload);
    savedDetails=true;
    const id=editId||result.id;
    if(photoState.base64){
      if(!id)throw Error('Fiche créée, mais identifiant photo manquant. Réouvrez la fiche pour ajouter la photo.');
      $('#photo-help').textContent='Enregistrement de la photo dans Drive…';
      await api({action:'photoUpload',id,jpegBase64:photoState.base64});
    }
    $('#product-modal').close();
    await refresh(true);
    nav('catalogue');
    notice(photoState.base64?'Fiche et photo enregistrées.':'Fiche enregistrée.');
  }catch(error){
    if(savedDetails){
      $('#product-modal').close();await refresh(true);nav('catalogue');
      window.alert('La fiche a été enregistrée, mais la photo n’a pas été enregistrée : '+error.message+'\nVous pouvez reprendre la photo depuis « Modifier la fiche ».');
    }else notice(error.message);
  }finally{state.busy=false;$('#save-product-details').disabled=false;}
});
