import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import definition from '../module.js';
import {WorkStore} from '../core/store.js';
const save=(s,collection,data,id)=>{const n=s.transact({operation:'save',collection,data,id,revision:s.read().revision});return id||n.data[collection].at(-1).id;};
const archive=(s,collection,id)=>s.transact({operation:'archive',collection,id,revision:s.read().revision});
const audit=s=>s.db.prepare('SELECT * FROM audit ORDER BY rowid').all();
const meeting={title:'SYNTHETIC meeting',date:'2026-10-25',transcript:'SYNTHETIC prepare draft. SYNTHETIC send report.',status:'draft'};
const task=id=>({meeting:id,quote:'SYNTHETIC prepare draft',action:'SYNTHETIC task',owner:'SYNTHETIC staff',due:'2099-12-31',status:'open'});
function rejected(s,action,pattern){const before=s.read(),events=audit(s);assert.throws(action,pattern);assert.deepEqual(s.read(),before);assert.deepEqual(audit(s),events);}

test('archived task quote protects its draft transcript while source-preserving corrections remain possible',()=>{
 const s=new WorkStore(definition);try{const m=save(s,'meetings',meeting),t=save(s,'tasks',task(m));archive(s,'tasks',t);
 rejected(s,()=>save(s,'meetings',{...meeting,transcript:'SYNTHETIC replaced text.'},m),/цитат/);
 save(s,'meetings',{...meeting,title:'SYNTHETIC corrected heading',transcript:meeting.transcript+' SYNTHETIC additional context.'},m);assert.equal(s.read().data.tasks[0].quote,task(m).quote);assert.equal(s.read().data.tasks[0].archived,true);
 }finally{s.close();}
});

test('archived meeting rejects new/retargeted tasks and reopening;existing open work may finish and history may be corrected',()=>{
 const s=new WorkStore(definition);try{const m=save(s,'meetings',meeting),live=save(s,'meetings',{...meeting,title:'SYNTHETIC other meeting'}),open=save(s,'tasks',task(m)),done=save(s,'tasks',{...task(m),status:'done'}),other=save(s,'tasks',task(live));archive(s,'meetings',m);
 for(const status of ['open','done'])rejected(s,()=>save(s,'tasks',{...task(m),status}),/архив/);
 rejected(s,()=>save(s,'tasks',task(m),other),/архив/);
 rejected(s,()=>save(s,'tasks',task(m),done),/архив/);
 save(s,'tasks',{...task(m),action:'SYNTHETIC adjusted open task',due:'2099-12-30'},open);save(s,'tasks',{...task(m),status:'done'},open);save(s,'tasks',{...task(m),action:'SYNTHETIC corrected history',status:'done'},done);assert.equal(s.read().data.tasks.find(x=>x.id===done).meeting,m);
 save(s,'tasks',{...task(live),action:'SYNTHETIC explicit source correction'},done);assert.equal(s.read().data.tasks.find(x=>x.id===done).meeting,live);save(s,'tasks',task(live));
 }finally{s.close();}
});

test('file restart and empty restore retain archival guards without freezing legacy invalid archived quotes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'protocollane-history-')),path=join(dir,'workspace.sqlite');let s=new WorkStore(definition,path);const restored=new WorkStore(definition),legacy=new WorkStore(definition);
 try{const m=save(s,'meetings',meeting),t=save(s,'tasks',task(m));archive(s,'tasks',t);const before=s.read(),events=audit(s),copy=s.export();s.close();s=new WorkStore(definition,path);assert.deepEqual(s.read(),before);assert.deepEqual(audit(s),events);restored.restore(copy);assert.deepEqual(restored.read().data,before.data);
 const oldCopy=structuredClone(copy);oldCopy.data.meetings[0].transcript='SYNTHETIC legacy text without prior quotation.';legacy.restore(oldCopy);assert.deepEqual(legacy.read().data,oldCopy.data);save(legacy,'meetings',{...meeting,title:'SYNTHETIC unrelated draft'});assert.equal(legacy.read().data.tasks[0].quote,task(m).quote);
 for(const current of [s,restored]){rejected(current,()=>save(current,'meetings',{...meeting,transcript:'SYNTHETIC remove archived quote'},m),/цитат/);archive(current,'meetings',m);rejected(current,()=>save(current,'tasks',task(m)),/архив/);assert.equal(current.read().data.tasks[0].meeting,m);assert.equal(current.read().data.tasks[0].quote,task(m).quote);}
 }finally{s.close();restored.close();legacy.close();rmSync(dir,{recursive:true,force:true});}
});
