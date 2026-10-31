const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let fixture=fs.readFileSync('tests/backend.test.cjs','utf8').split('const r1=')[0];
const env={require,console:{log(){},error(){}},Buffer};vm.createContext(env);
const {app,publicBook}=vm.runInContext(fixture+';({app,publicBook});',env);
const files=new Map();let serial=0,created=0;const folderId='folder-application';
const iter=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};};
const makeFile=(id,name,managed=true)=>({id,name,trashed:false,getId(){return id;},getName(){return name;},getParents:()=>iter([{getId:()=>managed?folderId:'external'}]),setSharing(){},setTrashed(v){this.trashed=v;}});
const folder={getId:()=>folderId,isTrashed:()=>false,getFilesByName:name=>iter([...files.values()].filter(f=>f.name===name&&!f.trashed)),createFile(blob){const f=makeFile('file-abcdefghijklmnop-'+(++serial),blob.name);files.set(f.id,f);created++;return f;}};
app.DriveApp={Access:{ANYONE_WITH_LINK:'link'},Permission:{VIEW:'view'},getFolderById:()=>folder,getFileById:id=>{if(!files.has(id))throw Error('not found');return files.get(id);}};
app.PropertiesService.getScriptProperties().setProperty('LAURE_PHOTOS_FOLDER_ID',folderId);
app.Utilities.base64Decode=s=>Array.from(Buffer.from(s,'base64'));
app.Utilities.newBlob=(bytes,mime,name)=>({bytes,mime,name});
const products=publicBook.getSheetByName('PLATS');products.rows[3].push('Photo principale URL Google Drive','Photo 2 facultative');products.rows[4].push('','');
const imageColumn=products.rows[3].indexOf('Photo principale URL Google Drive');
const bytes=Buffer.alloc(1000,1);bytes[0]=255;bytes[1]=216;bytes[2]=255;
const payload={id:'lasagnes-maison',jpegBase64:bytes.toString('base64'),requestKey:'photo-key-12345678',expectedImage:''};
// Réponse perdue APRÈS écriture du lien, avant nettoyage : réutilisation du même fichier.
const oldUpdate=app.updateCell_;let fail=true;
app.updateCell_=(...args)=>{oldUpdate(...args);if(fail&&args[2]==='Photo principale URL Google Drive'){fail=false;throw Error('réponse perdue');}};
assert.throws(()=>app.uploadProductPhoto_(payload));
const url=products.rows[4][imageColumn];assert(url);assert.equal(created,1);
assert.equal(app.uploadProductPhoto_(payload).duplicate,true);assert.equal(created,1);
// Remplacement : conserver une photo encore référencée en secondaire.
products.rows[4][imageColumn+1]=url;
const second=app.uploadProductPhoto_({...payload,requestKey:'photo-key-22222222',expectedImage:url});assert.equal(created,2);
assert.equal(files.get(app.driveId_(url)).trashed,false);
// Conflit de remplacement périmé, aucun fichier supplémentaire.
assert.throws(()=>app.uploadProductPhoto_({...payload,requestKey:'photo-key-33333333'}),/changé/);assert.equal(created,2);
// Suppression de l'image actuelle et reprise : jamais de suppression d'image secondaire.
assert.equal(app.deleteProductPhoto_({id:payload.id,expectedImage:second.image}).deleted,true);
assert.equal(app.deleteProductPhoto_({id:payload.id,expectedImage:second.image}).deleted,true);
assert.equal(files.get(app.driveId_(second.image)).trashed,true);assert.equal(files.get(app.driveId_(url)).trashed,false);
// Fichier externe : retirer la référence sans toucher au fichier.
const external=makeFile('external-abcdefghijklmnop','external.jpg',false);files.set(external.id,external);
products.rows[4][imageColumn]='https://drive.google.com/file/d/'+external.id+'/view';app.deleteProductPhoto_({id:payload.id,expectedImage:products.rows[4][imageColumn]});assert.equal(external.trashed,false);
// Cadrage : exécuter les vraies fonctions avec un Canvas simulé, portrait et paysage.
const source=fs.readFileSync('gestion/app.js','utf8');const crop=source.slice(source.indexOf('// Le JPEG'),source.indexOf('function renderCatalogue'));
const elements=new Map();const $=key=>{if(!elements.has(key))elements.set(key,{value:'50',addEventListener(){}});return elements.get(key);};
let drawing;const sandbox={$ ,photoState:{},photoJob:0,state:{busy:false},crypto:require('node:crypto').webcrypto,URL:{revokeObjectURL(){}},document:{createElement:()=>({getContext:()=>({fillRect(){},drawImage(...a){drawing=a;}}),toDataURL:()=> 'data:image/jpeg;base64,'+bytes.toString('base64')})}};vm.createContext(sandbox);vm.runInContext(crop,sandbox);
for(const [w,h] of [[3024,4032],[4032,3024]]){
 sandbox.w=w;sandbox.h=h;$('#crop-zoom').value='1';$('#crop-x').value='50';$('#crop-y').value='50';
 vm.runInContext('cropImage={naturalWidth:w,naturalHeight:h};renderCrop();',sandbox);
 assert(drawing[1]>=0&&drawing[2]>=0);assert(drawing[3]<=1200&&drawing[4]<=900);assert(sandbox.photoState.base64.length<640000);
 $('#crop-zoom').value='2';$('#crop-y').value='0';vm.runInContext('renderCrop();',sandbox);const top=drawing[2];$('#crop-y').value='100';vm.runInContext('renderCrop();',sandbox);assert.notEqual(drawing[2],top);
}
console.log('OK : photo réponse perdue, remplacement, conflit, référence secondaire, suppression externe protégée ; Canvas simulé portrait/paysage, zoom et position.');
