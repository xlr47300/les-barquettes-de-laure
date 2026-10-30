/**
 * LES BARQUETTES DE LAURE — BACKEND V1
 * Le projet est déployé en Web App, "Exécuter en tant que moi".
 * Ne jamais publier ici la clé partagée ni les informations personnelles.
 * Le script ne renvoie jamais les commandes par GET : seul doPost avec secret fonctionne.
 */
const LAURE = {
  tabs: {products:'PLATS', slots:'CRÉNEAUX', formulas:'FORMULES'},
  orderHeaders:['ID','Créée le','Nom','Téléphone','Email','Date retrait','Heure retrait','Statut','Paiement','Total TTC','Origine','Note','Clé de requête'],
  lineHeaders:['Commande ID','Plat ID','Plat','Format ID','Format','Conservation','Quantité','Prix unitaire TTC','Montant TTC','Stock suivi'],
  journalHeaders:['Date','Commande ID','Action','Détail'],
  variants:{
    indiv:['Format 1 personne actif','Prix 1 personne','Stock 1 personne','1 personne'],
    duo:['Format 2 personnes actif','Prix 2 personnes','Stock 2 personnes','2 personnes'],
    fam:['Format 4 personnes actif','Prix 4 personnes','Stock 4 personnes','4 personnes']
  },
  states:['À confirmer','Confirmée','En préparation','Prête','Retirée','Annulée'],
  payments:['Non réglée','Réglée']
};

