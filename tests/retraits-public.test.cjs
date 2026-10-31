const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const box={window:{},Intl,Date,console};const now=new Date();
 const iso=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris'}).format(now);
 const future=new Date(Date.parse(iso+'T12:00:00Z')+4*86400000).toISOString().slice(0,10);
 const yesterday=new Date(Date.parse(future+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const csv={
  '1098918812':'Section,Élément,Valeur\nIDENTITÉ,Nom commercial,Laure',
  '2056572397':'Actif,Nom du plat,Format 1 personne actif,Prix 1 personne,Stock 1 personne,État actuel\nOui,Lasagnes,Oui,9.5,5,Frais',
  '1555121259':`Actif,Date,Heure,Heure fin,Clôture commandes,Places disponibles,Jour\nOui,${future},17h30,19h00,${yesterday}T18:00,5,Dimanche\nOui,${future},12h00,,,2,Dimanche\nOui,${future},14h00,15h00,2020-01-01T18:00,9,Dimanche\nNon,${future},10h00,11h00,,3,Dimanche`
 };
 box.fetch=async path=>({ok:true,text:async()=>csv[new URL(path,'https://example.test').searchParams.get('gid')]});
 vm.createContext(box);vm.runInContext(fs.readFileSync('site-data.js','utf8'),box);
 const result=await box.window.SiteData.load();assert.equal(result.jours.length,1);assert.equal(result.jours[0].creneaux.length,2);
 assert.deepEqual(Array.from(result.jours[0].creneaux.map(x=>x.label)),['12h00','17h30 – 19h00']);
 assert.equal(result.jours[0].creneaux[1].start,'17h30');assert.equal(result.jours[0].creneaux[1].cutoff,yesterday+'T18:00');
 assert.equal(result.jours[0].plage,'12h00 · 17h30 – 19h00');
 const html=fs.readFileSync('index.html','utf8');assert(html.includes('pickupTime:creneauObj.start||creneauObj.label'));
 assert(html.includes('Plage horaire de retrait'));assert(html.includes('ordersClosed: !this.ordersAvailable()'));
 assert(html.includes('site-data.js?v=retraits-1'));
 console.log('OK : plages et dates limites publiques, heures anciennes compatibles, commandes futures, identité du début préservée.');
})().catch(e=>{console.error(e);process.exitCode=1;});
