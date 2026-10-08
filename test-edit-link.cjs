const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const calls=[];const c={window:{addEventListener(){}},document:{addEventListener(){},getElementById(){return null}},location:{href:'https://x.example/app/?a=1#old'},
  setTimeout:(f,ms)=>{calls.push('timer');return 1},clearTimeout(){}};
vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
const run=s=>vm.runInContext(s,c);
const H='a1'.repeat(32);

// ---- link parsing: only the exact shape is accepted ----
assert.deepEqual(JSON.parse(JSON.stringify(run(`parseEditHash('#edit=12.${H}')`))),{id:12,token:H});
for(const bad of ['', null, undefined, '#type=recovery', `#edit=12.${H.toUpperCase()}`, `#edit=12.${H.slice(1)}`, `#edit=12.${H}0`, `#edit=abc.${H}`, `#edit=.${H}`, `edit=12.${H}`, `#edit=12.${H}&x=1`, `#edit=1234567890123456.${H}`])
  assert.equal(run(`parseEditHash(${JSON.stringify(bad)})`),null,'rejects '+bad);
// ---- link building keeps path + query, replaces any old fragment, token only after # ----
assert.equal(run(`buildEditLink(7,'${H}')`),`https://x.example/app/?a=1#edit=7.${H}`);
assert.ok(!run(`buildEditLink(7,'${H}')`).split('#')[0].includes(H),'token must not be in the path/query');
// ---- fallback detection when DB has not been migrated ----
assert.equal(run(`isMissingRpc({code:'PGRST202',message:'x'})`),true);
assert.equal(run(`isMissingRpc({code:'42883',message:'x'})`),true);
assert.equal(run(`isMissingRpc({message:'Could not find the function public.submit_tdac_report_v2(payload) in the schema cache'})`),true);
assert.equal(run(`isMissingRpc({code:'28000',message:'ลิงก์แก้ไขไม่ถูกต้องหรือหมดอายุ'})`),false,'a real auth failure is NOT a missing function');
assert.equal(run(`isMissingRpc(null)`),false);
// ---- DB result -> draft shape used by applyDraft/setKiosks ----
const d=JSON.parse(JSON.stringify(run(`editDraftFrom({report:{report_date:'2026-10-07',shift:'IMP/D 10:00',officer:'ก',issue_log:'ปัญหา',inspect_start:'10:00',inspect_end:'11:00',web_pc_ready:true,web_pc_remark:'a',web_mobile_ready:false,web_mobile_remark:null,issue_photos:['p1'],web_pc_photos:[],web_mobile_photos:['p2']},kiosks:[{kiosk_id:'IMM001'}]})`)));
assert.deepEqual([d.date,d.shift,d.officer,d.issue,d.inspectStart,d.inspectEnd,d.webPc,d.webMobile,d.issuePhotos,d.webMobilePhotos,d.kiosks.length],['2026-10-07','IMP/D 10:00','ก','ปัญหา','10:00','11:00',true,false,['p1'],['p2'],1]);
assert.doesNotThrow(()=>run(`editDraftFrom(null)`)); assert.equal(run(`editDraftFrom({}).kiosks.length`),0);
// ---- email text ----
run(`lastEditLink='';lastEditExpires=''`); assert.equal(run('editLinkText()'),'','no link => nothing added to the email');
run(`lastEditLink='https://x/#edit=7.${H}';lastEditExpires='2026-10-14T05:00:00Z'`);
const t=run('editLinkText()'); assert.ok(t.includes(`#edit=7.${H}`)&&t.includes('ห้ามส่งต่อ')&&t.includes('ทุกเครื่อง'),'email carries link + warning');
run(`lastEditLink='';lastEditExpires=''`);

// ---- editing a SERVER report must never touch the browser's local draft ----
calls.length=0; run(`editCtx=null`); run('scheduleDraftSave()'); assert.ok(calls.includes('timer'),'normal mode schedules a draft save');
calls.length=0; run(`editCtx={id:7,token:'${H}'}`); run('scheduleDraftSave()'); assert.equal(calls.length,0,'edit mode: no draft save scheduled');
let touched=false; run(`readDraft=function(){return null}`); c.__spy=()=>{touched=true;return null}; run(`readDraft=function(){__spy();return null}`);
run('restoreDraftAfterLoad()'); assert.equal(touched,false,'edit mode: local draft not restored over the server report');
run('editThisRound=editThisRound'); 
c.document.getElementById=()=>({classList:{add(){},remove(){}},style:{}}); c.window.scrollTo=()=>{}; c.scrollTo=()=>{};
run('editThisRound()'); assert.equal(touched,false,'edit mode: "edit this round" reuses the form, not the local draft');
run(`editCtx=null`); run('restoreDraftAfterLoad()'); assert.equal(touched,true,'normal mode still reads the local draft');

// ---- static guards on the source ----
const src=fs.readFileSync(__dirname+'/app.js','utf8');
const uses=[...src.matchAll(/editCtx\.token/g)].length;
assert.ok(uses<=3,'token only used for RPC/link building, found '+uses);
assert.ok(!/localStorage[^;\n]*token/i.test(src),'token must never be written to localStorage');
assert.ok(!/console\.(log|info|debug)\([^)]*token/i.test(src),'token must never be logged');
assert.ok(/'update_tdac_report_by_token'/.test(src)&&/'get_tdac_report_for_edit'/.test(src)&&/'submit_tdac_report_v2'/.test(src));
const guide=fs.readFileSync(__dirname+'/guide.html','utf8');
for(const x of ['ลิงก์แก้ไขรายงานในอีเมล','7 วัน','ห้ามส่งต่อ','อย่าเปิดไฟล์ DOCX']) assert.ok(guide.includes(x),'guide mentions: '+x);
for(const x of ['ลิงก์แก้ไขรายงาน','7 วัน','ไม่เข้าระบบ']) assert.ok(src.includes(x),'in-app help mentions: '+x);
console.log('PASS edit-link: strict parsing, link building, migration fallback, draft isolation, token hygiene');
