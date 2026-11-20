// node test-email-log.cjs — admin "อีเมลที่ส่งออก" menu: admin-only, escapes HTML, renders all statuses, wired in nav + function logging
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const dir=__dirname,app=fs.readFileSync(dir+'/app.js','utf8');
const els={};const el=id=>els[id]||(els[id]={innerHTML:'',textContent:'',classList:{toggle(){},add(){},remove(){}}});
const c={window:{addEventListener(){}},document:{addEventListener(){},getElementById:el},setTimeout,clearTimeout};
vm.createContext(c);vm.runInContext(app,c);
const rows=[
 {created_at:'2026-11-19T01:00:00Z',status:'sent',fn:'send-report',actor:'a@x.com',recipients:'b@x.com',provider_ref:'<abc@smtp-relay.mailin.fr>',subject:'S1',filenames:'r.docx',message:'hello'},
 {created_at:'2026-11-19T01:01:00Z',status:'blocked',fn:'send-public-report',actor:null,recipients:'c@x.com',subject:'<img src=x onerror=alert(1)>',filenames:'x.docm',message:'m',error:'only .docx allowed'},
 {created_at:'2026-11-19T01:02:00Z',status:'failed',fn:'send-report',actor:'a@x.com',recipients:'d@x.com',subject:'S3',filenames:'r.docx',message:'m',error:'Brevo 401'}];
let table=null;
vm.runInContext('globalThis.sb={from:t=>{globalThis.__t=t;return {select(){return this},order(){return this},limit:async()=>({data:globalThis.__rows,error:null})}}};sb=globalThis.sb;',c);
c.__rows=rows;
(async()=>{
  // non-admin is refused and never queries
  vm.runInContext("user={isAdmin:false};view='emails';render=()=>{};toast=()=>{}",c);c.__t=null;
  await vm.runInContext('renderEmails()',c);assert.equal(c.__t,null,'non-admin must not query');
  // admin renders
  vm.runInContext("user={isAdmin:true};filter=''",c);await vm.runInContext('renderEmails()',c);
  assert.equal(c.__t,'email_log');
  const h=els.content.innerHTML;
  assert.ok(h.includes('ผู้ให้บริการรับคำขอ 1')&&h.includes('ไม่สำเร็จ 1')&&h.includes('ถูกบล็อก 1'),'counts');
  assert.ok(h.includes('Brevo Message ID')&&!h.includes('ส่งแล้ว'),'sent is not shown as delivered');
  assert.ok(h.includes('&lt;abc@smtp-relay.mailin.fr&gt;'),'provider ref shown and escaped');
  assert.ok(h.includes('ฟอร์มสาธารณะ')&&h.includes('only .docx allowed')&&h.includes('Brevo 401'));
  assert.ok(!h.includes('<img src=x'),'subject must be HTML-escaped');assert.ok(h.includes('&lt;img'));
  // wiring
  const html=fs.readFileSync(dir+'/index.html','utf8');
  assert.ok(/id="navEmails"[^>]*class="hidden"/.test(html),'nav hidden by default');
  assert.ok(app.includes("show('navEmails',user.isAdmin)"),'nav shown for admin only');
  for(const f of ['send-report','send-public-report']){const s=fs.readFileSync(dir+'/supabase/functions/'+f+'/index.ts','utf8');
    for(const st of ['sent','failed','blocked'])assert.ok(s.includes('status: "'+st+'"'),f+' logs '+st);}
  const sql=fs.readFileSync(dir+'/migration-email-log.sql','utf8');
  assert.ok(/enable row level security/.test(sql)&&!/for (insert|update|delete|all)/i.test(sql),'read-only RLS for admin');
  console.log('PASS email log menu');
})().catch(e=>{console.error(e);process.exit(1)});
