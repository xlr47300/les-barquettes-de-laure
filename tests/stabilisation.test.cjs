const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let fixture=fs.readFileSync('tests/backend.test.cjs','utf8').split('const r1=')[0];
fixture=fixture.replace('for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)self.getRange(row+i,col+j).setValue(values[i][j]);',"for(let i=0;i<nr;i++){while(self.rows.length<row+i)self.rows.push([]);for(let j=0;j<nc;j++)self.rows[row+i-1][col+j-1]=values[i][j];}");
function create(){
 const sandbox={require,console:{log(){},error(){}},Buffer};vm.createContext(sandbox);
 const env=vm.runInContext(fixture+';({app,publicBook,privateBook,submit,o,Sheet});',sandbox);
 let count=0,failAt=0,phase='';const range=env.Sheet.prototype.getRange;
 const event=fn=>{const n=++count;if(n===failAt&&phase==='before')throw Error('avant écriture');const r=fn();if(n===failAt&&phase==='after')throw Error('après écriture');return r;};
 env.Sheet.prototype.getRange=function(...args){const r=range.apply(this,args);for(const name of ['setValue','setValues']){const old=r[name];r[name]=(...v)=>event(()=>old.apply(r,v));}return r;};
 env.app.SpreadsheetApp.flush=()=>event(()=>{});
 return {...env,inject(n,when){count=0;failAt=n;phase=when;},count:()=>count};
}
const stock=e=>e.publicBook.getSheetByName('PLATS').rows[4][4];
const places=e=>e.publicBook.getSheetByName('CRÉNEAUX').rows[4][3];let scenarios=0;
for(const type of ['creation','annulation']){
 const probe=create();let order;if(type==='annulation')order=probe.submit('order',probe.o).data.orderId;
 probe.inject(0,'');probe.submit(type==='creation'?'order':'status',type==='creation'?probe.o:{id:order,status:'Annulée'});const count=probe.count();
 for(const phase of ['before','after'])for(let n=1;n<=count;n++){
  const e=create();let id;if(type==='annulation')id=e.submit('order',e.o).data.orderId;
  const action=type==='creation'?'order':'status',body=type==='creation'?e.o:{id,status:'Annulée'};
  e.inject(n,phase);e.submit(action,body);e.inject(0,'');
  for(let retry=0;retry<4;retry++){const result=e.submit(action,body);assert.equal(result.ok,true,`${type} ${phase} ${n}: ${JSON.stringify(result)}`);}
  assert.equal(stock(e),type==='creation'?2:5,`${type} stock ${phase} ${n}`);assert.equal(places(e),type==='creation'?1:2);
  assert.equal(e.privateBook.getSheetByName('COMMANDES').getLastRow(),2);assert.equal(e.privateBook.getSheetByName('LIGNES').getLastRow(),2);scenarios++;
 }
}
{
 const e=create();e.submit('order',e.o);
 assert.equal(e.submit('product',{id:'lasagnes-maison',active:false,variant:'indiv',stock:5,expected:{stock:5,active:true}}).status,409);assert.equal(stock(e),2);
 const products=e.publicBook.getSheetByName('PLATS');for(const [key,value] of [['Ingrédients','Pommes de terre'],['Allergènes','Lait'],['DLC / conservation','Au froid']]){products.rows[3].push(key);products.rows[4].push(value);}
 assert.equal(e.submit('product',{id:'lasagnes-maison',variant:'indiv',price:10,expected:{price:9.5}}).ok,true);assert.equal(stock(e),2);
 assert.equal(e.submit('product',{id:'lasagnes-maison',variant:'indiv',price:11,expected:{price:9.5}}).status,409);
 assert.equal(e.submit('slot',{date:'2026-11-03',time:'17h30',available:3,expected:{available:2}}).status,409);assert.equal(places(e),1);
}
{
 const e=create(),id=e.submit('order',e.o).data.orderId;
 assert.equal(e.submit('status',{id,status:'Retirée'}).ok,true);assert.equal(e.submit('status',{id,status:'Confirmée'}).ok,false);
 assert.equal(e.submit('status',{id,status:'Annulée'}).ok,true);assert.equal(stock(e),2);assert.equal(places(e),1);
}
{
 const e=create(),id=e.submit('order',e.o).data.orderId;e.privateBook.getSheetByName('OPERATIONS').rows=[['ID','Opération JSON']];
 e.app.initialiserStabilisationLaure();e.app.initialiserStabilisationLaure();assert.equal(e.submit('status',{id,status:'Annulée'}).ok,true);assert.equal(stock(e),5);
}
{
 const e=create(),original=e.app.runOperation_;e.app.runOperation_=()=>{throw Error('arrêt après plan');};e.submit('order',e.o);e.app.runOperation_=original;
 e.publicBook.getSheetByName('PLATS').rows[4][4]=99;assert.equal(e.submit('snapshot',{}).status,503);assert.equal(stock(e),99);
}
console.log(`OK : ${scenarios} injections avant/après écritures et flush, reprises répétées ; conflits prix/stock/places, retrait, historique et blocage externe.`);
{
 const e=create(),slots=e.publicBook.getSheetByName('CRÉNEAUX');slots.rows.push(['Oui','2026-11-04','18h00',3]);
 const a=e.submit('order',{...e.o,requestKey:require('node:crypto').randomUUID(),items:[{...e.o.items[0],qty:1},{...e.o.items[0],variantId:'duo',qty:1}]});assert(a.ok);
 const b=e.submit('order',{...e.o,requestKey:require('node:crypto').randomUUID(),pickupDate:'2026-11-04',pickupTime:'18h00',items:[{...e.o.items[0],qty:2}]});assert(b.ok);assert.equal(stock(e),2);assert.equal(e.publicBook.getSheetByName('PLATS').rows[4][7],1);
 assert(e.submit('status',{id:a.data.orderId,status:'Annulée'}).ok);assert.equal(stock(e),3);assert.equal(e.publicBook.getSheetByName('PLATS').rows[4][7],2);assert.equal(slots.rows[4][3],2);assert.equal(slots.rows[5][3],2);
}
console.log('OK : stock commun à deux dates de retrait, formats individuel/duo et restitution du seul créneau concerné.');
{
 const e=create(),id=e.submit('order',e.o).data.orderId;
 e.privateBook.getSheetByName('COMMANDES').rows[1][5]='03/11/2026';
 assert.equal(e.submit('snapshot',{}).data.orders[0].pickupDate,'2026-11-03');assert(e.submit('status',{id,status:'Annulée'}).ok);assert.equal(stock(e),5);
}
{
 const e=create(),original=e.app.runOperation_;e.app.runOperation_=()=>{throw Error('arrêt après plan');};e.submit('order',e.o);e.app.runOperation_=original;
 e.publicBook.getSheetByName('PLATS').rows[4][1]='Plat renommé hors application';
 assert.equal(e.submit('snapshot',{}).status,503);assert.equal(stock(e),5);
}
console.log('OK : ancienne date française normalisée et blocage sur identité de ligne modifiée.');
