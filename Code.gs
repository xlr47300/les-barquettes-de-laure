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
      case 'snapshot': result=withLock_(()=>snapshot_());break;
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
  try{resumeOperations_();return fn();}finally{try{SpreadsheetApp.flush();}finally{lock.releaseLock();}}
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
// Créneaux : date et heure de début restent les identifiants historiques des commandes.
const RETRAIT_COLS={end:'Heure fin',cutoff:'Clôture commandes',id:'ID créneau'};
function heureRetrait_(value){
  const m=clean_(value,12).match(/^([01]?\d|2[0-3])(?:h|:)([0-5]\d)$/);
  return m?m[1].padStart(2,'0')+'h'+m[2]:'';
}
function isoDateValide_(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T12:00:00Z');return !isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
}
function heureISO_(hour){return hour?hour.replace('h',':'):'';}
function clotureValide_(value){
  if(!value)return true;
  const match=value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/);
  return !!match&&isoDateValide_(match[1]);
}
function debutRetrait_(slot){const date=dateISO_(slot.Date),time=heureRetrait_(slot.Heure);return date&&time?date+'T'+heureISO_(time)+':00':'';}
function clotureRetrait_(slot){return deadlineTime_(slot[RETRAIT_COLS.cutoff])||debutRetrait_(slot);}
function retraitReservable_(slot){
  const start=debutRetrait_(slot),end=clotureRetrait_(slot),now=nowISO_();
  return !!start&&!!end&&now<start&&now<end;
}
function verifierSchemaRetraits_(data){
  Object.values(RETRAIT_COLS).forEach(col=>{if(!data.headers.includes(col))fail_('Initialiser les retraits : exécuter initialiserRetraitsLaure dans Apps Script.',503);});
}
/** Migration additive : trois colonnes techniques, aucune modification des anciennes cellules. */
function initialiserRetraitsLaure(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(25000))fail_('Service occupé',503);
  try{
    resumeOperations_();
    const sheet=catalog_().getSheetByName('CRÉNEAUX');if(!sheet)fail_('Onglet CRÉNEAUX introuvable',503);
    const headers=sheet.getRange(4,1,1,sheet.getLastColumn()).getDisplayValues()[0].map(x=>clean_(x));
    for(const key of ['Actif','Date','Heure','Places disponibles'])if(!headers.includes(key))fail_('Colonne manquante : '+key,503);
    for(const name of Object.values(RETRAIT_COLS)){
      if(headers.filter(h=>h===name).length>1)fail_('En-tête dupliqué : '+name,503);
      if(!headers.includes(name)){
        if(headers.length>=52)fail_('Trop de colonnes pour la lecture publique A4:AZ1000.',503);
        const col=headers.length+1;ensureCapacity_(sheet,4,col);sheet.getRange(4,col).setValue(name);headers.push(name);
      }
    }
    const idCol=headers.indexOf(RETRAIT_COLS.id)+1,dateCol=headers.indexOf('Date')+1;
    for(let row=5;row<=sheet.getLastRow();row++){
      const hasDate=sheet.getRange(row,dateCol).getValue();
      if(hasDate&&!sheet.getRange(row,idCol).getValue())sheet.getRange(row,idCol).setValue(Utilities.getUuid());
    }
    SpreadsheetApp.flush();Logger.log('Colonnes de retrait prêtes. Les créneaux et commandes historiques sont conservés.');
    return {ready:true,headers:Object.values(RETRAIT_COLS)};
  }finally{lock.releaseLock();}
}

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
    const book=privateBook_(),orders=readPrivate_(book,'COMMANDES');
    const existing=orders.items.find(o=>o['Clé de requête']===requestKey);
    if(existing)return {orderId:existing.ID,total:numeric_(existing['Total TTC']),duplicate:true,items:receiptItems_(existing.ID)};
    const date=clean_(input.pickupDate,20),time=clean_(input.pickupTime,30);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today_())fail_('Date de retrait invalide');
    const cart=input.items;
    if(!Array.isArray(cart)||cart.length===0||cart.length>20)fail_('Panier incorrect');
    const slotData=sourceData_('CRÉNEAUX');
    const slot=slotData.items.find(s=>yes_(s.Actif)&&dateISO_(s.Date)===date&&clean_(s.Heure,30)===time);
    if(!slot || numeric_(slot['Places disponibles'])<1)fail_('Ce créneau n’est plus disponible');
    if(!retraitReservable_(slot))fail_('La date limite de réservation de ce retrait est dépassée');
    if(!heureRetrait_(time))fail_('Heure de retrait incorrecte');
    const plats=sourceData_('PLATS');
    const wanted=new Map(),lines=[];
    let totalCents=0;
    for(const item of cart){
      if(!item || typeof item!=='object')fail_('Ligne incorrecte');
      const itemId=clean_(item.platId,150),variant=clean_(item.variantId,20),qty=Number(item.qty);
      if(!Number.isInteger(qty)||qty<1||qty>30)fail_('Quantité incorrecte');
      if(variant==='formule')fail_('Les formules ne sont pas ouvertes à la réservation en ligne.');
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
    const steps=[];
    for(const w of wanted.values())steps.push(dataWrite_(plats,w.p._row,w.stockCol,w.initial-w.qty));
    steps.push(dataWrite_(slotData,slot._row,'Places disponibles',slotBefore-1));
    const order=[orderId,nowISO_(),safeCell_(name,100),safeCell_(phone,30),safeCell_(email,150),date,time,'À confirmer','Non réglée',totalCents/100,manual?'Manuelle':'Site',safeCell_(note,700),requestKey];
    steps.push(plannedWrite_('private','COMMANDES',orders.sheet.getLastRow()+1,1,[order]));
    const lineSheet=book.getSheetByName('LIGNES');
    const values=lines.map(l=>[orderId,l.id,l.name,l.variant,l.label,l.conservation,l.qty,l.price/100,l.qty*l.price/100,l.stock?'Oui':'Non']);
    steps.push(plannedWrite_('private','LIGNES',lineSheet.getLastRow()+1,1,values));
    steps.push(journalStep_(book,orderId,'Création',manual?'Saisie manuelle':'Demande site'));
    commitOperation_('order-'+requestKey,steps);
    notifyLaure_(orderId,name,phone,date,heureRetrait_(slot[RETRAIT_COLS.end])?time+' – '+heureRetrait_(slot[RETRAIT_COLS.end]):time,lines,totalCents/100);
    return {orderId,total:totalCents/100,duplicate:false,items:receiptItems_(orderId)};
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
    pickupDate:dateISO_(o['Date retrait']),pickupTime:o['Heure retrait'],status:o.Statut,payment:o.Paiement,
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
  const slots=sourceData_('CRÉNEAUX').items.filter(s=>s.Date).map(s=>({id:clean_(s[RETRAIT_COLS.id],90),date:dateISO_(s.Date),time:heureRetrait_(s.Heure)||s.Heure,
    endTime:heureRetrait_(s[RETRAIT_COLS.end]),cutoff:(deadlineTime_(s[RETRAIT_COLS.cutoff])||'').slice(0,16),
    available:numeric_(s['Places disponibles']),active:yes_(s.Actif),reservable:yes_(s.Actif)&&numeric_(s['Places disponibles'])>0&&retraitReservable_(s)}));
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
  if(previous==='Retirée'&&!['Retirée','Annulée'].includes(status))fail_('Une commande retirée ne peut pas revenir en préparation.');
  if(previous==='Annulée'&&status!=='Annulée')fail_('Une commande annulée ne peut pas être réactivée : créer une nouvelle commande');
  const steps=[];
  if(status==='Annulée'&&previous!=='Annulée'&&previous!=='Retirée'){
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
    const slot=slots.items.find(s=>dateISO_(s.Date)===dateISO_(o['Date retrait'])&&s.Heure===o['Heure retrait']);
    if(!slot)fail_('Créneau de retrait introuvable : correction manuelle requise.');
    for(const c of changes.values())steps.push(dataWrite_(products,c.p._row,c.col,numeric_(c.p[c.col])+c.n));
    steps.push(dataWrite_(slots,slot._row,'Places disponibles',numeric_(slot['Places disponibles'])+1));
  }
  if(previous===status)return {id:o.ID,status};
  steps.push(dataWrite_(data,o._row,'Statut',status,'private'));
  steps.push(journalStep_(book,o.ID,'Statut',previous+' → '+status+(previous==='Retirée'&&status==='Annulée'?' (sans restitution)':'')));
  commitOperation_('status-'+Utilities.getUuid(),steps);
  return {id:o.ID,status};
});}
function changePayment_(input){return withLock_(()=>{
  const payment=clean_(input.payment,40);if(!LAURE.payments.includes(payment))fail_('Règlement non reconnu');
  const book=privateBook_(),{data,o}=findOrder_(book,input.id);
  commitOperation_('payment-'+Utilities.getUuid(),[dataWrite_(data,o._row,'Paiement',payment,'private'),journalStep_(book,o.ID,'Paiement',payment)]);
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
    if(Object.prototype.hasOwnProperty.call(fields,key)){expectedCell_(input,key,data,p._row,col);pending.push([col,safeCell_(fields[key],max)]);}
  }
  // Valider toute la fiche avant la première écriture : aucune modification partielle
  // ne doit être causée par une règle de publication, de prix ou de stock.
  const willBeActive=input.active===true||(yes_(p.Actif)&&input.active!==false);
  if(willBeActive && (!clean_(fields.ingredients??p['Ingrédients'],800)||
      !clean_(fields.allergens??p['Allergènes'],500)||
      !clean_(fields.dlc??p['DLC / conservation'],300)))
    fail_('Compléter ingrédients, allergènes et DLC/conservation avant publication');
  if(typeof input.active==='boolean'){expectedCell_(input,'active',data,p._row,'Actif','bool');pending.push(['Actif',input.active?'Oui':'Non']);}
  const variant=clean_(input.variant,20);
  if(variant){
    if(!LAURE.variants[variant])fail_('Format inconnu');
    const [on,price,stock]=LAURE.variants[variant];
    if(input.price!==undefined){
      expectedCell_(input,'price',data,p._row,price,'number');
      const v=Number(input.price);
      if(!Number.isFinite(v)||v<0||v>1000)fail_('Prix incorrect');
      pending.push([price,Math.round(v*100)/100]);
    }
    if(input.stock!==undefined){
      expectedCell_(input,'stock',data,p._row,stock,'number');
      const v=Number(input.stock);
      if(!Number.isInteger(v)||v<0||v>9999)fail_('Stock incorrect');
      pending.push([stock,v]);
    }
    if(typeof input.variantActive==='boolean'){expectedCell_(input,'variantActive',data,p._row,on,'bool');pending.push([on,input.variantActive?'Oui':'Non']);}
  }
  // S'assurer que toutes les colonnes existent avant de modifier la feuille.
  pending.forEach(([column])=>idx_(data,column));
  if(pending.length)commitOperation_('product-'+Utilities.getUuid(),pending.map(([column,value])=>dataWrite_(data,p._row,column,value)));
  return {updated:true};
});}
function editSlot_(input){return withLock_(()=>{
  const data=sourceData_('CRÉNEAUX');
  const originalId=clean_(input.id,90),oldDate=clean_(input.date,20),oldTime=heureRetrait_(input.time);
  const slot=data.items.find(s=>originalId&&clean_(s[RETRAIT_COLS.id],90)===originalId)||
    data.items.find(s=>dateISO_(s.Date)===oldDate&&heureRetrait_(s.Heure)===oldTime);
  if(!slot)fail_('Créneau introuvable. Actualisez la page.',404);
  const steps=[];
  const date=dateISO_(slot.Date),time=heureRetrait_(slot.Heure);
  const nextDate=input.newDate===undefined?date:clean_(input.newDate,20);
  const nextTime=input.newTime===undefined?time:heureRetrait_(input.newTime);
  const nextEnd=input.endTime===undefined?heureRetrait_(slot[RETRAIT_COLS.end]):heureRetrait_(input.endTime);
  const nextCutoff=input.cutoff===undefined?(deadlineTime_(slot[RETRAIT_COLS.cutoff])||'').slice(0,16):clean_(input.cutoff,20);
  const identityChange=nextDate!==date||nextTime!==time;
  const endChange=input.endTime!==undefined&&nextEnd!==heureRetrait_(slot[RETRAIT_COLS.end]);
  const cutoffChange=input.cutoff!==undefined&&nextCutoff!==(deadlineTime_(slot[RETRAIT_COLS.cutoff])||'').slice(0,16);
  if(input.newDate!==undefined||input.newTime!==undefined||input.endTime!==undefined||input.cutoff!==undefined){
    verifierSchemaRetraits_(data);
    if(!isoDateValide_(nextDate)||!nextTime||((identityChange||endChange)&&!nextEnd)||(nextEnd&&nextEnd<=nextTime))fail_('Date ou plage horaire incorrecte : l’heure de fin doit suivre le début.');
    if(nextDate<today_()&&(identityChange||endChange))fail_('Impossible de déplacer un retrait vers une date passée.');
    if(!clotureValide_(nextCutoff)||(nextCutoff&&nextCutoff>nextDate+'T'+heureISO_(nextTime)))fail_('La clôture doit précéder le début du retrait.');
    if(data.items.some(s=>s._row!==slot._row&&dateISO_(s.Date)===nextDate&&heureRetrait_(s.Heure)===nextTime))fail_('Un retrait existe déjà à cette date et heure.');
    const orderExists=(identityChange||endChange)&&readPrivate_(privateBook_(),'COMMANDES').items.some(o=>dateISO_(o['Date retrait'])===date&&heureRetrait_(o['Heure retrait'])===time);
    if(orderExists)fail_('Des commandes sont déjà associées à ce retrait. Sa date ou sa plage ne peut pas être déplacée : fermez-le et créez un nouveau créneau.',409);
    if(identityChange){
      if(input.expected?.date!==date||heureRetrait_(input.expected?.time)!==time)fail_('Ce retrait a été modifié : actualisez la page.',409);
      if(nextDate!==date){steps.push(dataWrite_(data,slot._row,'Date',nextDate));
        const jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
        const jour=jours[new Date(nextDate+'T12:00:00Z').getUTCDay()];
        if(data.headers.includes('Jour'))steps.push(dataWrite_(data,slot._row,'Jour',jour));
      }
      if(nextTime!==time)steps.push(dataWrite_(data,slot._row,'Heure',nextTime));
    }
    if(endChange){expectedCell_(input,'endTime',data,slot._row,RETRAIT_COLS.end);steps.push(dataWrite_(data,slot._row,RETRAIT_COLS.end,nextEnd));}
    if(cutoffChange){
      const current=(deadlineTime_(slot[RETRAIT_COLS.cutoff])||'').slice(0,16);
      if(input.expected?.cutoff!==current)fail_('La clôture a été modifiée : actualisez.',409);
      steps.push(dataWrite_(data,slot._row,RETRAIT_COLS.cutoff,nextCutoff));
    }
  }
  if(input.available!==undefined){expectedCell_(input,'available',data,slot._row,'Places disponibles','number');const n=Number(input.available);if(!Number.isInteger(n)||n<0||n>1000)fail_('Nombre de places incorrect');steps.push(dataWrite_(data,slot._row,'Places disponibles',n));}
  if(typeof input.active==='boolean'){expectedCell_(input,'active',data,slot._row,'Actif','bool');steps.push(dataWrite_(data,slot._row,'Actif',input.active?'Oui':'Non'));}
  if(steps.length)commitOperation_('slot-'+Utilities.getUuid(),steps);
  return {updated:true};
});}

