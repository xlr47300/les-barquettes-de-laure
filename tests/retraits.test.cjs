// Tests locaux de la nouvelle gestion des plages et des précommandes.
// Aucune commande réelle et aucun accès à Google ou Cloudflare.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
let fixture=fs.readFileSync('tests/backend.test.cjs','utf8').split('const r1=')[0];
const box={require,console:{log(){},error(){}},Buffer};vm.createContext(box);
const {app,publicBook,privateBook,submit,o}=vm.runInContext(fixture+';({app,publicBook,privateBook,submit,o});',box);
const sheet=publicBook.getSheetByName('CRÉNEAUX');
const originalValues=JSON.stringify(sheet.rows);
assert.equal(app.initialiserRetraitsLaure().ready,true);
assert.equal(app.initialiserRetraitsLaure().ready,true,'Migration relançable');
assert.equal(sheet.rows[3].filter(x=>x==='Heure fin').length,1);
assert.equal(sheet.rows[3].filter(x=>x==='Clôture commandes').length,1);
assert.equal(sheet.rows[3].filter(x=>x==='ID créneau').length,1);
assert.equal(sheet.rows[4].slice(0,4).join('|'),JSON.parse(originalValues)[4].slice(0,4).join('|'),'Cellules anciennes intactes');
const newSlot={date:'2026-11-05',time:'17h30',endTime:'19h00',cutoff:'2026-11-04T18:00',available:5};
assert.equal(submit('slotCreate',newSlot).ok,true,'Création');
assert.equal(submit('slotCreate',newSlot).ok,false,'Créneau dupliqué refusé');
let slots=submit('snapshot',{}).data.slots;
assert.equal(slots.length,2);
const created=slots.find(s=>s.date==='2026-11-05');assert(created.id);
assert.equal(created.endTime,'19h00');assert.equal(created.cutoff,newSlot.cutoff);
assert.equal(created.reservable,true);
const edit={action:'slot',id:created.id,date:created.date,time:created.time,newDate:'2026-11-06',newTime:'18h00',endTime:'20h00',cutoff:'2026-11-05T18:00',available:6,
 expected:{date:created.date,time:created.time,endTime:created.endTime,cutoff:created.cutoff,available:5}};
assert.equal(submit('slot',edit).ok,true,'Modifier date, horaires, cutoff, capacité');
slots=submit('snapshot',{}).data.slots;
const changed=slots.find(s=>s.id===created.id);
assert.equal(changed.date,'2026-11-06');assert.equal(changed.time,'18h00');assert.equal(changed.endTime,'20h00');assert.equal(changed.cutoff,'2026-11-05T18:00');
assert.equal(changed.available,6);
const preorder=submit('order',{...o,pickupDate:'2026-11-06',pickupTime:'18h00',requestKey:crypto.randomUUID(),items:[{...o.items[0],qty:1}]});
assert.equal(preorder.ok,true,JSON.stringify(preorder));
assert.equal(submit('snapshot',{}).data.slots.find(s=>s.id===created.id).available,5);
const moving=submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',newDate:'2026-11-07',expected:{date:'2026-11-06',time:'18h00'}});
assert.equal(moving.status,409,'Une plage réservée ne bouge pas');
assert.equal(submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',available:6,expected:{available:6}}).status,409,'Stock de places périmé refusé');
assert.equal(submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',cutoff:'2026-10-29T18:00',expected:{cutoff:'2026-11-05T18:00'}}).ok,true,'Clôture avancée');
assert.equal(submit('order',{...o,pickupDate:'2026-11-06',pickupTime:'18h00',requestKey:crypto.randomUUID(),items:[{...o.items[0],qty:1}]}).ok,false,'Réservation hors délai refusée même avec place');
assert.equal(submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',cutoff:'2026-11-07T18:00',expected:{cutoff:'2026-10-29T18:00'}}).ok,false,'Clôture après retrait refusée');
assert.equal(submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',cutoff:'2026-02-30T18:00',expected:{cutoff:'2026-10-29T18:00'}}).ok,false,'Clôture invalide refusée');
// Une annulation de réservation conserve l'identité historique du retrait.
assert.equal(submit('status',{id:preorder.data.orderId,status:'Annulée'}).ok,true);
assert.equal(submit('slot',{id:created.id,date:'2026-11-06',time:'18h00',newTime:'19h00',expected:{date:'2026-11-06',time:'18h00'}}).status,409,'Historique préservé même après annulation');
assert.equal(submit('snapshot',{}).data.slots.find(s=>s.id===created.id).available,6,'Restitution de place une seule fois');
console.log('OK : migration idempotente, créations, plages, précommande future, clôture, verrouillage des retraits réservés, conflits et annulation.');
// Une panne pendant le déplacement d'une plage doit être récupérable grâce à l'ID stable.
{
 const sandbox={require,console:{log(){},error(){}},Buffer};vm.createContext(sandbox);
 const env=vm.runInContext(fixture+';({app,publicBook,submit});',sandbox);
 env.app.initialiserRetraitsLaure();
 const previous=env.submit('snapshot',{}).data.slots[0];
 const original=env.app.runOperation_;
 env.app.runOperation_=function(sheet,row,op){
   const first=op.steps[0];
   env.publicBook.getSheetByName(first.sheet).getRange(first.row,first.col,1,1).setValues(first.after);
   throw Error('Panne simulée après la première écriture');
 };
 const interrupted=env.submit('slot',{id:previous.id,date:previous.date,time:previous.time,
   newDate:'2026-11-04',newTime:'18h00',endTime:'19h00',expected:{date:previous.date,time:previous.time,endTime:''}});
 assert.equal(interrupted.ok,false);
 env.app.runOperation_=original;
 const resumed=env.submit('snapshot',{});
 assert.equal(resumed.ok,true,JSON.stringify(resumed));
 assert.equal(resumed.data.slots[0].date,'2026-11-04');
 assert.equal(resumed.data.slots[0].time,'18h00');
 assert.equal(resumed.data.slots[0].endTime,'19h00');
 const journal=env.publicBook.getSheetByName('CRÉNEAUX');assert.equal(journal.rows[4][2],'18h00');
 console.log('OK : reprise après interruption d’un déplacement de plage avec ID immuable.');
}