function setupLaure() {
  const config=PropertiesService.getScriptProperties();
  const catalogId=config.getProperty('CATALOG_SPREADSHEET_ID');
  if(!catalogId) throw new Error('Définir CATALOG_SPREADSHEET_ID dans les propriétés du script.');
  const source=SpreadsheetApp.openById(catalogId);
  ['PLATS','CRÉNEAUX','FORMULES'].forEach(name=>{
    if(!source.getSheetByName(name)) throw new Error('Onglet catalogue introuvable : '+name);
  });
  let privateId=config.getProperty('PRIVATE_SPREADSHEET_ID');
  const book=privateId ? SpreadsheetApp.openById(privateId) : SpreadsheetApp.create('Les Barquettes de Laure - Gestion privée');
  if(!privateId) config.setProperty('PRIVATE_SPREADSHEET_ID', book.getId());
  [['COMMANDES',LAURE.orderHeaders],['LIGNES',LAURE.lineHeaders],['JOURNAL',LAURE.journalHeaders]].forEach(([name,headers])=>{
    let s=book.getSheetByName(name) || book.insertSheet(name);
    if(s.getLastRow()===0){s.getRange(1,1,1,headers.length).setValues([headers]);}
    if(s.getRange(1,1,1,headers.length).getDisplayValues()[0].join('|')!==headers.join('|'))
      throw new Error('En-têtes inattendus dans '+name);
    s.setFrozenRows(1);
    s.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#EAEFE2');
  });
  // Ne pas exposer ce fichier par "Publier sur le web".
  Logger.log('Gestion privée créée : '+book.getUrl());
  return book.getUrl();
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ok:false,error:'Accès direct non disponible'}))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost(e) {
  let response;
  try {
    const data=JSON.parse(e && e.postData && e.postData.contents || '{}');
    const secrets=PropertiesService.getScriptProperties();
    const expected=secrets.getProperty('API_SHARED_SECRET');
    if(!expected || expected.length<32 || String(data.secret||'')!==expected) fail_('Accès non autorisé',403);
    let result;
    switch(data.action){
      case 'order': result=createOrder_(data.data,false);break;
      case 'manualOrder': result=createOrder_(data.data,true);break;
      case 'snapshot': result=snapshot_();break;
      case 'status': result=changeStatus_(data.data);break;
      case 'payment': result=changePayment_(data.data);break;
      case 'product': result=editProduct_(data.data);break;
      case 'slot': result=editSlot_(data.data);break;
      case 'slotCreate': result=createSlot_(data.data);break;
      case 'productCreate': result=createProduct_(data.data);break;
      case 'photoUpload': result=uploadProductPhoto_(data.data);break;
      case 'photoDelete': result=deleteProductPhoto_(data.data);break;
      default: fail_('Action inconnue',400);
    }
    response={ok:true,data:result};
  } catch(error){
    console.error(error);
    response={ok:false,status:error.status||500,error:error.status?error.message:'Erreur interne. Consulter les exécutions Apps Script.'};
  }
  return ContentService.createTextOutput(JSON.stringify(response)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg,status){const e=new Error(msg);e.status=status||422;throw e;}
function prop_(key){
  const v=PropertiesService.getScriptProperties().getProperty(key);
  if(!v) fail_('Configuration absente : '+key,503);
  return v;
}
function catalog_(){return SpreadsheetApp.openById(prop_('CATALOG_SPREADSHEET_ID'));}
function privateBook_(){return SpreadsheetApp.openById(prop_('PRIVATE_SPREADSHEET_ID'));}
function withLock_(fn){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(25000)) fail_('Service occupé, réessayer',503);
  try{return fn();}finally{lock.releaseLock();}
}
function clean_(value,max){
  if(value==null)return '';
  return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max||240);
}
// Empêche l'injection de formules dans Google Sheets via les champs libres.
function safeCell_(value,max){
  const str=clean_(value,max);
  return /^[=+\-@]/.test(str)?"'"+str:str;
}
function yes_(str){return ['oui','yes','true','1'].includes(clean_(str,30).toLowerCase());}
function numeric_(str){
  if(typeof str==='number')return str;
  const raw=String(str||'').replace(/\s/g,'').replace(',','.').replace(/[^\d.\-]/g,'');
  return Number(raw)||0;
}
function slug_(str){return clean_(str,200).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'element';}
function dateISO_(v){
  if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v))return Utilities.formatDate(v,'Europe/Paris','yyyy-MM-dd');
  const s=clean_(v,40);let match=s.match(/^(\d{4})-(\d\d)-(\d\d)/);
  if(match)return `${match[1]}-${match[2]}-${match[3]}`;
  match=s.match(/^(\d\d)\/(\d\d)\/(\d{4})/);
  return match?`${match[3]}-${match[2]}-${match[1]}`:'';
}
function deadlineTime_(value){
  const s=clean_(value,90);
  let m=s.match(/^(\d{4}-\d\d-\d\d)[ T](\d{1,2}):(\d\d)/);
  if(m)return m[1]+'T'+m[2].padStart(2,'0')+':'+m[3]+':00';
  m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})/);
  if(m)return m[3]+'-'+m[2]+'-'+m[1]+'T'+m[4].padStart(2,'0')+':'+m[5]+':00';
  return '';
}
function nowISO_(){return Utilities.formatDate(new Date(),'Europe/Paris',"yyyy-MM-dd'T'HH:mm:ss");}
function today_(){return Utilities.formatDate(new Date(),'Europe/Paris','yyyy-MM-dd');}
function sheetData_(sheet,headerRow){
  if(!sheet)fail_('Onglet manquant',503);
  const max=sheet.getLastColumn();
  const headers=sheet.getRange(headerRow,1,1,max).getDisplayValues()[0].map(h=>clean_(h));
  const n=Math.max(0,sheet.getLastRow()-headerRow);
  if(!n)return {sheet,headers,items:[]};
  const raw=sheet.getRange(headerRow+1,1,n,max).getValues();
  const disp=sheet.getRange(headerRow+1,1,n,max).getDisplayValues();
  return {sheet,headers,items:raw.map((values,i)=>{
    const obj={_row:i+headerRow+1};
    headers.forEach((h,j)=>{if(h)obj[h]=disp[i][j];});
    obj._raw=values;
    return obj;
  })};
}
function sourceData_(name){return sheetData_(catalog_().getSheetByName(name),4);}
function readPrivate_(book,name){return sheetData_(book.getSheetByName(name),1);}
function idx_(data,name){const index=data.headers.indexOf(name);if(index<0)fail_('Colonne manquante : '+name,503);return index+1;}
function updateCell_(data,row,name,value){data.sheet.getRange(row,idx_(data,name)).setValue(value);}
function orderLines_(book){return readPrivate_(book,'LIGNES').items;}
function createOrder_(input,manual){
  return withLock_(()=>{
    if(!input || typeof input!=='object')fail_('Commande invalide');
    const name=clean_(input.name,100),phone=clean_(input.phone,30),email=clean_(input.email,150),note=clean_(input.note,700);
    const phoneDigits=phone.replace(/\D/g,'');
    if(name.length<3||name.length>100||phoneDigits.length<9||phoneDigits.length>15)fail_('Nom ou téléphone incorrect');
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail_('Adresse e-mail invalide');
    if(!manual && input.consent!==true)fail_('Acceptation de la demande requise');
    const requestKey=clean_(input.requestKey,90);
    if(!/^[a-zA-Z0-9-]{12,90}$/.test(requestKey))fail_('Référence de demande manquante');
    const date=clean_(input.pickupDate,20),time=clean_(input.pickupTime,30);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today_())fail_('Date de retrait invalide');
    const cart=input.items;
    if(!Array.isArray(cart)||cart.length===0||cart.length>20)fail_('Panier incorrect');
    const book=privateBook_(),orders=readPrivate_(book,'COMMANDES');
    const existing=orders.items.find(o=>o['Clé de requête']===requestKey);
    if(existing)return {orderId:existing.ID,total:numeric_(existing['Total TTC']),duplicate:true};
    const slotData=sourceData_('CRÉNEAUX');
    const slot=slotData.items.find(s=>yes_(s.Actif)&&dateISO_(s.Date)===date&&clean_(s.Heure,30)===time);
    if(!slot || numeric_(slot['Places disponibles'])<1)fail_('Ce créneau n’est plus disponible');
    const clock=clean_(time,30).match(/^(\d{1,2})h(\d{2})$/);
    if(!clock)fail_('Heure de retrait incorrecte');
    const slotClock=clock[1].padStart(2,'0')+':'+clock[2];
    if(date===today_()&&slotClock<=Utilities.formatDate(new Date(),'Europe/Paris','HH:mm'))fail_('Ce créneau est déjà passé');
    const plats=sourceData_('PLATS'),formules=sourceData_('FORMULES');
    const wanted=new Map(),lines=[];
    let totalCents=0;
    for(const item of cart){
      if(!item || typeof item!=='object')fail_('Ligne incorrecte');
      const itemId=clean_(item.platId,150),variant=clean_(item.variantId,20),qty=Number(item.qty);
      if(!Number.isInteger(qty)||qty<1||qty>30)fail_('Quantité incorrecte');
      if(variant==='formule'){
        fail_('Les formules ne sont pas encore ouvertes à la réservation en ligne.');
        const f=formules.items.find(f=>yes_(f.Actif)&&'formule-'+slug_(f.Nom||f['ID formule'])===itemId);
        if(!f)fail_('Formule indisponible');
        const price=Math.round(numeric_(f['Prix TTC'])*100);
        if(price<1)fail_('Prix de formule invalide');
        totalCents+=price*qty;
        lines.push({id:itemId,name:clean_(f.Nom,150),variant:'formule',label:'Formule',conservation:'À confirmer',qty,price,stock:false});
        continue;
      }
      if(!LAURE.variants[variant])fail_('Format non reconnu');
      if(!manual && variant==='fam')fail_('Ce format est temporairement indisponible');
      const p=plats.items.find(p=>yes_(p.Actif)&&slug_(p['Nom du plat'])===itemId);
      if(!p)fail_('Plat indisponible : '+itemId);
      const [activeCol,priceCol,stockCol,label]=LAURE.variants[variant];
      if(!yes_(p[activeCol]))fail_('Format indisponible : '+p['Nom du plat']);
      const price=Math.round(numeric_(p[priceCol])*100);
      if(price<1)fail_('Prix incorrect : '+p['Nom du plat']);
      const current=clean_(p['État actuel'],40)||'Frais';
      const cons=manual?current:clean_(item.conservation,40);
      if(cons!==current && !(cons==='Surgelé'&&yes_(p['Peut être congelé'])))fail_('Conservation non proposée');
      const earliest=dateISO_(p['Disponible à partir du']);
      const deadline=dateISO_(p['Commander avant le']);
      if(earliest&&date<earliest)fail_('Plat non disponible à cette date : '+p['Nom du plat']);
      if(deadline&&today_()>deadline)fail_('Date limite de commande dépassée : '+p['Nom du plat']);
      const expiryTime=deadlineTime_(p['Commander avant le']);
      if(expiryTime&&nowISO_()>expiryTime)fail_('Heure limite de commande dépassée : '+p['Nom du plat']);
      const key=p._row+'|'+stockCol;
      if(!wanted.has(key))wanted.set(key,{p,stockCol,qty:0,initial:numeric_(p[stockCol])});
      wanted.get(key).qty+=qty;
      totalCents+=price*qty;
      lines.push({id:itemId,name:clean_(p['Nom du plat'],150),variant,label,conservation:cons,qty,price,stock:true});
    }
    if(lines.reduce((n,l)=>n+l.qty,0)>75||totalCents>200000)fail_('Commande trop importante, contacter Laure');
    for(const w of wanted.values())if(w.initial<w.qty)fail_('Stock insuffisant : '+w.p['Nom du plat']);
    const slotBefore=numeric_(slot['Places disponibles']);
    const orderId='L-'+Utilities.formatDate(new Date(),'Europe/Paris','yyMMdd')+'-'+Utilities.getUuid().slice(0,10).toUpperCase();
    let orderRow=0,lineStart=0;
    const restored=[];
    try{
      for(const w of wanted.values()){
        updateCell_(plats,w.p._row,w.stockCol,w.initial-w.qty);
        restored.push(w);
      }
      updateCell_(slotData,slot._row,'Places disponibles',slotBefore-1);
      const order=[orderId,nowISO_(),safeCell_(name,100),safeCell_(phone,30),safeCell_(email,150),date,time,'À confirmer','Non réglée',totalCents/100,manual?'Manuelle':'Site',safeCell_(note,700),requestKey];
      orderRow=orders.sheet.getLastRow()+1;
      orders.sheet.getRange(orderRow,1,1,order.length).setValues([order]);
      const lineSheet=book.getSheetByName('LIGNES');
      const values=lines.map(l=>[orderId,l.id,l.name,l.variant,l.label,l.conservation,l.qty,l.price/100,l.qty*l.price/100,l.stock?'Oui':'Non']);
      lineStart=lineSheet.getLastRow()+1;
      lineSheet.getRange(lineStart,1,values.length,values[0].length).setValues(values);
      appendJournal_(book,orderId,'Création',manual?'Saisie manuelle':'Demande site');
    }catch(e){
      // Compensation best-effort : Sheets ne fournit pas de transaction multi-feuilles.
      try{
        for(const w of restored)updateCell_(plats,w.p._row,w.stockCol,w.initial);
        updateCell_(slotData,slot._row,'Places disponibles',slotBefore);
        if(lineStart){const ls=book.getSheetByName('LIGNES');for(let j=ls.getLastRow();j>=lineStart;j--)if(ls.getRange(j,1).getValue()===orderId)ls.deleteRow(j);}
        if(orderRow&&orders.sheet.getRange(orderRow,1).getValue()===orderId)orders.sheet.deleteRow(orderRow);
      }catch(rollbackError){console.error('RÉCONCILIATION MANUELLE REQUISE',rollbackError);}
      throw e;
    }
    notifyLaure_(orderId,name,phone,date,time,lines,totalCents/100);
    return {orderId,total:totalCents/100,duplicate:false};
  });
}
function notifyLaure_(id,name,phone,date,time,lines,total){
  const dest=PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if(!dest)return;
  try{
    const detail=lines.map(l=>`${l.qty} x ${l.name} (${l.label})`).join('\n');
    MailApp.sendEmail({to:dest,subject:`Nouvelle demande ${id} - Les Barquettes de Laure`,
      body:`Nouvelle demande de réservation (à confirmer)\n\n${name}\n${phone}\nRetrait : ${date} à ${time}\n\n${detail}\n\nTotal : ${total.toFixed(2)} EUR\n\nConsulter l'espace privé pour confirmer.\n`});
  }catch(error){console.error('Notification e-mail non envoyée : '+error);}
}
function appendJournal_(book,id,action,detail){
  book.getSheetByName('JOURNAL').appendRow([nowISO_(),id,action,clean_(detail,500)]);
}
function snapshot_(){
  const book=privateBook_();
  const orders=readPrivate_(book,'COMMANDES').items;
  const lineMap=new Map();
  orderLines_(book).forEach(line=>{const id=line['Commande ID'];if(!lineMap.has(id))lineMap.set(id,[]);
    lineMap.get(id).push({platId:line['Plat ID'],name:line.Plat,variant:line['Format ID'],label:line.Format,conservation:line.Conservation,qty:numeric_(line['Quantité']),price:numeric_(line['Prix unitaire TTC']),stock:line['Stock suivi']==='Oui'});});
  const prepared=orders.map(o=>({id:o.ID,created:o['Créée le'],name:o.Nom,phone:o['Téléphone'],email:o.Email,
    pickupDate:o['Date retrait'],pickupTime:o['Heure retrait'],status:o.Statut,payment:o.Paiement,
    total:numeric_(o['Total TTC']),source:o.Origine,note:o.Note,lines:lineMap.get(o.ID)||[]}))
    .sort((a,b)=>a.pickupDate.localeCompare(b.pickupDate)||a.pickupTime.localeCompare(b.pickupTime));
  const plats=sourceData_('PLATS');
  const products=plats.items.filter(p=>p['Nom du plat']).map(p=>({
    id:slug_(p['Nom du plat']),name:p['Nom du plat'],active:yes_(p.Actif),
    description:p['Description courte']||'',ingredients:p['Ingrédients']||'',allergens:p['Allergènes']||'',
    dlc:p['DLC / conservation']||'',reheating:p['Réchauffage']||'',image:p['Photo principale URL Google Drive']||'',
    conservation:p['État actuel']||'Frais',
    variants:Object.entries(LAURE.variants).map(([id,[on,price,stock,label]])=>({id,label,active:yes_(p[on]),price:numeric_(p[price]),stock:numeric_(p[stock])}))
  }));
  const slots=sourceData_('CRÉNEAUX').items.filter(s=>s.Date).map(s=>({date:dateISO_(s.Date),time:s.Heure,
    available:numeric_(s['Places disponibles']),active:yes_(s.Actif)}));
  const formulas=sourceData_('FORMULES').items.filter(f=>yes_(f.Actif)).map(f=>({id:'formule-'+slug_(f.Nom||f['ID formule']),name:f.Nom,price:numeric_(f['Prix TTC'])}));
  return {orders:prepared,products,slots,formulas,asOf:nowISO_()};
}
function findOrder_(book,id){
  const data=readPrivate_(book,'COMMANDES');
  const o=data.items.find(o=>o.ID===clean_(id,80));
  if(!o)fail_('Commande introuvable',404);
  return {data,o};
}
function changeStatus_(input){return withLock_(()=>{
  const status=clean_(input.status,40);if(!LAURE.states.includes(status))fail_('Statut inconnu');
  const book=privateBook_(),{data,o}=findOrder_(book,input.id),previous=o.Statut;
  if(previous==='Annulée'&&status!=='Annulée')fail_('Une commande annulée ne peut pas être réactivée : créer une nouvelle commande');
  if(status==='Annulée'&&previous!=='Annulée'){
    const products=sourceData_('PLATS'),slots=sourceData_('CRÉNEAUX');
    const changes=new Map();
    orderLines_(book).filter(line=>line['Commande ID']===o.ID&&line['Stock suivi']==='Oui').forEach(l=>{
      const p=products.items.find(p=>slug_(p['Nom du plat'])===l['Plat ID']);
      const v=LAURE.variants[l['Format ID']];
      if(!p||!v)fail_('Impossible de rétablir le stock : produit ou format manquant. Contacter le support.');
      const key=p._row+'|'+v[2];
      if(!changes.has(key))changes.set(key,{p,col:v[2],n:0});
      changes.get(key).n+=numeric_(l['Quantité']);
    });
    const slot=slots.items.find(s=>dateISO_(s.Date)===o['Date retrait']&&s.Heure===o['Heure retrait']);
    if(!slot)fail_('Créneau de retrait introuvable : correction manuelle requise.');
    for(const c of changes.values())updateCell_(products,c.p._row,c.col,numeric_(c.p[c.col])+c.n);
    updateCell_(slots,slot._row,'Places disponibles',numeric_(slot['Places disponibles'])+1);
  }
  updateCell_(data,o._row,'Statut',status);
  appendJournal_(book,o.ID,'Statut',previous+' → '+status);
  return {id:o.ID,status};
});}
function changePayment_(input){return withLock_(()=>{
  const payment=clean_(input.payment,40);if(!LAURE.payments.includes(payment))fail_('Règlement non reconnu');
  const book=privateBook_(),{data,o}=findOrder_(book,input.id);
  updateCell_(data,o._row,'Paiement',payment);
  appendJournal_(book,o.ID,'Paiement',payment);
  return {id:o.ID,payment};
});}
function editProduct_(input){return withLock_(()=>{
  const data=sourceData_('PLATS'),p=data.items.find(x=>slug_(x['Nom du plat'])===clean_(input.id,150));
  if(!p)fail_('Plat non trouvé',404);
  const detailFields={description:['Description courte',300],ingredients:['Ingrédients',800],allergens:['Allergènes',500],
    dlc:['DLC / conservation',300],reheating:['Réchauffage',400],image:['Photo principale URL Google Drive',400],
    conservation:['État actuel',50]};
  const pending=[];
  const fields=input.details && typeof input.details==='object' && !Array.isArray(input.details)?input.details:{};
  if(fields.image&&!/^https:\/\//i.test(clean_(fields.image,400)))fail_('Lien image incorrect');
  if(fields.conservation&&!['Frais','Sous vide','Surgelé'].includes(clean_(fields.conservation,50)))fail_('Conservation incorrecte');
  for(const [key,[col,max]] of Object.entries(detailFields)){
    if(Object.prototype.hasOwnProperty.call(fields,key))pending.push([col,safeCell_(fields[key],max)]);
  }
  // Valider toute la fiche avant la première écriture : aucune modification partielle
  // ne doit être causée par une règle de publication, de prix ou de stock.
  const willBeActive=input.active===true||(yes_(p.Actif)&&input.active!==false);
  if(willBeActive && (!clean_(fields.ingredients??p['Ingrédients'],800)||
      !clean_(fields.allergens??p['Allergènes'],500)||
      !clean_(fields.dlc??p['DLC / conservation'],300)))
    fail_('Compléter ingrédients, allergènes et DLC/conservation avant publication');
  if(typeof input.active==='boolean')pending.push(['Actif',input.active?'Oui':'Non']);
  const variant=clean_(input.variant,20);
  if(variant){
    if(!LAURE.variants[variant])fail_('Format inconnu');
    const [on,price,stock]=LAURE.variants[variant];
    if(input.price!==undefined){
      const v=Number(input.price);
      if(!Number.isFinite(v)||v<0||v>1000)fail_('Prix incorrect');
      pending.push([price,Math.round(v*100)/100]);
    }
    if(input.stock!==undefined){
      const v=Number(input.stock);
      if(!Number.isInteger(v)||v<0||v>9999)fail_('Stock incorrect');
      pending.push([stock,v]);
    }
    if(typeof input.variantActive==='boolean')pending.push([on,input.variantActive?'Oui':'Non']);
  }
  // S'assurer que toutes les colonnes existent avant de modifier la feuille.
  pending.forEach(([column])=>idx_(data,column));
  pending.forEach(([column,value])=>updateCell_(data,p._row,column,value));
  return {updated:true};
});}
function editSlot_(input){return withLock_(()=>{
  const data=sourceData_('CRÉNEAUX');
  const slot=data.items.find(s=>dateISO_(s.Date)===clean_(input.date,20)&&s.Heure===clean_(input.time,30));
  if(!slot)fail_('Créneau non trouvé',404);
  if(input.available!==undefined){const n=Number(input.available);if(!Number.isInteger(n)||n<0||n>1000)fail_('Nombre de places incorrect');updateCell_(data,slot._row,'Places disponibles',n);}
  if(typeof input.active==='boolean')updateCell_(data,slot._row,'Actif',input.active?'Oui':'Non');
  return {updated:true};
});}

function appendCatalog_(data,values){
  const line=data.headers.map(key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:'');
  data.sheet.getRange(data.sheet.getLastRow()+1,1,1,line.length).setValues([line]);
}
function createSlot_(input){return withLock_(()=>{
  const data=sourceData_('CRÉNEAUX');
  const date=clean_(input.date,20), time=clean_(input.time,10),places=Number(input.available);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today_()||!Number.isFinite(new Date(date+'T12:00:00').valueOf()))fail_('Date invalide');
  if(!/^([01]?\d|2[0-3])h[0-5]\d$/.test(time))fail_('Heure attendue sous la forme 17h30');
  if(!Number.isInteger(places)||places<1||places>1000)fail_('Places invalides');
  if(data.items.some(x=>dateISO_(x.Date)===date&&x.Heure===time))fail_('Ce créneau existe déjà');
  const jour=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][new Date(date+'T12:00:00').getDay()];
  appendCatalog_(data,{Actif:'Oui',Date:date,Jour:jour,Heure:time,'Places disponibles':places});
  return {created:true};
});}
function createProduct_(input){return withLock_(()=>{
  const data=sourceData_('PLATS');
  const name=clean_(input.name,100),description=clean_(input.description,300),ingredients=clean_(input.ingredients,800);
  const allergens=clean_(input.allergens,500),image=clean_(input.image,400),conservation=clean_(input.conservation,50);
  const dlc=clean_(input.dlc,300),reheating=clean_(input.reheating,400);
  const price=Number(input.price),stock=Number(input.stock);
  const active2=input.active2===true;
  const price2=Number(input.price2),stock2=Number(input.stock2);
  if(active2&&(!Number.isFinite(price2)||price2<=0||price2>1000||!Number.isInteger(stock2)||stock2<0||stock2>9999))
    fail_('Prix ou stock incorrect pour 2 personnes');
  if(name.length<3||data.items.some(p=>slug_(p['Nom du plat'])===slug_(name)))fail_('Nom manquant ou déjà utilisé');
  if(!description||!ingredients||!allergens)fail_('Description, ingrédients et allergènes obligatoires pour créer un brouillon');
  if(!['Frais','Sous vide','Surgelé'].includes(conservation))fail_('État de conservation incorrect');
  if(!Number.isFinite(price)||price<=0||price>1000||!Number.isInteger(stock)||stock<0||stock>9999)fail_('Prix ou stock incorrect');
  if(image&&!/^https:\/\//i.test(image))fail_('Lien photo incorrect');
  // Le brouillon reste NON PUBLIÉ tant que les informations techniques ne sont pas vérifiées.
  appendCatalog_(data,{'Actif':'Non','Nom du plat':safeCell_(name,100),'Description courte':safeCell_(description,300),
    'Ingrédients':safeCell_(ingredients,800),'Allergènes':safeCell_(allergens,500),
    'DLC / conservation':safeCell_(dlc,300),'Réchauffage':safeCell_(reheating,400),
    'État actuel':conservation,'Photo principale URL Google Drive':image,
    'Format 1 personne actif':'Oui','Prix 1 personne':Math.round(price*100)/100,'Stock 1 personne':stock,
    'Format 2 personnes actif':active2?'Oui':'Non','Prix 2 personnes':active2?Math.round(price2*100)/100:'','Stock 2 personnes':active2?stock2:0,
    'Format 4 personnes actif':'Non'});
  return {created:true,draft:true,id:slug_(name)};
});}


/**
 * Photos produits V2. Les photos publiées sont volontairement accessibles via
 * un lien Google Drive ; aucun fichier client ni document privé n'est partagé.
 * La seule action de suppression porte sur les fichiers du dossier géré ici.
 */
function laurePhotosFolder_(){
  const props=PropertiesService.getScriptProperties();
  const id=props.getProperty('LAURE_PHOTOS_FOLDER_ID');
  if(id){
    const saved=DriveApp.getFolderById(id);
    if(saved.isTrashed())fail_('Dossier photos placé à la corbeille',503);
    return saved;
  }
  const catalogFile=DriveApp.getFileById(prop_('CATALOG_SPREADSHEET_ID'));
  const parents=catalogFile.getParents();
  const parent=parents.hasNext()?parents.next():DriveApp.getRootFolder();
  const title='Photos des plats - Les Barquettes de Laure';
  const matches=parent.getFoldersByName(title);
  const folder=matches.hasNext()?matches.next():parent.createFolder(title);
  props.setProperty('LAURE_PHOTOS_FOLDER_ID',folder.getId());
  return folder;
}
function productById_(id){
  const data=sourceData_('PLATS');
  const product=data.items.find(p=>slug_(p['Nom du plat'])===clean_(id,150));
  if(!product)fail_('Plat introuvable',404);
  return {data,product};
}
function driveId_(url){
  const str=String(url||'');
  const match=str.match(/\/d\/([A-Za-z0-9_-]{15,})/)||str.match(/[?&]id=([A-Za-z0-9_-]{15,})/);
  return match?match[1]:'';
}
function isInLaureFolder_(file,folder){
  const parents=file.getParents();
  while(parents.hasNext())if(parents.next().getId()===folder.getId())return true;
  return false;
}
function cleanupOldPhoto_(oldUrl,folder){
  const oldId=driveId_(oldUrl);
  if(!oldId)return;
  try{
    const data=sourceData_('PLATS');
    if(data.items.some(p=>driveId_(p['Photo principale URL Google Drive'])===oldId))return;
    const file=DriveApp.getFileById(oldId);
    if(isInLaureFolder_(file,folder))file.setTrashed(true);
  }catch(err){console.warn('Ancienne photo conservée : '+err.message);}
}
function uploadProductPhoto_(input){return withLock_(()=>{
  if(!input || typeof input!=='object')fail_('Photo absente');
  const encoded=String(input.jpegBase64||'');
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length>700000||encoded.length<100)
    fail_('Photo JPEG incorrecte ou trop volumineuse');
  const bytes=Utilities.base64Decode(encoded);
  if(bytes.length>500000||bytes.length<100||((bytes[0]&255)!==255)||((bytes[1]&255)!==216)||((bytes[2]&255)!==255))
    fail_('Photo JPEG invalide ou trop volumineuse (500 Ko maximum)');
  const {data,product}=productById_(input.id);
  const folder=laurePhotosFolder_();
  const oldUrl=product['Photo principale URL Google Drive']||'';
  const filename='Plat '+slug_(product['Nom du plat'])+' '+Utilities.formatDate(new Date(),'Europe/Paris','yyyyMMdd-HHmmss')+'.jpg';
  const file=folder.createFile(Utilities.newBlob(bytes,'image/jpeg',filename));
  let saved=false;
  try{
    // Un lien public de consultation pour cette photo uniquement.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
    const url='https://drive.google.com/file/d/'+file.getId()+'/view';
    updateCell_(data,product._row,'Photo principale URL Google Drive',url);
    saved=true;
    cleanupOldPhoto_(oldUrl,folder);
    return {uploaded:true,image:url};
  }finally{
    if(!saved){try{file.setTrashed(true);}catch(err){console.warn(err);}}
  }
});}
function deleteProductPhoto_(input){return withLock_(()=>{
  const {data,product}=productById_(input.id);
  const oldUrl=product['Photo principale URL Google Drive']||'';
  if(!oldUrl)return {deleted:false};
  const folder=laurePhotosFolder_();
  updateCell_(data,product._row,'Photo principale URL Google Drive','');
  // Ne place jamais à la corbeille une photo extérieure au dossier géré.
  cleanupOldPhoto_(oldUrl,folder);
  return {deleted:true};
});}

/** À exécuter UNE FOIS dans l'éditeur Apps Script pour autoriser Drive et créer le dossier. */
function initialiserPhotosLaure(){
  const folder=laurePhotosFolder_();
  Logger.log('Dossier photos créé ou retrouvé : '+folder.getUrl());
  return folder.getUrl();
}
