// Exécution : node tests/backend.test.cjs
// Simulateur minimal Sheets/Apps Script : aucun accès réseau ni Google requis.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
class Sheet{
  constructor(name,rows=[]){this.name=name;this.rows=rows;}
  getName(){return this.name;}
  getLastRow(){return this.rows.length;}
  getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length));}
  getRange(row,col,nr=1,nc=1){
    const self=this;
    return {
      getValues(){return Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>self.rows[row+i-1]?.[col+j-1]??''));},
      getDisplayValues(){return this.getValues().map(row=>row.map(x=>String(x??'')));},
      getValue(){return self.rows[row-1]?.[col-1]??'';},
      setValue(v){while(self.rows.length<row)self.rows.push([]);while(self.rows[row-1].length<col)self.rows[row-1].push('');self.rows[row-1][col-1]=v;return this;},
      setValues(values){for(let i=0;i<nr;i++)for(let j=0;j<nc;j++)self.getRange(row+i,col+j).setValue(values[i][j]);return this;},
      setFontWeight(){return this;},setBackground(){return this;}
    };
  }
  appendRow(arr){this.rows.push(arr);}
  deleteRow(i){this.rows.splice(i-1,1);}
  setFrozenRows(){}
}
class Book{constructor(sheets){this.sheets=Object.fromEntries(sheets.map(x=>[x.name,x]));}
  getSheetByName(n){return this.sheets[n]||null;}
  insertSheet(n){return this.sheets[n]=new Sheet(n);}
  getId(){return 'private';}
  getUrl(){return 'sheet-url';}
}
const mainHeaders=['Actif','Nom du plat','Format 1 personne actif','Prix 1 personne','Stock 1 personne','Format 2 personnes actif','Prix 2 personnes','Stock 2 personnes','Format 4 personnes actif','Prix 4 personnes','Stock 4 personnes','État actuel','Peut être congelé','Disponible à partir du','Commander avant le'];
const publicBook=new Book([
 new Sheet('PLATS',[[],[],[],mainHeaders,['Oui','Lasagnes maison','Oui',9.5,5,'Oui',16,2,'Non',0,0,'Frais','Oui','','']]),
 new Sheet('CRÉNEAUX',[[],[],[],['Actif','Date','Heure','Places disponibles'],['Oui','2026-11-03','17h30',2]]),
 new Sheet('FORMULES',[[],[],[],['Actif','Nom','Prix TTC']])
]);
const privateBook=new Book([new Sheet('COMMANDES'),new Sheet('LIGNES'),new Sheet('JOURNAL')]);
const props={CATALOG_SPREADSHEET_ID:'public',PRIVATE_SPREADSHEET_ID:'private',API_SHARED_SECRET:'x'.repeat(40),NOTIFY_EMAIL:'laure@example.test'};
let emailCount=0;
const app={
 PropertiesService:{getScriptProperties(){return {getProperty:k=>props[k],setProperty:(k,v)=>props[k]=v};}},
 SpreadsheetApp:{flush:()=>{},openById:id=>id==='public'?publicBook:privateBook,create:()=>privateBook},
 LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 MailApp:{sendEmail:()=>emailCount++},
 Utilities:{formatDate:(d,tz,fmt)=>fmt==='yyyy-MM-dd'?'2026-10-30':fmt==='yyMMdd'?'261030':'2026-10-30T12:00:00',getUuid:()=>crypto.randomUUID()},
 ContentService:{MimeType:{JSON:'JSON'},createTextOutput(v){return {setMimeType(){return this;},getContent(){return v;}};}},
 console,Logger:{log:()=>{}}
};
vm.createContext(app);
vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),app);
const submit=(action,data,secret=props.API_SHARED_SECRET)=>JSON.parse(app.doPost({postData:{contents:JSON.stringify({action,data,secret})}}).getContent());
assert.equal(app.setupLaure(),'sheet-url');app.initialiserStabilisationLaure();
const o={name:'Sophie Martin',phone:'0612345678',email:'',pickupDate:'2026-11-03',pickupTime:'17h30',consent:true,requestKey:crypto.randomUUID(),items:[{platId:'lasagnes-maison',variantId:'indiv',conservation:'Frais',qty:3}]};
const r1=submit('order',o);assert.equal(r1.ok,true,JSON.stringify(r1));assert.equal(r1.data.total,28.5);
assert.equal(publicBook.getSheetByName('PLATS').rows[4][4],2);
assert.equal(publicBook.getSheetByName('CRÉNEAUX').rows[4][3],1);
assert.equal(emailCount,1);
const dup=submit('order',o);assert.equal(dup.ok,true);assert.equal(dup.data.duplicate,true);assert.equal(emailCount,1);
const tooMuch=submit('order',{...o,requestKey:crypto.randomUUID(),items:[{...o.items[0],qty:3}]});assert.equal(tooMuch.ok,false);
const manual=submit('manualOrder',{...o,requestKey:crypto.randomUUID(),name:'Marc Dubois',items:[{...o.items[0],qty:1,conservation:'Sous vide'}]});assert.equal(manual.ok,true,JSON.stringify(manual));
assert.equal(publicBook.getSheetByName('PLATS').rows[4][4],1);
const snap=submit('snapshot',{});assert.equal(snap.ok,true,JSON.stringify(snap));assert.equal(snap.data.orders.length,2);
assert.equal(snap.data.orders[0].lines.length,1);
const cancel=submit('status',{id:r1.data.orderId,status:'Annulée'});assert.equal(cancel.ok,true,JSON.stringify(cancel));
assert.equal(publicBook.getSheetByName('PLATS').rows[4][4],4);
assert.equal(publicBook.getSheetByName('CRÉNEAUX').rows[4][3],1);
assert.equal(submit('status',{id:r1.data.orderId,status:'Confirmée'}).ok,false);
assert.equal(submit('snapshot',{},'wrong-secret').status,403);
console.log('Tests OK : enregistrement, inventaire, créneaux, doublons, mail, saisie manuelle, annulation, authentification.');