function appendCatalog_(data,values){
  const line=data.headers.map(key=>Object.prototype.hasOwnProperty.call(values,key)?values[key]:'');
  data.sheet.getRange(data.sheet.getLastRow()+1,1,1,line.length).setValues([line]);
}
function createSlot_(input){return withLock_(()=>{
  const data=sourceData_('CRÉNEAUX');verifierSchemaRetraits_(data);
  const date=clean_(input.date,20),time=heureRetrait_(input.time),endTime=heureRetrait_(input.endTime);
  const cutoff=clean_(input.cutoff,20),places=Number(input.available);
  if(!isoDateValide_(date)||date<today_())fail_('Date de retrait invalide');
  if(!time||!endTime||endTime<=time)fail_('Choisissez une heure de fin après l’heure de début.');
  if(!clotureValide_(cutoff)||(cutoff&&cutoff>date+'T'+heureISO_(time)))fail_('La clôture doit précéder le début du retrait.');
  if(!Number.isInteger(places)||places<0||places>1000)fail_('Nombre de commandes incorrect');
  if(data.items.some(x=>dateISO_(x.Date)===date&&heureRetrait_(x.Heure)===time))fail_('Ce retrait existe déjà');
  const jours=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const jour=jours[new Date(date+'T12:00:00Z').getUTCDay()];
  const values={Actif:input.active===false?'Non':'Oui',Date:date,Jour:jour,Heure:time,'Places disponibles':places,
    [RETRAIT_COLS.end]:endTime,[RETRAIT_COLS.cutoff]:cutoff,[RETRAIT_COLS.id]:Utilities.getUuid()};
  // Création append : chaque nouvelle ligne possède dès l'origine un identifiant stable.
  appendCatalog_(data,values);
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
  if(!matches.hasNext())fail_('Dossier photos introuvable : renseigner LAURE_PHOTOS_FOLDER_ID.',503);
  const folder=matches.next();
  if(matches.hasNext())fail_('Plusieurs dossiers photos : renseigner LAURE_PHOTOS_FOLDER_ID.',503);
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
    if(data.items.some(p=>Object.keys(p).some(key=>/photo/i.test(key)&&driveId_(p[key])===oldId)))return;
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
  const token=clean_(input.requestKey,90);
  if(!/^[a-zA-Z0-9-]{12,90}$/.test(token))fail_('Référence photo absente');
  const filename='laure-'+token+'.jpg';
  if(oldUrl){
    try{
      const current=DriveApp.getFileById(driveId_(oldUrl));
      if(isInLaureFolder_(current,folder)&&current.getName()===filename){
        cleanupOldPhoto_(input.expectedImage,folder);return {uploaded:true,image:oldUrl,duplicate:true};
      }
    }catch(e){if(e.status)throw e;}
  }
  if(typeof input.expectedImage!=='string'||oldUrl!==input.expectedImage)fail_('La photo a changé. Actualisez la fiche avant de réessayer.',409);
  const matches=folder.getFilesByName(filename);
  const file=matches.hasNext()?matches.next():folder.createFile(Utilities.newBlob(bytes,'image/jpeg',filename));
  // Conserver un fichier dont la réponse a été perdue permet une reprise sans doublon.
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  const url='https://drive.google.com/file/d/'+file.getId()+'/view';
  updateCell_(data,product._row,'Photo principale URL Google Drive',url);
  SpreadsheetApp.flush();
  cleanupOldPhoto_(oldUrl,folder);
  return {uploaded:true,image:url};
});}
function deleteProductPhoto_(input){return withLock_(()=>{
  const {data,product}=productById_(input.id);
  const oldUrl=product['Photo principale URL Google Drive']||'';
  if(!oldUrl)return {deleted:true};
  if(typeof input.expectedImage!=='string'||input.expectedImage!==oldUrl)fail_('La photo a changé. Actualisez la fiche avant de la retirer.',409);
  const folder=laurePhotosFolder_();
  updateCell_(data,product._row,'Photo principale URL Google Drive','');
  SpreadsheetApp.flush();
  // Ne place jamais à la corbeille une photo extérieure au dossier géré.
  cleanupOldPhoto_(oldUrl,folder);
  return {deleted:true};
});}

