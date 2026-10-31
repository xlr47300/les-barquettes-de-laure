const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
(async()=>{
 const storage=new Map(),events=[];
 const sandbox={crypto:webcrypto,TextEncoder,Uint8Array,Event:class{constructor(type){this.type=type;}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{dispatchEvent:e=>events.push(e.type)},document:{getElementById:()=>null},fetch:async url=>{assert.equal(url,'/api/config');return {ok:true,json:async()=>({ordersEnabled:false})};}};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync('laure-order.js','utf8'),sandbox);await new Promise(setImmediate);
 const api=sandbox.window.LaureOrders;assert.equal(api.isEnabled(),false);
 const body={name:'Client fictif',items:[{qty:2}]};const one=await api.requestKey(body);assert.equal(await api.requestKey(body),one);assert(![...storage.values()].join().includes('Client fictif'));
 assert.notEqual(await api.requestKey({...body,name:'Autre client fictif'}),one);api.newRequest();assert.notEqual(await api.requestKey(body),one);
 // Vérifier la persistance même après rechargement du module.
 const saved=await api.requestKey(body);vm.runInContext(fs.readFileSync('laure-order.js','utf8'),sandbox);assert.equal(await sandbox.window.LaureOrders.requestKey(body),saved);
 // Test des CSV, des créneaux passés et du rendu de confirmation : aucune requête réelle.
 const tomorrow=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date(Date.now()+86400000));
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(new Date());
 const csv={1098918812:'Section,Élément,Valeur\nIDENTITÉ,Nom commercial,Laure',2056572397:'Actif,Nom du plat,Format 1 personne actif,Prix 1 personne,Stock 1 personne,État actuel\nOui,Lasagnes,Oui,9.5,5,Frais',1555121259:`Actif,Date,Heure,Places disponibles,Jour\nOui,${today},00h00,5,Aujourd’hui\nOui,${tomorrow},17h30,5,Demain`};
 sandbox.fetch=async url=>({ok:true,text:async()=>csv[new URL(url,'https://local.test').searchParams.get('gid')]});
 sandbox.Intl=Intl;sandbox.console=console;sandbox.setTimeout=setTimeout;sandbox.clearTimeout=clearTimeout;
 sandbox.window.innerWidth=1200;sandbox.window.addEventListener=()=>{};sandbox.window.removeEventListener=()=>{};sandbox.window.scrollTo=()=>{};
 sandbox.document.querySelectorAll=()=>[];sandbox.document.getElementById=()=>({remove(){},style:{}});
 sandbox.DCLogic=class{constructor(){this.props={};}setState(update){Object.assign(this.state,update);}};
 vm.runInContext(fs.readFileSync('site-data.js','utf8'),sandbox);const data=await sandbox.window.SiteData.load();assert.equal(data.jours.length,1);assert.equal(data.jours[0].dateRaw,tomorrow);
 const html=fs.readFileSync('index.html','utf8');const script=html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1];vm.runInContext(script,sandbox);
 const component=vm.runInContext('new Component()',sandbox);component.applySheetCopy=()=>{};component.loadGoogleSheet();await new Promise(setImmediate);
 assert.equal(component.ordersAvailable(),false);
 sandbox.window.LaureOrders={isEnabled:()=>true,requestKey:async()=> 'fake-key-12345',newRequest(){},submit:async()=>({orderId:'FICTIVE',total:99,items:[{name:'Lasagnes',variantLabel:'1 personne',conservation:'Frais',qty:1,unitPrice:99,lineTotal:99}]})};
 component.state.form={nom:'Client Fictif',tel:'0612345678',email:'',note:'',ok:true};component.state.cart=[{platId:'lasagnes',variantId:'indiv',conservation:'Frais',qty:1}];
 assert.equal(component.ordersAvailable(),true);const values=component.renderVals();await values.onOrderSubmit({preventDefault(){}});
 assert.equal(component.state.ref,'FICTIVE');assert.equal(component.state.cart.length,0);assert.equal(component.renderVals().confirmTotal,'99,00 €');assert.equal(component.renderVals().confirmLines.length,1);assert.equal(component.renderVals().confirmLines[0].total,'99,00 €');
 // La saisie privée conserve aussi une clé stable, sans coordonnées stockées en session.
 const admin=fs.readFileSync('gestion/app.js','utf8');vm.runInContext(admin.slice(admin.indexOf('let manualMemory=')).split("\ndocument.addEventListener('error'")[0],sandbox);
 assert.equal(await sandbox.stableManualKey(body),await sandbox.stableManualKey(body));
 console.log('OK : clés public/privé stables, session sans coordonnées, configuration fermée, créneaux passés exclus, confirmation au montant serveur et panier vidé.');
})().catch(error=>{console.error(error);process.exitCode=1;});