/** À exécuter UNE FOIS dans l'éditeur Apps Script pour autoriser Drive et vérifier le dossier existant. */
function initialiserPhotosLaure(){
  const folder=laurePhotosFolder_();
  Logger.log('Dossier photos créé ou retrouvé : '+folder.getUrl());
  return folder.getUrl();
}

// Journal privé de reprise. Ne jamais modifier ou trier OPERATIONS manuellement.
const OP_HEADERS=['ID','Opération JSON'];
function initialiserStabilisationLaure(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(25000))fail_('Service occupé',503);
  try{
    const book=privateBook_();let sheet=book.getSheetByName('OPERATIONS');
    if(!sheet)sheet=book.insertSheet('OPERATIONS');
    if(sheet.getLastRow()===0)sheet.getRange(1,1,1,2).setValues([OP_HEADERS]);
    if(sheet.getRange(1,1,1,2).getDisplayValues()[0].join('|')!==OP_HEADERS.join('|'))fail_('Structure OPERATIONS inattendue : aucune donnée écrasée',503);
    SpreadsheetApp.flush();return {ready:true};
  }finally{lock.releaseLock();}
}
function operationsSheet_(){
  const s=privateBook_().getSheetByName('OPERATIONS');
  if(!s||s.getRange(1,1,1,2).getDisplayValues()[0].join('|')!==OP_HEADERS.join('|'))
    fail_('Initialisation requise : lancer initialiserStabilisationLaure dans Apps Script.',503);
  return s;
}
function sameValue_(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function plannedWrite_(book,sheet,row,col,after){
  const target=(book==='catalog'?catalog_():privateBook_()).getSheetByName(sheet);
  if(!target)fail_('Feuille absente : '+sheet,503);
  ensureCapacity_(target,row+after.length-1,col+after[0].length-1);
  const before=target.getRange(row,col,after.length,after[0].length).getValues();
  // Aucun objet Date ou formule à réécrire dans les champs de gestion.
  const normal=values=>JSON.parse(JSON.stringify(values));
  const anchors=[];
  if(book==='catalog'&&row>4&&['PLATS','CRÉNEAUX'].includes(sheet)){
    const headers=target.getRange(4,1,1,target.getLastColumn()).getDisplayValues()[0];
    const stableSlot=sheet==='CRÉNEAUX'&&headers.includes(RETRAIT_COLS.id)&&
      !!target.getRange(row,headers.indexOf(RETRAIT_COLS.id)+1).getValue();
    for(const key of sheet==='PLATS'?['Nom du plat']:stableSlot?[RETRAIT_COLS.id]:['Date','Heure']){
      const anchorCol=headers.indexOf(key)+1;if(anchorCol<1)fail_('Identité de ligne absente : '+key,503);
      anchors.push({row,col:anchorCol,value:normal([[target.getRange(row,anchorCol).getValue()]])[0][0]});
    }
  }
  return {book,sheet,row,col,before:normal(before),after:normal(after),anchors};
}
function dataWrite_(data,row,column,value,book='catalog'){
  return plannedWrite_(book,data.sheet.getName(),row,idx_(data,column),[[value]]);
}
function runOperation_(sheet,row,op){
  for(const step of op.steps){
    const book=step.book==='catalog'?catalog_():privateBook_();
    const target=book.getSheetByName(step.sheet);
    if(!target)fail_('Reprise bloquée : feuille manquante. Contacter le support.',503);
    for(const anchor of step.anchors||[]){
      if(!sameValue_(JSON.parse(JSON.stringify(target.getRange(anchor.row,anchor.col).getValue())),anchor.value))fail_('Reprise bloquée : une ligne a été déplacée ou renommée.',503);
    }
    const range=target.getRange(step.row,step.col,step.after.length,step.after[0].length);
    const values=JSON.parse(JSON.stringify(range.getValues()));
    // Une reprise accepte seulement les valeurs prévues avant OU après écriture.
    // Les autres écritures de l'application attendent cette reprise, sous le même verrou.
    for(let i=0;i<values.length;i++)for(let j=0;j<values[i].length;j++){
      if(!sameValue_(values[i][j],step.before[i][j])&&!sameValue_(values[i][j],step.after[i][j]))
        fail_('Reprise bloquée : données modifiées hors opération. Ne pas réessayer de corriger le stock manuellement ; contacter le support.',503);
    }
    if(!sameValue_(values,step.after)){range.setValues(step.after);SpreadsheetApp.flush();}
  }
  op.state='done';sheet.getRange(row,2).setValue(JSON.stringify(op));SpreadsheetApp.flush();
}
function resumeOperations_(){
  const sheet=operationsSheet_();const n=sheet.getLastRow()-1;if(n<1)return;
  const rows=sheet.getRange(2,1,n,2).getValues();
  for(let i=0;i<rows.length;i++){
    if(!rows[i][0])continue;
    let op;try{op=JSON.parse(rows[i][1]);}catch(e){fail_('Journal technique illisible : contacter le support.',503);}
    if(op.id!==rows[i][0]||!Array.isArray(op.steps)||!['pending','done'].includes(op.state))fail_('Journal technique incohérent',503);
    if(op.state==='pending')runOperation_(sheet,i+2,op);
  }
}
function commitOperation_(id,steps){
  const sheet=operationsSheet_();
  const op={id,state:'pending',created:nowISO_(),steps};const json=JSON.stringify(op);
  if(json.length>45000)fail_('Opération trop volumineuse',422);
  const row=sheet.getLastRow()+1;
  ensureCapacity_(sheet,row,2);
  sheet.getRange(row,1,1,2).setValues([[id,json]]);SpreadsheetApp.flush();
  runOperation_(sheet,row,op);
}
function journalStep_(book,id,action,detail){
  const sheet=book.getSheetByName('JOURNAL');
  return plannedWrite_('private','JOURNAL',sheet.getLastRow()+1,1,[[nowISO_(),id,action,clean_(detail,500)]]);
}
function expectedCell_(input,key,data,row,column,kind='text'){
  const col=idx_(data,column),current=data.sheet.getRange(row,col).getValue();
  const normalize=v=>kind==='number'?numeric_(v):kind==='bool'?yes_(v):String(v??'');
  if(!input.expected||!Object.prototype.hasOwnProperty.call(input.expected,key)||!sameValue_(normalize(current),normalize(input.expected[key])))
    fail_('Ces données ont changé ou cette page est ancienne. Actualisez avant de réessayer.',409);
}

function ensureCapacity_(sheet,lastRow,lastColumn){
  if(typeof sheet.getMaxRows==='function'&&sheet.getMaxRows()<lastRow)sheet.insertRowsAfter(sheet.getMaxRows(),lastRow-sheet.getMaxRows());
  if(typeof sheet.getMaxColumns==='function'&&sheet.getMaxColumns()<lastColumn)sheet.insertColumnsAfter(sheet.getMaxColumns(),lastColumn-sheet.getMaxColumns());
}
// Diagnostic en lecture seule, utilisable avant une marche arrière. Ne reprend aucune écriture.
function etatStabilisationLaure(){
  const sheet=operationsSheet_();const n=sheet.getLastRow()-1;
  const pending=n<1?[]:sheet.getRange(2,1,n,2).getValues().filter(row=>row[0]&&JSON.parse(row[1]).state!=='done').map(row=>row[0]);
  Logger.log(JSON.stringify({pending}));return {pending};
}

function receiptItems_(orderId){
  return orderLines_(privateBook_()).filter(line=>line['Commande ID']===orderId).map(line=>({
    name:line.Plat,variantLabel:line.Format,conservation:line.Conservation,
    qty:numeric_(line['Quantité']),unitPrice:numeric_(line['Prix unitaire TTC']),lineTotal:numeric_(line['Montant TTC'])
  }));
}
