/* ============================================================
   app.js — OSO-TDAC Operational Report (GitHub Pages + Supabase)
   ระบบรายงานการตรวจสอบระบบ TDAC (Website + Kiosk) ณ ท่าอากาศยานสุวรรณภูมิ
   สถาปัตยกรรมหลังบ้านเดียวกับ OSO Evaluation (auth/RBAC/audit/report/auto-email)
   ============================================================ */

// ---------- ค่าคงที่ ----------
const APP_VERSION='18';
const KIOSK_COUNT=20;
const KIOSKS=Array.from({length:KIOSK_COUNT},(_,i)=>'IMM'+String(i+1).padStart(3,'0'));
const SUBSYS=[{t:'system',l:'System'},{t:'rustdesk',l:'RustDesk'},{t:'network',l:'Network'}];
const SHIFTS=['IMP/D 10:00','IMP/N 22:00'];
const THAI_MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ---------- globals ----------
let user=null, data={reports:[],officers:[],summary:{}};
let view='dashboard', filter='', detailId=0;
const LOADING='<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>';

// ---------- helpers ----------
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const num=x=>Number(x||0);
function js(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/[\r\n]/g,' ');}
function capL(t){const x=SUBSYS.find(s=>s.t===t);return x?x.l:t;}
function fmtDateTime(v){if(!v)return '';try{return new Date(v).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});}catch(e){return String(v);}}
function thaiDate(d){return d.getDate()+' '+THAI_MONTHS[d.getMonth()]+' '+(d.getFullYear()+543);}
function parseDate(s){if(!s)return null;const d=new Date(String(s).length<=10?(s+'T00:00:00'):s);return isNaN(d.getTime())?null:d;}
function dispDate(s){const d=parseDate(s);return d?thaiDate(d):(s||'-');}
const pctTone=p=>p>=95?'excellent':p>=85?'good':p>=70?'fair':p>=50?'weak':'critical';
let tt;function toast(m,err){const e=$('toast');e.textContent=m;e.className='toast show'+(err?' err':'');clearTimeout(tt);tt=setTimeout(()=>e.classList.remove('show'),2800);}

// ---------- Supabase client ----------
let sb=null;
(function(){
  const cfg=window.APP_CONFIG||{};
  if(cfg.SUPABASE_URL && !String(cfg.SUPABASE_URL).startsWith('PASTE') && !String(cfg.SUPABASE_URL).startsWith('CHANGE')){
    sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
  }
})();

// ---------- สลับหน้าจอ ----------
function hideAll(){['public','login','register','resetpw'].forEach(id=>{const el=$(id);if(el)el.classList.add('hidden');});$('app').classList.remove('ready');}
function showLogin(){hideAll();$('login').classList.remove('hidden');}
function showRegister(){hideAll();const r=$('register');if(r)r.classList.remove('hidden');const eb=$('regError');if(eb)eb.classList.add('hidden');const m=$('regPassMeter');if(m)m.style.display='none';resetRegPassEye();}
function resetRegPassEye(){const i=$('regPass');if(i)i.type='password';const b=$('regPassEye');if(b){b.textContent='👁';b.style.color='#64748b';}}
function togglePass(inpId,btn){const i=$(inpId);if(!i)return;const show=i.type==='password';i.type=show?'text':'password';if(btn){btn.textContent=show?'🙈':'👁';btn.style.color=show?'#1749c4':'#64748b';}i.focus();}
function toggleRegPass(){const i=$('regPass'),b=$('regPassEye');if(!i)return;const show=i.type==='password';i.type=show?'text':'password';if(b){b.textContent=show?'🙈':'👁';b.style.color=show?'#1749c4':'#64748b';}i.focus();}
function regPassStrength(){
  const inp=$('regPass'),m=$('regPassMeter');if(!inp||!m)return;
  const p=inp.value||'';if(!p){m.style.display='none';return;}
  m.style.display='block';let s=0;
  if(p.length>=6)s++;if(p.length>=10)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/[0-9]/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;
  const levels=[{w:'22%',c:'#ef4444',t:'อ่อนมาก'},{w:'44%',c:'#f59e0b',t:'อ่อน'},{w:'64%',c:'#eab308',t:'ปานกลาง'},{w:'84%',c:'#22c55e',t:'ดี'},{w:'100%',c:'#16a34a',t:'แข็งแรง'}];
  const lv=levels[Math.min(levels.length-1,Math.max(0,s-1))];
  const bar=$('regPassBar'),txt=$('regPassText');if(bar){bar.style.width=lv.w;bar.style.background=lv.c;}
  const okMin=p.length>=6&&/[A-Za-z]/.test(p)&&/[0-9]/.test(p);
  if(txt){txt.style.color=lv.c;txt.textContent='ความแข็งแรง: '+lv.t+(okMin?' ✓':' — ยังไม่ครบเกณฑ์ (ต้องมีตัวอักษร+ตัวเลข อย่างน้อย 6 ตัว)');}
}
function gotoLogin(){showLogin();}
function boot(){$('public').classList.add('hidden');$('login').classList.add('hidden');$('app').classList.add('ready');refresh();checkAdmin();loadPerms();loadMyProfile();startRealtime();logAction('login','auth',user&&user.email);}
function showPublic(){hideAll();$('public').classList.remove('hidden');$('pubThanks').classList.add('hidden');$('pubForm').style.display='flex';initPublicForm();loadPublicOfficers().then(restoreDraftAfterLoad).catch(()=>restoreDraftAfterLoad());}

window.onload=async function(){
  if(!sb){showPublic();initPublicForm();toast('ยังไม่ได้ตั้งค่า Supabase ใน config.js',true);return;}
  sb.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){sessionStorage.setItem('pw_recovery','1');showResetPw();}});
  if(sessionStorage.getItem('pw_recovery')==='1'||String(location.hash).indexOf('type=recovery')>=0){sessionStorage.setItem('pw_recovery','1');showResetPw();return;}
  try{const {data:s}=await sb.auth.getSession();if(s&&s.session){enterApp(s.session.user);}else showPublic();}
  catch(e){showPublic();}
};

// ---------- การอนุมัติ + บทบาท ----------
function setUser(u){const r=(u&&u.app_metadata&&u.app_metadata.role)||'senior';user={email:u.email,role:r,isAdmin:r==='admin',displayName:u.email,username:u.email};}
const APPROVED_ROLES=['admin','senior','manager'];
function userRole(u){return (u&&u.app_metadata&&u.app_metadata.role)||'';}
function isApproved(u){return APPROVED_ROLES.indexOf(userRole(u))>=0;}
async function enterApp(u){
  if(isApproved(u)){setUser(u);boot();return true;}
  try{await sb.auth.signOut();}catch(_){}
  showLogin();showLoginInfo('บัญชีนี้กำลังรอผู้ดูแลระบบอนุมัติ — เมื่อได้รับอนุมัติแล้วจึงเข้าใช้งานได้',true);
  return false;
}
async function checkAdmin(){
  user.isAdmin=(user.role==='admin');
  try{const {data,error}=await sb.functions.invoke('admin-users',{body:{action:'whoami'}});if(!error&&data&&data.isAdmin){user.isAdmin=true;user.role='admin';}}catch(e){}
  applyRoleUI();
}

// ===== ความสามารถกลางของระบบ (RBAC) =====
const CAPS=[
  {key:'view_reports',     label:'ดู/ออกรายงาน (DOCX, CSV)',                 def:{senior:true, manager:true}},
  {key:'edit_report',      label:'แก้ไขรายงานการตรวจสอบ',                     def:{senior:true, manager:true}},
  {key:'delete_report',    label:'ลบรายงานการตรวจสอบ',                       def:{senior:true, manager:false}},
  {key:'manage_directory', label:'จัดการรายชื่อเจ้าหน้าที่ Onsite Support',     def:{senior:true, manager:true}}
];
let perms={};
function can(cap){
  if(user&&user.isAdmin)return true;
  const r=(user&&user.role)||'senior';
  if(perms&&perms[r]&&perms[r][cap]!==undefined)return !!perms[r][cap];
  const c=CAPS.find(x=>x.key===cap);return c?!!c.def[r]:false;
}
async function loadPerms(notify){
  try{const {data}=await sb.from('app_settings').select('value').eq('key','permissions').maybeSingle();perms=(data&&data.value)||{};}catch(e){perms={};}
  applyRoleUI();
  if(!user.isAdmin&&view==='directory'&&!can('manage_directory'))view='dashboard';
  if($('app').classList.contains('ready'))render();
  if(notify)toast('สิทธิ์การใช้งานได้รับการอัปเดต');
}
function applyRoleUI(){
  const show=(id,ok)=>{const n=$(id);if(n)n.classList.toggle('hidden',!ok);};
  show('navUsers',user.isAdmin);show('navPerms',user.isAdmin);show('navAudit',user.isAdmin);show('navAutoReport',user.isAdmin);
  show('navDirectory',user.isAdmin||can('manage_directory'));
  show('btnReportTop',can('view_reports'));show('btnReportNav',can('view_reports'));show('btnCsvNav',can('view_reports'));
  if($('userRole'))$('userRole').textContent=user.role||'-';
}
async function logAction(action,entity,detail){try{if(sb&&user)await sb.from('audit_log').insert({action,entity:entity||null,detail:detail?String(detail).slice(0,500):null});}catch(e){}}
async function loadMyProfile(){try{const {data}=await sb.from('profiles').select('display_name').eq('email',user.email).maybeSingle();if(data&&data.display_name){user.displayName=data.display_name;hydrateUser();}}catch(e){}}

// ---------- จัดการรหัสผ่าน ----------
function showResetPw(){sessionStorage.setItem('pw_recovery','1');hideAll();$('resetpw').classList.remove('hidden');}
async function submitNewPassword(e){
  e.preventDefault();const p=$('newPass').value,p2=$('newPass2').value;
  if(p.length<6)return toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร',true);
  if(!/[A-Za-z]/.test(p)||!/[0-9]/.test(p))return toast('รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข',true);
  if(p!==p2)return toast('รหัสผ่านยืนยันไม่ตรงกัน',true);
  $('newPassBtn').disabled=true;
  const {error}=await sb.auth.updateUser({password:p});
  $('newPassBtn').disabled=false;
  if(error)return toast('ตั้งรหัสไม่สำเร็จ: '+error.message,true);
  sessionStorage.removeItem('pw_recovery');toast('ตั้งรหัสผ่านใหม่เรียบร้อย');
  try{history.replaceState(null,'',location.pathname);}catch(_){}
  const {data:s}=await sb.auth.getSession();if(s&&s.session){enterApp(s.session.user);}else showLogin();
}
async function cancelReset(){
  sessionStorage.removeItem('pw_recovery');try{if(sb)await sb.auth.signOut();}catch(_){}
  try{history.replaceState(null,'',location.pathname);}catch(_){}
  if($('newPass'))$('newPass').value='';if($('newPass2'))$('newPass2').value='';showLogin();
}
async function forgotPassword(){
  if(!sb)return toast('ยังไม่ได้ตั้งค่า Supabase',true);
  const email=($('loginUser').value||'').trim()||prompt('กรอกอีเมลสำหรับรับลิงก์รีเซ็ตรหัสผ่าน');if(!email)return;
  const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
  if(error)return toast('ส่งไม่สำเร็จ: '+error.message,true);
  toast('ส่งลิงก์รีเซ็ตไปที่อีเมลแล้ว กรุณาตรวจกล่องจดหมาย');
}
async function changePassword(){
  const p=prompt('ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัวอักษร)');if(!p)return;if(p.length<6)return toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร',true);
  const {error}=await sb.auth.updateUser({password:p});if(error)return toast('เปลี่ยนรหัสไม่สำเร็จ: '+error.message,true);
  logAction('password','auth','self');toast('เปลี่ยนรหัสผ่านเรียบร้อย');
}

/* ============================================================
   หน้าสาธารณะ (ฟอร์มรายงาน TDAC)
   ============================================================ */
function kioskRowsHtml(){
  return KIOSKS.map(id=>'<tr class="krow" data-row="'+id+'"><td class="kid">'+id+'</td>'+
    '<td><div class="checks">'+
      SUBSYS.map(s=>'<button type="button" class="subchk" data-kiosk="'+id+'" data-type="'+s.t+'" data-state="no" onclick="cycleSub(this)" title="กดสลับ: ○ ยังไม่ตรวจ → ✓ พร้อม → ⏳ รอตรวจซ้ำ"><span class="subl">'+s.l+'</span></button>').join('')+
      '<button type="button" class="btn-all" data-kiosk="'+id+'" onclick="kioskCheckAll(this)">Check All</button>'+
      '<button type="button" class="btn-occ" data-kiosk="'+id+'" onclick="kioskToggleOccupied(this)" title="เครื่องไม่ว่างตอนไปตรวจ — รอตรวจซ้ำ">⏳ ไม่ว่าง</button>'+
      '<input type="checkbox" class="occ-flag" data-kiosk="'+id+'" data-type="occupied" hidden>'+
      '<input type="hidden" class="recheck-val" data-kiosk="'+id+'" data-type="recheck">'+
      '<span class="recheck-time" data-kiosk="'+id+'" style="display:none"></span>'+
    '</div></td>'+
    '<td><textarea class="remark-input" data-kiosk="'+id+'" data-type="remark" maxlength="200" placeholder="ใส่รายละเอียด (จำเป็นหากยังไม่พร้อม)" oninput="autoGrow(this);this.classList.remove(\'invalidf\')"></textarea><div class="photo-box" data-kiosk="'+id+'"></div></td></tr>').join('');
}
/* ============================================================
   รูปภาพประกอบหมายเหตุ/ข้อเสนอแนะ (ถ่าย/แนบ → บีบขนาด → อัปขึ้น Supabase Storage)
   photoState เก็บ path ในบัคเก็ตต่อ "scope": IMM001..IMM020 | 'web-pc' | 'web-mobile' | 'issue'
   ============================================================ */
const PHOTO_BUCKET='report-photos',PHOTO_MAX=3,PHOTO_MAXDIM=1280,PHOTO_QUALITY=0.72;
let photoState={},photoReadonly=false;
// ไบต์รูปที่เพิ่งอัปโหลดในเซสชันนี้ (path -> {bytes,w,h}) — ใช้ฝังลง DOCX ตรง ๆ
// ไม่ต้องดึงกลับจาก Storage (กันรูปหายจาก CORS / เน็ตสะดุด / ไฟล์ยังไม่พร้อมให้อ่าน)
const photoBytes={};
function resetPhotos(){photoState={};}
function photoUrl(path){if(!path)return '';if(/^https?:\/\//.test(path))return path;try{return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;}catch(e){return '';}}
function photoBox(scope,bodyId){
  if(/^IMM/.test(scope)){const b=$(bodyId);return b?b.querySelector('.photo-box[data-kiosk="'+scope+'"]'):null;}
  return $((/rd/.test(bodyId)?'rd':'pub')+'Photo-'+scope);
}
function loadImageFile(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const im=new Image();im.onload=()=>res(im);im.onerror=()=>{URL.revokeObjectURL(u);rej(new Error('โหลดรูปไม่ได้'));};im.src=u;});}
async function compressImage(file){
  const im=await loadImageFile(file);
  let w=im.naturalWidth||im.width,h=im.naturalHeight||im.height;
  const scale=Math.min(1,PHOTO_MAXDIM/Math.max(w,h||1));
  w=Math.max(1,Math.round(w*scale));h=Math.max(1,Math.round(h*scale));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  cv.getContext('2d').drawImage(im,0,0,w,h);
  const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',PHOTO_QUALITY));
  return {blob:blob||await (await fetch(cv.toDataURL('image/jpeg',PHOTO_QUALITY))).blob(),w,h};
}
function renderPhotos(scope,bodyId){
  const box=photoBox(scope,bodyId);if(!box)return;
  const arr=photoState[scope]||[];
  let h=arr.map((p,i)=>'<span class="photo-thumb"><img src="'+esc(photoUrl(p))+'" alt="รูป" onclick="window.open(this.src,\'_blank\')">'+(photoReadonly?'':'<button type="button" title="ลบรูป" onclick="removePhoto(\''+scope+'\','+i+',\''+bodyId+'\')">×</button>')+'</span>').join('');
  if(!photoReadonly&&arr.length<PHOTO_MAX)h+=
    '<label class="photo-add"><input type="file" accept="image/*" capture="environment" hidden onchange="handlePhotoPick(this,\''+scope+'\',\''+bodyId+'\')"><span>📷 ถ่ายรูป</span></label>'+
    '<label class="photo-add"><input type="file" accept="image/*" hidden multiple onchange="handlePhotoPick(this,\''+scope+'\',\''+bodyId+'\')"><span>🖼️ แนบรูป</span></label>';
  if(photoReadonly&&!arr.length)h='<span class="mini" style="color:var(--muted)">— ไม่มีรูปแนบ —</span>';
  box.innerHTML=h;
}
function renderAllPhotos(bodyId){KIOSKS.forEach(id=>renderPhotos(id,bodyId));['web-pc','web-mobile','issue'].forEach(s=>renderPhotos(s,bodyId));}
async function handlePhotoPick(input,scope,bodyId){
  if(!sb)return toast('ยังไม่ได้ตั้งค่า Supabase',true);
  const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
  const arr=photoState[scope]||(photoState[scope]=[]);
  const box=photoBox(scope,bodyId),own=input.closest('.photo-add'),sp=own&&own.querySelector('span');
  if(box)box.querySelectorAll('.photo-add').forEach(b=>b.classList.add('busy'));
  if(sp)sp.textContent='⏳ กำลังอัปโหลด...';
  const datev=($('pubDate')&&$('pubDate').value)||($('rdDate')&&$('rdDate').value)||'nodate';
  for(const f of files){
    if(arr.length>=PHOTO_MAX){toast('แนบได้สูงสุด '+PHOTO_MAX+' รูปต่อช่อง',true);break;}
    if(!/^image\//.test(f.type||'')){toast('ไฟล์ต้องเป็นรูปภาพ',true);continue;}
    try{
      const {blob,w,h}=await compressImage(f);
      const path=datev+'/'+scope+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.jpg';
      const {error}=await sb.storage.from(PHOTO_BUCKET).upload(path,blob,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
      if(error){toast('อัปโหลดรูปไม่สำเร็จ: '+error.message,true);continue;}
      // เก็บไบต์ไว้ในหน่วยความจำด้วย เพื่อให้ DOCX ฝังรูปได้แน่นอนแม้ดึงกลับจาก Storage ไม่ได้
      try{photoBytes[path]={bytes:new Uint8Array(await blob.arrayBuffer()),w,h};}catch(_){}
      arr.push(path);
    }catch(e){toast('ประมวลผลรูปไม่สำเร็จ: '+((e&&e.message)||e),true);}
  }
  renderPhotos(scope,bodyId);
  if(!/rd/.test(bodyId)&&typeof scheduleDraftSave==='function')scheduleDraftSave();
}
function removePhoto(scope,i,bodyId){
  const arr=photoState[scope];if(!arr)return;arr.splice(i,1);renderPhotos(scope,bodyId);
  if(!/rd/.test(bodyId)&&typeof scheduleDraftSave==='function')scheduleDraftSave();
}
const OCC_REMARK='เครื่องไม่ว่าง (ผู้โดยสารกำลังใช้งาน) — รอตรวจซ้ำ';
// เวลาเริ่มตรวจ default ตามรอบ (IMP/D=10:00, IMP/N=22:00) · เวลาปัจจุบัน HH:MM จากนาฬิกาเครื่อง
function shiftStartTime(shift){const s=String(shift||'');return s.indexOf('IMP/D')>=0?'10:00':(s.indexOf('IMP/N')>=0?'22:00':'');}
function nowHM(){const d=new Date();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
// ลง/ล้าง "เวลาที่กลับมาตรวจซ้ำ" ของแถว + อัปเดตป้ายแสดงผล
function setRecheck(body,id,val){
  const inp=body.querySelector('.recheck-val[data-kiosk="'+id+'"]');if(inp)inp.value=val||'';
  const chip=body.querySelector('.recheck-time[data-kiosk="'+id+'"]');
  if(chip){if(val){chip.textContent='↩ ตรวจซ้ำ '+val;chip.style.display='';}else{chip.textContent='';chip.style.display='none';}}
}
// สลับสถานะ "เครื่องไม่ว่าง/รอตรวจซ้ำ" ของแถว
function kioskToggleOccupied(btn){
  const body=btn.closest('tbody'),id=btn.dataset.kiosk,flag=body.querySelector('.occ-flag[data-kiosk="'+id+'"]');
  const on=!(flag&&flag.checked);if(flag)flag.checked=on;
  applyOccupied(body,id,on,true);
  // เปิด = แท็กไม่ว่าง (ยังไม่ตรวจซ้ำ ล้างเวลา) · ปิด = เพิ่งกลับมาตรวจซ้ำ → ลงเวลาปัจจุบันอัตโนมัติ
  setRecheck(body,id,on?'':nowHM());
  if(body.id==='pubKioskBody'){updatePubSummary();scheduleDraftSave();}
}
// ปรับ UI ของแถวตามสถานะ occupied (ล้าง/ปิด checkbox, ไฮไลต์ amber, เติม remark อัตโนมัติ)
function applyOccupied(body,id,on,autofill){
  const chips=subChips(body,id),btnOcc=body.querySelector('.btn-occ[data-kiosk="'+id+'"]'),
    btnAll=body.querySelector('.btn-all[data-kiosk="'+id+'"]'),
    r=body.querySelector('textarea[data-kiosk="'+id+'"][data-type="remark"]'),
    tr=body.querySelector('tr[data-row="'+id+'"]');
  if(on){
    chips.forEach(b=>{if(b){b.dataset.state='no';b.classList.add('dis');}});
    if(btnAll)btnAll.disabled=true;
    if(autofill&&r&&!r.value.trim()){r.value=OCC_REMARK;autoGrow(r);}
    if(r)r.classList.remove('invalidf');
  }else{
    chips.forEach(b=>{if(b)b.classList.remove('dis');});
    if(btnAll)btnAll.disabled=false;
    if(autofill&&r&&r.value.trim()===OCC_REMARK){r.value='';autoGrow(r);}
  }
  if(btnOcc){btnOcc.classList.toggle('on',on);btnOcc.textContent=on?'⏳ รอตรวจซ้ำ':'⏳ ไม่ว่าง';}
  if(tr){tr.classList.toggle('recheck',on);if(on){tr.classList.remove('ready');tr.classList.remove('wait');}}
  syncRowBtn(body,id);
}
function autoGrow(el){el.style.height='auto';el.style.height=el.scrollHeight+'px';}
function initPublicForm(){
  const body=$('pubKioskBody');if(body&&!body.children.length)body.innerHTML=kioskRowsHtml();
  if(!$('pubDate').value)calSetDate(new Date());
  updatePubSummary();
  hookDraftInputs();
  photoReadonly=false;resetPhotos();renderAllPhotos('pubKioskBody');
  // การกู้ร่าง (auto-restore) ย้ายไปทำหลัง loadPublicOfficers() เสร็จ (ดู restoreDraftAfterLoad)
  // เพื่อให้ dropdown รายชื่อเจ้าหน้าที่โหลดก่อน ค่า officer/อีเมลจึงติดถูกต้อง
}
// กู้ข้อมูลที่กรอกค้างไว้อัตโนมัติเมื่อเปิด/รีเฟรชหน้า — กันข้อมูลหายตอนเผลอกดรีเฟรชระหว่างตรวจ
// เว้นช่อง "ตรวจเสร็จเวลา" (pubEnd) ให้กรอกใหม่ทุกครั้ง เพราะเป็นเวลาที่ตรวจจบจริง
function restoreDraftAfterLoad(){
  const d=readDraft();if(!draftHasProgress(d))return;
  applyDraft(d);
  if($('pubEnd'))$('pubEnd').value='';
  showResumeBar(d);
}
/* ---------- ร่างในเครื่อง (localStorage) — ให้ผู้บันทึกกลับมากรอกต่อ/ตรวจซ้ำรายการเดิมได้ ----------
   ใช้ได้เพราะเป็นคนเดิม+เบราว์เซอร์เดิม: จำสถานะฟอร์มไว้ ปิด/เปิดใหม่แล้ว "ทำต่อ" ได้ */
const DRAFT_KEY='tdac_draft_v1';let draftT;
function scheduleDraftSave(){hideResumeBar();clearTimeout(draftT);draftT=setTimeout(saveDraft,400);}
function saveDraft(){
  try{
    if(!$('pubKioskBody')||!$('pubKioskBody').children.length)return;
    const d={v:APP_VERSION,savedAt:new Date().toISOString(),
      date:($('pubDate')&&$('pubDate').value)||'',shift:($('pubShift')&&$('pubShift').value)||'',officer:($('pubOfficer')&&$('pubOfficer').value)||'',
      email:($('pubEmail')&&$('pubEmail').value)||'',issue:($('pubIssue')&&$('pubIssue').value)||'',
      inspectStart:($('pubStart')&&$('pubStart').value)||'',inspectEnd:($('pubEnd')&&$('pubEnd').value)||'',
      webPc:!!($('pubWebPc')&&$('pubWebPc').checked),webPcRemark:($('pubWebPcRemark')&&$('pubWebPcRemark').value)||'',
      webMobile:!!($('pubWebMobile')&&$('pubWebMobile').checked),webMobileRemark:($('pubWebMobileRemark')&&$('pubWebMobileRemark').value)||'',
      issuePhotos:(photoState.issue||[]).slice(),webPcPhotos:(photoState['web-pc']||[]).slice(),webMobilePhotos:(photoState['web-mobile']||[]).slice(),
      kiosks:readKiosks('pubKioskBody')};
    localStorage.setItem(DRAFT_KEY,JSON.stringify(d));
  }catch(e){}
}
function readDraft(){try{const s=localStorage.getItem(DRAFT_KEY);return s?JSON.parse(s):null;}catch(e){return null;}}
function clearDraft(){try{localStorage.removeItem(DRAFT_KEY);}catch(e){}hideResumeBar();}
function draftHasProgress(d){
  if(!d)return false;
  if((d.officer||'').trim()||(d.issue||'').trim()||(d.webPcRemark||'').trim()||(d.webMobileRemark||'').trim()||d.webPc||d.webMobile)return true;
  return (d.kiosks||[]).some(k=>k.occupied||k.system_ready||k.rustdesk_ready||k.network_ready||(k.remark||'').trim());
}
function hookDraftInputs(){
  ['pubShift','pubOfficer','pubEmail','pubIssue','pubStart','pubEnd','pubWebPcRemark','pubWebMobileRemark'].forEach(id=>{const el=$(id);if(el&&!el._dh){el._dh=1;el.addEventListener('input',scheduleDraftSave);el.addEventListener('change',scheduleDraftSave);}});
  const kb=$('pubKioskBody');if(kb&&!kb._dh){kb._dh=1;kb.addEventListener('input',scheduleDraftSave);}
}
// เลือกรอบ → เติมเวลาเริ่มตรวจ default (10:00/22:00) ถ้ายังว่าง
function onPubShiftChange(){const st=$('pubStart');if(st&&!st.value)st.value=shiftStartTime($('pubShift').value);scheduleDraftSave();}
function applyDraft(d){
  if(!d)return;
  const dd=parseDate(d.date);if(dd)calSetDate(dd);
  if($('pubShift'))$('pubShift').value=d.shift||'';
  if($('pubOfficer'))$('pubOfficer').value=d.officer||'';
  if($('pubEmail'))$('pubEmail').value=d.email||'';
  if($('pubStart'))$('pubStart').value=d.inspectStart||'';
  if($('pubEnd'))$('pubEnd').value=d.inspectEnd||'';
  if($('pubIssue')){$('pubIssue').value=d.issue||'';if($('pubIssueCount'))$('pubIssueCount').textContent=String((d.issue||'').length);}
  if($('pubWebPc')){$('pubWebPc').checked=!!d.webPc;if($('lblWebPc'))$('lblWebPc').classList.toggle('on',!!d.webPc);}
  if($('pubWebPcRemark')){$('pubWebPcRemark').value=d.webPcRemark||'';autoGrow($('pubWebPcRemark'));}
  if($('pubWebMobile')){$('pubWebMobile').checked=!!d.webMobile;if($('lblWebMobile'))$('lblWebMobile').classList.toggle('on',!!d.webMobile);}
  if($('pubWebMobileRemark')){$('pubWebMobileRemark').value=d.webMobileRemark||'';autoGrow($('pubWebMobileRemark'));}
  photoState.issue=(d.issuePhotos||[]).slice();photoState['web-pc']=(d.webPcPhotos||[]).slice();photoState['web-mobile']=(d.webMobilePhotos||[]).slice();
  setKiosks('pubKioskBody',d.kiosks||[]);
  renderPhotos('issue','pubKioskBody');renderPhotos('web-pc','pubKioskBody');renderPhotos('web-mobile','pubKioskBody');
  updatePubSummary();
}
function showResumeBar(d){
  const bar=$('pubResumeBar');if(!bar)return;
  const cnt=(d.kiosks||[]).filter(k=>k.occupied).length;
  bar.innerHTML='<span>↩️ กู้ข้อมูลที่กรอกค้างไว้ให้อัตโนมัติแล้ว'+(d.date?' — '+ddmmyyyy(d.date):'')+(d.shift?' · '+esc(d.shift):'')+(cnt?' · ⏳ รอตรวจซ้ำ '+cnt+' เครื่อง':'')+' · ตรวจต่อได้เลย (ช่อง “ตรวจเสร็จเวลา” เว้นไว้ให้กรอกใหม่)</span>'+
    '<span class="resume-actions"><button type="button" class="btn" onclick="discardDraft()">เริ่มรายงานใหม่ (ล้างข้อมูล)</button></span>';
  bar.style.display='flex';
}
function hideResumeBar(){const b=$('pubResumeBar');if(b)b.style.display='none';}
function resumeDraft(){const d=readDraft();if(d){applyDraft(d);toast('โหลดรายการที่ค้างไว้แล้ว');}hideResumeBar();}
function discardDraft(){if(!confirm('เริ่มรายงานใหม่? ข้อมูลที่บันทึกค้างไว้จะถูกล้าง'))return;clearDraft();resetPublic();}
// จากหน้าขอบคุณ: กลับไปแก้/ตรวจเพิ่มรอบเดิม (โหลดข้อมูลที่เพิ่งส่ง กลับมาแก้ แล้วส่งซ้ำ = อัปเดตรายการเดิม)
function editThisRound(){const d=readDraft();$('pubThanks').classList.add('hidden');$('pubForm').style.display='flex';if(d)applyDraft(d);hideResumeBar();window.scrollTo(0,0);}
// ---------- ปฏิทินกำหนดเอง (แสดง DD/MM/YYYY ทุกเบราว์เซอร์) ----------
const CAL_DOW=['อา','จ','อ','พ','พฤ','ศ','ส'];
let calView=new Date(),calSel=null;
function pad2(n){return String(n).padStart(2,'0');}
function isoOf(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function ddmmyyyy(iso){const a=String(iso||'').split('-');return a.length===3?(a[2]+'/'+a[1]+'/'+a[0]):'';}
function calSetDate(d){
  calSel=new Date(d.getFullYear(),d.getMonth(),d.getDate());calView=new Date(calSel);
  $('pubDate').value=isoOf(calSel);
  const t=$('pubDateText');if(t){t.textContent=ddmmyyyy($('pubDate').value);t.classList.remove('ph');}
  if($('pubDateBtn'))$('pubDateBtn').classList.remove('invalidf');
  updatePubDateLabel();
}
function calToggle(e){if(e)e.stopPropagation();const p=$('calPop');if(!p)return;if(p.classList.toggle('show'))calRender();}
function calClose(){const p=$('calPop');if(p)p.classList.remove('show');}
function calShift(d){calView=new Date(calView.getFullYear(),calView.getMonth()+d,1);calRender();}
function calRender(){
  const y=calView.getFullYear(),m=calView.getMonth();
  $('calMY').textContent=THAI_MONTHS[m]+' '+(y+543);
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),todayIso=isoOf(new Date());
  let h=CAL_DOW.map(d=>'<div class="cal-dow">'+d+'</div>').join('');
  for(let i=0;i<first;i++)h+='<div></div>';
  for(let dd=1;dd<=days;dd++){const iso=y+'-'+pad2(m+1)+'-'+pad2(dd);
    h+='<div class="cal-day'+(iso===todayIso?' today':'')+(calSel&&iso===isoOf(calSel)?' sel':'')+'" onclick="calPick('+y+','+m+','+dd+')">'+dd+'</div>';}
  $('calGrid').innerHTML=h;
}
function calPick(y,m,d){calSetDate(new Date(y,m,d));calClose();if(typeof scheduleDraftSave==='function')scheduleDraftSave();}
document.addEventListener('click',function(e){const w=$('pubDateWrap');if(w&&!w.contains(e.target))calClose();});
// แสดงวันที่ที่เลือกเป็นรูปแบบ DD/MM/YYYY (เช่น 28/06/2026)
function updatePubDateLabel(){
  const el=$('pubDateFmt');if(!el)return;const v=($('pubDate').value||'');
  el.textContent=v?('📅 '+ddmmyyyy(v)):'';
}
// คู่มือการใช้งาน (โหลด guide.html ใน iframe เมื่อเปิดครั้งแรก)
function openGuide(){const f=$('guideFrame');if(f&&!f.getAttribute('src'))f.setAttribute('src','guide.html?v='+APP_VERSION);$('guideModal').classList.add('open');}
function closeGuide(){$('guideModal').classList.remove('open');}
function togglePubWeb(cb,lblId){const l=$(lblId);if(l)l.classList.toggle('on',cb.checked);if(cb.checked){const r=$(lblId==='lblWebPc'?'pubWebPcRemark':'pubWebMobileRemark');if(r)r.classList.remove('invalidf');}updatePubSummary();scheduleDraftSave();}
// รายการย่อยของแถว (ปุ่ม tri-state) + สถานะปัจจุบัน
function subChips(body,id){return SUBSYS.map(s=>body.querySelector('.subchk[data-kiosk="'+id+'"][data-type="'+s.t+'"]'));}
function subStateEl(body,id,t){const b=body.querySelector('.subchk[data-kiosk="'+id+'"][data-type="'+t+'"]');return b?(b.dataset.state||'no'):'no';}
// กดสลับสถานะรายการย่อย: no → ok → wait → no
function cycleSub(btn){
  if(btn.classList.contains('dis'))return;
  const order=['no','ok','wait'],cur=btn.dataset.state||'no',next=order[(order.indexOf(cur)+1)%3];
  btn.dataset.state=next;
  const body=btn.closest('tbody'),id=btn.dataset.kiosk;
  // เปลี่ยนจาก ⏳ รอตรวจซ้ำ → ✓ พร้อม = เพิ่งกลับมาตรวจซ้ำเสร็จ → ลงเวลาปัจจุบัน (ถ้ายังไม่มี)
  if(cur==='wait'&&next==='ok'){const rc=body.querySelector('.recheck-val[data-kiosk="'+id+'"]');if(rc&&!rc.value.trim())setRecheck(body,id,nowHM());}
  syncRowBtn(body,id);
  if(!subChips(body,id).some(b=>b&&b.dataset.state==='no')){const r=body.querySelector('textarea[data-kiosk="'+id+'"][data-type="remark"]');if(r)r.classList.remove('invalidf');}
  if(body.id==='pubKioskBody'){updatePubSummary();scheduleDraftSave();}
}
function syncRowBtn(body,id){
  const chips=subChips(body,id),btn=body.querySelector('.btn-all[data-kiosk="'+id+'"]');
  const allOk=chips.every(b=>b&&b.dataset.state==='ok'),anyWait=chips.some(b=>b&&b.dataset.state==='wait'),anyNo=chips.some(b=>b&&b.dataset.state==='no');
  if(btn){btn.classList.toggle('all-checked',allOk);btn.textContent=allOk?'✔ All Ready':'Check All';}
  const tr=body.querySelector('tr[data-row="'+id+'"]');
  if(tr){tr.classList.toggle('ready',allOk);tr.classList.toggle('wait',!allOk&&anyWait&&!anyNo);}
}
function kioskCheckAll(btn){
  const body=btn.closest('tbody'),id=btn.dataset.kiosk,chips=subChips(body,id);
  const allOk=chips.every(b=>b&&b.dataset.state==='ok');
  chips.forEach(b=>{if(b)b.dataset.state=allOk?'no':'ok';});
  syncRowBtn(body,id);if(body.id==='pubKioskBody'){updatePubSummary();scheduleDraftSave();}
}
function readKiosks(bodyId){
  const body=$(bodyId);return KIOSKS.map(id=>{
    const occ=!!((body.querySelector('.occ-flag[data-kiosk="'+id+'"]')||{}).checked);
    const rc=body.querySelector('.recheck-val[data-kiosk="'+id+'"]');
    const st=t=>subStateEl(body,id,t);
    const wait=occ?[]:SUBSYS.filter(s=>st(s.t)==='wait').map(s=>s.t);
    const rem=(body.querySelector('textarea[data-kiosk="'+id+'"][data-type="remark"]')||{}).value||'';
    return {kiosk_id:id,
      system_ready:!occ&&st('system')==='ok',rustdesk_ready:!occ&&st('rustdesk')==='ok',network_ready:!occ&&st('network')==='ok',
      occupied:occ,recheck_at:(rc&&rc.value.trim())||null,recheck_items:wait,
      remark:rem.trim()||null,remark_photos:(photoState[id]||[]).slice()};
  });
}
function setKiosks(bodyId,arr){
  const body=$(bodyId),map={};(arr||[]).forEach(k=>map[k.kiosk_id]=k);
  KIOSKS.forEach(id=>{const k=map[id]||{},wait=new Set(k.recheck_items||[]);
    SUBSYS.forEach(s=>{const b=body.querySelector('.subchk[data-kiosk="'+id+'"][data-type="'+s.t+'"]');if(b)b.dataset.state=wait.has(s.t)?'wait':(k[s.t+'_ready']?'ok':'no');});
    const r=body.querySelector('textarea[data-kiosk="'+id+'"][data-type="remark"]');if(r)r.value=k.remark||'';
    const flag=body.querySelector('.occ-flag[data-kiosk="'+id+'"]'),occ=!!k.occupied;if(flag)flag.checked=occ;
    applyOccupied(body,id,occ,false);   // restore สถานะ occupied โดยไม่แตะ remark ที่เก็บไว้
    setRecheck(body,id,occ?'':(k.recheck_at||''));   // เครื่องที่ยัง occupied ไม่แสดงเวลา, ที่ตรวจซ้ำแล้วแสดงเวลาเดิม
    photoState[id]=(k.remark_photos||[]).slice();renderPhotos(id,bodyId);
    syncRowBtn(body,id);
  });
}
// ---- สถานะรายการย่อยจากออบเจ็กต์ kiosk (บูลีน + recheck_items) ----
function subStateOf(k,type){if((k.recheck_items||[]).indexOf(type)>=0)return 'wait';return k[type+'_ready']?'ok':'no';}
function kioskWaitItems(k){return k.occupied?[]:(k.recheck_items||[]).filter(t=>SUBSYS.some(s=>s.t===t));}
function waitLabels(k){const set=new Set(kioskWaitItems(k));return SUBSYS.filter(s=>set.has(s.t)).map(s=>s.l);}
// จัดประเภทเครื่อง: 'occupied'(ไม่ว่าง) | 'notready'(มีรายการเสีย) | 'usable_wait'(ใช้งานได้ รอตรวจบางรายการ) | 'ready'(ตรวจครบ)
function kioskClass(k){
  if(k.occupied)return 'occupied';
  const st=SUBSYS.map(s=>subStateOf(k,s.t));
  if(st.some(s=>s==='no'))return 'notready';
  if(st.some(s=>s==='wait'))return 'usable_wait';
  return 'ready';
}
// เครื่อง "พร้อมใช้งาน" = ไม่มีรายการเสีย และไม่ได้ occupied (รวมเครื่องที่ยังรอตรวจบางรายการ — ตามนโยบายนับเป็นใช้งานได้)
function kioskReadyCount(arr){return (arr||[]).filter(k=>{const c=kioskClass(k);return c==='ready'||c==='usable_wait';}).length;}
function kioskPendingCount(arr){return (arr||[]).filter(k=>k.occupied).length;}
// สรุปตัวเลขความพร้อม
function readinessStats(arr,total){
  const t=total||KIOSK_COUNT;let full=0,wait=0,fail=0,occ=0;
  (arr||[]).forEach(k=>{const c=kioskClass(k);if(c==='ready')full++;else if(c==='usable_wait')wait++;else if(c==='notready')fail++;else occ++;});
  const usable=full+wait,checked=t-occ;
  return {full,wait,usable,ready:usable,notReady:fail,occupied:occ,pending:occ,
    needRecheck:occ+wait,checked,
    pct:t?Math.round(usable/t*100):0,
    checkedPct:checked>0?Math.round(usable/checked*100):null};
}
function updatePubSummary(){
  const ks=readKiosks('pubKioskBody'),s=readinessStats(ks,KIOSK_COUNT);
  $('pubChipReady').textContent=s.usable;$('pubChipNot').textContent=s.notReady;$('pubChipPct').textContent=s.pct+'%';
  if($('pubChipRecheck'))$('pubChipRecheck').textContent=s.needRecheck;
  if($('pubChipPctChecked'))$('pubChipPctChecked').textContent=(s.checkedPct==null?'—':s.checkedPct+'%');
  const setWeb=(id,ok)=>{const e=$(id);if(e){e.textContent=ok?'Ready':'Not Ready';e.style.color=ok?'var(--green)':'var(--rose)';}};
  setWeb('pubChipWebPc',!!($('pubWebPc')&&$('pubWebPc').checked));setWeb('pubChipWebMobile',!!($('pubWebMobile')&&$('pubWebMobile').checked));
}
/* ---------- ไทม์ไลน์เวลาตรวจจริง (รวมการตรวจซ้ำ) ----------
   "ตรวจครบทุกเครื่องจริง" = เวลาล่าสุดของ (จบรอบแรก inspect_end, ตรวจซ้ำล่าสุด recheck_at)
   รองรับรอบกลางคืนข้ามเที่ยงคืน: เวลาที่ < เวลาเริ่ม ถือเป็นวันถัดไป (+24 ชม.) */
function hmToMin(s){const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||'').trim());if(!m)return null;const h=+m[1],mi=+m[2];return(h>23||mi>59)?null:h*60+mi;}
function minToHm(min){min=((Math.round(min)%1440)+1440)%1440;return pad2(Math.floor(min/60))+':'+pad2(min%60);}
function fmtDur(min){if(min==null||min<0)return '—';const h=Math.floor(min/60),m=min%60;return(h?h+' ชม. ':'')+m+' นาที';}
function inspectionTimeline(r){
  const startM=hmToMin(r.inspectStart);
  const rel=t=>{const m=hmToMin(t);if(m==null)return null;if(startM==null)return m;return m<startM?m+1440:m;};
  const rechecks=(r.kiosks||[]).filter(k=>k.recheck_at).map(k=>({id:k.kiosk_id,at:k.recheck_at,rel:rel(k.recheck_at)})).filter(x=>x.rel!=null).sort((a,b)=>a.rel-b.rel);
  const endRel=rel(r.inspectEnd),lastRc=rechecks.length?rechecks[rechecks.length-1].rel:null;
  const cand=[endRel,lastRc].filter(v=>v!=null),completeRel=cand.length?Math.max.apply(null,cand):null;
  const totalMin=(startM!=null&&completeRel!=null)?completeRel-startM:null;
  const firstPassMin=(startM!=null&&endRel!=null)?endRel-startM:null;
  const waitMin=(totalMin!=null&&firstPassMin!=null)?Math.max(0,totalMin-firstPassMin):(rechecks.length?null:0);
  rechecks.forEach(x=>{x.waitMin=(endRel!=null)?Math.max(0,x.rel-endRel):null;});
  return {start:r.inspectStart||'',firstPassEnd:r.inspectEnd||'',rechecks,
    pendingNow:(r.kiosks||[]).filter(k=>k.occupied).length,
    completeAt:completeRel==null?'':minToHm(completeRel),crossedMidnight:completeRel!=null&&completeRel>=1440,
    totalMin,firstPassMin,waitMin};
}
// บล็อกไทม์ไลน์สำหรับ Modal (HTML)
function timelineHtml(r){
  const t=inspectionTimeline(r);
  if(!t.start&&!t.firstPassEnd&&!t.rechecks.length)return '';
  const line=(time,color,text)=>'<div style="display:flex;gap:9px;align-items:baseline"><span style="width:50px;flex:0 0 auto;font-weight:800;color:'+color+'">'+esc(time||'—')+'</span><span>'+text+'</span></div>';
  let rows=line(t.start,'var(--navy)','เริ่มตรวจ');
  if(t.firstPassEnd)rows+=line(t.firstPassEnd,'var(--navy)','ตรวจรอบแรกเสร็จ'+((t.rechecks.length+t.pendingNow)?' · รอตรวจซ้ำ '+(t.rechecks.length+t.pendingNow)+' เครื่อง':''));
  t.rechecks.forEach(x=>{rows+=line(x.at,'#b45309','↩ ตรวจซ้ำ '+esc(x.id)+(x.waitMin!=null?' <span class="mini">(รอ '+x.waitMin+' นาที)</span>':''));});
  let foot='';
  if(t.pendingNow>0)foot+='<div style="margin-top:5px;color:#b45309;font-weight:700">⏳ ยังมี '+t.pendingNow+' เครื่องรอตรวจซ้ำ — ยังตรวจไม่ครบ</div>';
  else if(t.completeAt)foot+='<div style="margin-top:5px;color:var(--green);font-weight:800">✅ ตรวจครบทุกเครื่อง: '+t.completeAt+' น.'+(t.crossedMidnight?' (วันถัดไป)':'')+'</div>';
  if(t.pendingNow===0&&t.totalMin!=null)foot+='<div style="font-weight:800;color:var(--navy)">⏱ ระยะเวลารวมจนตรวจครบ: '+fmtDur(t.totalMin)+'</div>';
  if(t.firstPassMin!=null)foot+='<div class="mini">• รอบแรก (ลงมือตรวจ): '+fmtDur(t.firstPassMin)+(t.pendingNow===0&&t.waitMin?' · ช่วงรอ/ตรวจซ้ำ: '+fmtDur(t.waitMin):'')+'</div>';
  return '<div class="notice" style="flex-direction:column;align-items:stretch;gap:5px;background:#f6f9ff;border-color:#c7e0fb;margin:6px 0 14px"><b style="color:var(--navy)">⏱ ไทม์ไลน์การตรวจสอบ (เวลาจริงรวมการตรวจซ้ำ)</b>'+rows+foot+'</div>';
}
let officerEmailMap={};
async function loadPublicOfficers(){
  if(!sb)return;
  try{const {data:o}=await sb.from('officers').select('name,email').eq('active',true).order('name');
    const list=o||[];officerEmailMap={};list.forEach(x=>{officerEmailMap[x.name]=x.email||'';});
    if($('pubOfficer'))$('pubOfficer').innerHTML='<option value="">— เลือกชื่อเจ้าหน้าที่ —</option>'+list.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join('');
  }catch(e){}
}
// เลือกชื่อผู้ตรวจ -> เติมอีเมลจากทะเบียนให้อัตโนมัติ (ผู้ใช้ยังแก้/พิมพ์เองได้)
function fillOfficerEmail(){
  const inp=$('pubEmail');if(!inp)return;
  inp.value=officerEmailMap[$('pubOfficer').value]||'';inp.classList.remove('invalidf');
}
async function submitPublic(){
  if(!sb)return toast('ยังไม่ได้ตั้งค่า Supabase',true);
  const date=$('pubDate').value,shift=$('pubShift').value,officer=$('pubOfficer').value.trim();
  [['pubDateBtn',date],['pubShift',shift],['pubOfficer',officer]].forEach(([id,v])=>{const el=$(id);if(el)el.classList.toggle('invalidf',!v);});
  if(!date)return toast('กรุณาเลือกวันที่ตรวจสอบ',true);
  if(!shift)return toast('กรุณาเลือกรอบการตรวจสอบ',true);
  if(!officer)return toast('กรุณาเลือกชื่อเจ้าหน้าที่ผู้ตรวจสอบ',true);
  const kiosks=readKiosks('pubKioskBody'),st=readinessStats(kiosks,KIOSK_COUNT),ready=st.ready,pct=st.pct;
  const email=($('pubEmail').value||'').trim();
  // ── บังคับใส่ Remark สำหรับเครื่อง/แพลตฟอร์มที่ยังไม่ติ๊กครบ (Not Ready) — ยกเว้นเครื่องที่ "รอตรวจซ้ำ" (มี remark อัตโนมัติอยู่แล้ว) ──
  document.querySelectorAll('#pubForm .remark-input.invalidf').forEach(el=>el.classList.remove('invalidf'));
  let firstBad=null;const markBad=el=>{if(el){el.classList.add('invalidf');if(!firstBad)firstBad=el;}};
  // บังคับ Remark เฉพาะเครื่องที่มีรายการ "เสีย/ไม่พร้อม" (Not Ready) — เครื่องที่ "รอตรวจซ้ำ" (⏳) ไม่ต้องใส่
  kiosks.forEach(k=>{
    if(kioskClass(k)==='notready'&&!(k.remark||'').trim())markBad($('pubKioskBody').querySelector('textarea[data-kiosk="'+k.kiosk_id+'"][data-type="remark"]'));});
  if(!$('pubWebPc').checked&&!($('pubWebPcRemark').value||'').trim())markBad($('pubWebPcRemark'));
  if(!$('pubWebMobile').checked&&!($('pubWebMobileRemark').value||'').trim())markBad($('pubWebMobileRemark'));
  if(firstBad){toast('รายการที่ "ไม่พร้อม" (Not Ready) ต้องระบุ Remark เหตุผลให้ครบทุกรายการ',true);firstBad.scrollIntoView({behavior:'smooth',block:'center'});try{firstBad.focus();}catch(_){}return;}
  const inspectStart=($('pubStart').value||'').trim()||shiftStartTime(shift);
  const inspectEnd=($('pubEnd').value||'').trim()||null;
  // ── ตรวจครบก่อนส่ง: ถ้ายังมีเครื่อง "รอตรวจซ้ำ" (ไม่ว่าง หรือรอตรวจบางรายการ) ให้เตือน (ส่งได้ แล้วกลับมาแก้รอบเดิมภายหลัง) ──
  if(st.needRecheck>0&&!confirm('ยังมีเครื่องที่ "รอตรวจซ้ำ" อีก '+st.needRecheck+' เครื่อง (เข้าไม่ได้ หรือรอตรวจบางรายการ เช่น RustDesk)\n\nกด "ตกลง" เพื่อส่งรายงานตอนนี้ (กลับมาตรวจซ้ำแล้วส่งทับรายการเดิมได้ภายหลัง)\nกด "ยกเลิก" เพื่อกลับไปตรวจให้ครบก่อน'))return;
  const report={
    report_date:date,shift,officer,inspect_start:inspectStart,inspect_end:inspectEnd,
    web_pc_ready:!!$('pubWebPc').checked,web_pc_remark:($('pubWebPcRemark').value||'').trim()||null,
    web_mobile_ready:!!$('pubWebMobile').checked,web_mobile_remark:($('pubWebMobileRemark').value||'').trim()||null,
    issue_log:($('pubIssue').value||'').trim()||null,
    issue_photos:(photoState.issue||[]).slice(),web_pc_photos:(photoState['web-pc']||[]).slice(),web_mobile_photos:(photoState['web-mobile']||[]).slice(),
    kiosks_total:KIOSK_COUNT,kiosks_ready:ready,kiosks_pending:st.pending,readiness_pct:pct,kiosks
  };
  const btn=$('pubSubmit');btn.disabled=true;
  // ส่งทั้ง report + report_kiosks แบบ atomic ผ่านฟังก์ชัน SECURITY DEFINER (anon)
  const {error}=await sb.rpc('submit_tdac_report',{payload:report});
  if(error){btn.disabled=false;return toast('ส่งไม่สำเร็จ: '+error.message,true);}
  // สร้าง PDF (A4) แล้วส่งอีเมลให้เจ้าหน้าที่ OSO อัตโนมัติ — ถ้าล้มเหลวรายงานก็ถูกบันทึกแล้ว
  if(email){
    const disp={date,shift,officer,kiosks,webPc:report.web_pc_ready,webPcRemark:report.web_pc_remark,
      webMobile:report.web_mobile_ready,webMobileRemark:report.web_mobile_remark,issue:report.issue_log,ready,total:KIOSK_COUNT,pct,
      pending:st.pending,checkedPct:st.checkedPct,inspectStart,inspectEnd,
      issue_photos:report.issue_photos,web_pc_photos:report.web_pc_photos,web_mobile_photos:report.web_mobile_photos};
    btn.innerHTML='<span class="btn-spin"></span>กำลังสร้างไฟล์และส่งอีเมล...';
    try{
      const blob=await buildSingleReportDocxBlob(disp);
      const b64=blob?await blobToB64(blob):null;
      if(b64){
        const msg='เรียน '+officer+'\n\nแนบไฟล์รายงานการตรวจสอบระบบ TDAC ประจำ '+dispDate(date)+' รอบ '+shift+
          '\nความพร้อม (Readiness): '+pct+'%  ('+ready+'/'+KIOSK_COUNT+' เครื่องพร้อมใช้งาน)'+
          '\n\nระบบ OSO-TDAC Operational Report';
        // ชื่อไฟล์: DDMMYYYY + _1 (รอบกลางวัน IMP/D) หรือ _2 (รอบกลางคืน IMP/N)
        const da=date.split('-');const fn=da[2]+da[1]+da[0]+(shift.indexOf('IMP/D')>=0?'_1':'_2')+'-OSO-TDAC-Report.docx';
        // ส่งไบต์ DOCX ผ่านพารามิเตอร์ pdfBase64 เดิม — edge function แนบไฟล์ตามชื่อ .docx ให้เอง (ไม่ต้อง redeploy)
        const r=await callFn('send-public-report',{to:email,subject:'รายงานการตรวจสอบระบบ TDAC '+dispDate(date)+' ('+shift+')',filename:fn,pdfBase64:b64,message:msg});
        if(r.error)toast('บันทึกรายงานแล้ว แต่ส่งอีเมลไม่สำเร็จ: '+r.error,true);
        else toast('ส่งรายงาน (DOCX) ไปที่ '+email+' แล้ว ✓');
      }
    }catch(e){toast('บันทึกรายงานแล้ว แต่สร้าง/ส่งไฟล์ไม่สำเร็จ: '+((e&&e.message)||e),true);}
  }
  btn.disabled=false;btn.innerHTML='✓ ส่งรายงานการตรวจสอบ';
  saveDraft();   // เก็บสถานะที่เพิ่งส่งไว้ในเครื่อง — ผู้บันทึกกด"แก้รอบนี้"กลับมาตรวจซ้ำแล้วส่งทับได้
  $('pubForm').style.display='none';$('pubThanks').classList.remove('hidden');window.scrollTo(0,0);
}
function resetPublic(){
  clearDraft();   // เริ่มรอบใหม่ = ล้างร่างเดิม
  $('pubShift').value='';$('pubOfficer').value='';$('pubEmail').value='';$('pubIssue').value='';$('pubIssueCount').textContent='0';
  if($('pubStart'))$('pubStart').value='';if($('pubEnd'))$('pubEnd').value='';
  $('pubWebPc').checked=false;$('pubWebMobile').checked=false;$('lblWebPc').classList.remove('on');$('lblWebMobile').classList.remove('on');
  $('pubWebPcRemark').value='';$('pubWebMobileRemark').value='';
  $('pubKioskBody').innerHTML=kioskRowsHtml();
  photoReadonly=false;resetPhotos();renderAllPhotos('pubKioskBody');
  calSetDate(new Date());
  updatePubSummary();
  $('pubThanks').classList.add('hidden');$('pubForm').style.display='flex';window.scrollTo(0,0);
}

/* ============================================================
   ล็อกอิน / ลงทะเบียน
   ============================================================ */
function showLoginError(msg){const b=$('loginError');if(b){b.textContent=msg;b.classList.remove('hidden');}const i=$('loginInfo');if(i)i.classList.add('hidden');toast(msg,true);}
function showLoginInfo(msg,silent){const i=$('loginInfo');if(i){i.textContent=msg;i.classList.remove('hidden');}const e=$('loginError');if(e)e.classList.add('hidden');if(!silent)toast(msg);}
function showRegError(msg){const b=$('regError');if(b){b.textContent=msg;b.classList.remove('hidden');}toast(msg,true);}
async function doRegister(e){
  e.preventDefault();const eb=$('regError');if(eb)eb.classList.add('hidden');
  if(!sb)return showRegError('ยังไม่ได้ตั้งค่า Supabase ใน config.js');
  const name=($('regName').value||'').trim();
  const email=($('regEmail').value||'').normalize('NFKC').replace(/[^\x21-\x7E]/g,'').toLowerCase();
  const pass=$('regPass').value||'';const reason=($('regReason').value||'').trim();
  if(!name)return showRegError('กรุณากรอกชื่อ-นามสกุล');
  if(!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email))return showRegError('รูปแบบอีเมลไม่ถูกต้อง: '+(email||'(ว่าง)'));
  if(pass.length<6)return showRegError('รหัสผ่านอย่างน้อย 6 ตัวอักษร');
  if(!/[A-Za-z]/.test(pass)||!/[0-9]/.test(pass))return showRegError('รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข เพื่อความปลอดภัย');
  const b=$('regBtn');b.disabled=true;b.textContent='กำลังส่งคำขอ...';
  try{
    const {data,error}=await sb.functions.invoke('register',{body:{email,password:pass,full_name:name,reason}});
    let emsg=null;
    if(error){emsg=error.message||'error';try{if(error.context&&typeof error.context.json==='function'){const j=await error.context.json();if(j&&j.error)emsg=j.error;}}catch(_){}}
    else if(data&&data.error)emsg=data.error;
    b.disabled=false;b.textContent='ส่งคำขอลงทะเบียน';
    if(emsg){if(/failed to send a request|not found|404|failed to fetch/i.test(emsg))emsg='ยังไม่ได้ติดตั้งฟังก์ชันลงทะเบียนบนเซิร์ฟเวอร์ — ผู้ดูแลระบบต้อง deploy ฟังก์ชัน "register" ก่อน (ดู USER-MANAGEMENT.md)';return showRegError(emsg);}
    $('regName').value=$('regEmail').value=$('regPass').value=$('regReason').value='';
    const pm=$('regPassMeter');if(pm)pm.style.display='none';resetRegPassEye();
    showLogin();showLoginInfo('ส่งคำขอลงทะเบียนแล้ว ✓ โปรดรอผู้ดูแลระบบอนุมัติ จากนั้นเข้าสู่ระบบด้วยอีเมล/รหัสผ่านที่ลงทะเบียนไว้');
  }catch(ex){b.disabled=false;b.textContent='ส่งคำขอลงทะเบียน';showRegError(String((ex&&ex.message)||ex));}
}
function loginErrorText(error){const m=String(error&&error.message||'').toLowerCase();
  if(m.indexOf('invalid login')>=0||m.indexOf('invalid credentials')>=0)return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if(m.indexOf('email not confirmed')>=0)return 'อีเมลนี้ยังไม่ได้ยืนยัน — ให้ผู้ดูแลปิด "Confirm email" หรือยืนยันบัญชีใน Supabase';
  if(m.indexOf('rate limit')>=0||m.indexOf('too many')>=0)return 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
  if(m.indexOf('failed to fetch')>=0||m.indexOf('networkerror')>=0||m.indexOf('load failed')>=0)return 'เชื่อมต่อเซิร์ฟเวอร์ Supabase ไม่ได้ — ตรวจอินเทอร์เน็ต/VPN หรือค่าใน config.js';
  return 'เข้าสู่ระบบไม่สำเร็จ: '+(error&&error.message||'ไม่ทราบสาเหตุ');
}
function setLoginBtn(state){const b=$('loginBtn');if(!b)return;
  if(state==='loading'){b.disabled=true;b.classList.remove('ok');b.innerHTML='<span class="btn-spin"></span>กำลังเข้าสู่ระบบ...';}
  else if(state==='ok'){b.disabled=true;b.classList.add('ok');b.innerHTML='&#10003; เข้าสู่ระบบสำเร็จ';}
  else{b.disabled=false;b.classList.remove('ok');b.textContent='เข้าสู่ระบบ';}}
function shakeLogin(){const c=document.querySelector('#login .login-card');if(c){c.classList.remove('shake');void c.offsetWidth;c.classList.add('shake');}}
async function doLogin(e){
  e.preventDefault();const eb=$('loginError');if(eb){eb.classList.add('hidden');eb.textContent='';}
  if(!sb){showLoginError('ยังไม่ได้ตั้งค่า Supabase ใน config.js');shakeLogin();return;}
  const email=($('loginUser').value||'').trim(),pass=$('loginPass').value||'';
  if(!email||!pass){showLoginError('กรุณากรอกอีเมลและรหัสผ่านให้ครบ');shakeLogin();return;}
  setLoginBtn('loading');
  try{
    const {data:d,error}=await sb.auth.signInWithPassword({email,password:pass});
    if(error){setLoginBtn('idle');showLoginError(loginErrorText(error));shakeLogin();return;}
    if(!isApproved(d.user)){await sb.auth.signOut();setLoginBtn('idle');showLoginError('บัญชีของคุณกำลังรอผู้ดูแลระบบอนุมัติ');shakeLogin();return;}
    setUser(d.user);setLoginBtn('ok');toast('เข้าสู่ระบบสำเร็จ');setTimeout(()=>{boot();setLoginBtn('idle');},650);
  }catch(ex){setLoginBtn('idle');showLoginError(loginErrorText(ex));shakeLogin();}
}
async function doLogout(){if(sb)await sb.auth.signOut();showPublic();}

/* ============================================================
   ชั้นข้อมูล (reports + report_kiosks + officers)
   ============================================================ */
function buildReport(r,kmap){
  const ks=(kmap[r.id]||[]).slice().sort((a,b)=>a.kiosk_id.localeCompare(b.kiosk_id));
  const ready=ks.length?kioskReadyCount(ks):num(r.kiosks_ready);
  const pending=ks.length?kioskPendingCount(ks):num(r.kiosks_pending);
  const total=ks.length||num(r.kiosks_total)||KIOSK_COUNT;
  const pct=total?Math.round(ready/total*100):num(r.readiness_pct);
  const checked=total-pending,checkedPct=checked>0?Math.round(ready/checked*100):null;
  return {id:r.id,createdRaw:r.created_at,created:fmtDateTime(r.created_at),date:r.report_date,shift:r.shift||'',officer:r.officer||'',
    inspectStart:r.inspect_start||'',inspectEnd:r.inspect_end||'',
    webPc:!!r.web_pc_ready,webPcRemark:r.web_pc_remark||'',webMobile:!!r.web_mobile_ready,webMobileRemark:r.web_mobile_remark||'',
    issue:r.issue_log||'',issuePhotos:r.issue_photos||[],webPcPhotos:r.web_pc_photos||[],webMobilePhotos:r.web_mobile_photos||[],
    kiosks:ks,total,ready,pending,notReady:Math.max(0,total-ready-pending),pct,checkedPct,submittedBy:r.submitted_by||''};
}
async function loadData(){
  const [rp,kk,of]=await Promise.all([
    sb.from('reports').select('*').order('report_date',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('report_kiosks').select('*'),
    sb.from('officers').select('*').order('name')
  ]);
  if(rp.error)throw rp.error;
  const kmap={};(kk.data||[]).forEach(k=>{(kmap[k.report_id]=kmap[k.report_id]||[]).push(k);});
  const reports=(rp.data||[]).map(r=>buildReport(r,kmap));
  const officers=(of.data||[]).map(x=>x.name);
  const summary=summarize(reports);
  return {reports,officers,summary};
}
function summarize(reports){
  const total=reports.length;
  const avgReadiness=total?Math.round(reports.reduce((a,r)=>a+r.pct,0)/total):0;
  const latest=reports[0]||null;
  // kiosk health: ต่อเครื่อง — จำนวนครั้งที่ตรวจ, จำนวนครั้งที่ Not Ready, ระบบที่ล้มบ่อย
  const health=KIOSKS.map(id=>({id,checks:0,notReady:0,fail:{system:0,rustdesk:0,network:0}}));
  const hmap={};health.forEach(h=>hmap[h.id]=h);
  reports.forEach(r=>r.kiosks.forEach(k=>{const h=hmap[k.kiosk_id];if(!h)return;
    if(k.occupied)return;   // เครื่องไม่ว่าง = ยังไม่ได้ตรวจ ไม่นับเป็นการตรวจ/Not Ready
    h.checks++;
    const ok=k.system_ready&&k.rustdesk_ready&&k.network_ready;if(!ok)h.notReady++;
    if(!k.system_ready)h.fail.system++;if(!k.rustdesk_ready)h.fail.rustdesk++;if(!k.network_ready)h.fail.network++;}));
  health.forEach(h=>{h.pct=h.checks?Math.round((h.checks-h.notReady)/h.checks*100):null;});
  const problem=health.filter(h=>h.notReady>0).sort((a,b)=>b.notReady-a.notReady);
  // เครื่อง "ค้างตรวจซ้ำ" ในรายงานล่าสุด — ตัวเตือนให้กลับไปตรวจ
  const recheck=latest?(latest.kiosks||[]).filter(k=>k.occupied||kioskWaitItems(k).length).map(k=>({reportId:latest.id,date:latest.date,shift:latest.shift,officer:latest.officer,kioskId:k.kiosk_id,remark:(k.occupied?'เครื่องไม่ว่าง (เข้าไม่ได้)':('รอตรวจ '+waitLabels(k).join(', ')))+(k.remark?(' — '+k.remark):'')})):[];
  const shiftCounts={},officerCounts={};
  reports.forEach(r=>{shiftCounts[r.shift]=(shiftCounts[r.shift]||0)+1;officerCounts[r.officer]=(officerCounts[r.officer]||0)+1;});
  const webPcOk=reports.filter(r=>r.webPc).length,webMobileOk=reports.filter(r=>r.webMobile).length;
  const issues=reports.filter(r=>r.issue);
  return {total,avgReadiness,latest,health,problem,recheck,shiftCounts,officerCounts,
    webPcPct:total?Math.round(webPcOk/total*100):0,webMobilePct:total?Math.round(webMobileOk/total*100):0,issues};
}
async function refresh(){
  $('content').innerHTML=LOADING;
  try{data=await loadData();hydrateUser();render();}
  catch(e){toast((e&&e.message)||'โหลดข้อมูลไม่สำเร็จ',true);$('content').innerHTML='<div class="empty">โหลดข้อมูลไม่สำเร็จ<br><span class="mini">'+esc((e&&e.message)||'')+'</span></div>';}
}
async function ensureFresh(){try{data=await loadData();}catch(e){}}

// Realtime
let realtimeOn=false,liveT;
function startRealtime(){
  if(!sb||realtimeOn)return;realtimeOn=true;
  try{sb.channel('tdac-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'reports'},liveRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'report_kiosks'},liveRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'officers'},liveRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'app_settings'},(p)=>{const k=(p&&p.new&&p.new.key)||(p&&p.old&&p.old.key);if(k==='permissions')loadPerms(true);})
    .subscribe();}catch(e){}
}
function liveRefresh(){clearTimeout(liveT);liveT=setTimeout(async()=>{try{data=await loadData();if(['dashboard','reports','kiosks','insights'].indexOf(view)>=0)render();toast('อัปเดตข้อมูลล่าสุดแล้ว');}catch(e){}},800);}
function hydrateUser(){$('userName').textContent=user.displayName||user.email;$('userRole').textContent=user.role;$('avatar').textContent=(user.displayName||'U').slice(0,1).toUpperCase();if($('appVer'))$('appVer').textContent='เวอร์ชัน '+APP_VERSION;}

function showView(v,btn){
  if((v==='users'||v==='perms'||v==='audit'||v==='autoreport')&&!user.isAdmin){toast('เฉพาะผู้ดูแลระบบ (admin) เท่านั้น',true);return;}
  if(v==='directory'&&!(user.isAdmin||can('manage_directory'))){toast('คุณไม่มีสิทธิ์จัดการรายชื่อ',true);return;}
  view=v;document.querySelectorAll('.nav button[data-view]').forEach(b=>b.classList.toggle('active',b===btn));closeSide();render();
}
function toggleSide(){const open=$('side').classList.toggle('open');const b=$('sideBackdrop');if(b)b.classList.toggle('open',open);}
function closeSide(){$('side').classList.remove('open');const b=$('sideBackdrop');if(b)b.classList.remove('open');}
function render(){
  const t={dashboard:'แดชบอร์ด',reports:'รายการรายงาน',kiosks:'สรุปรายเครื่อง Kiosk',insights:'วิเคราะห์ภาพรวม',directory:'จัดการรายชื่อเจ้าหน้าที่',users:'จัดการผู้ใช้ระบบ',perms:'จัดการสิทธิ์',audit:'บันทึกการใช้งานระบบ',autoreport:'ตั้งค่าส่งอีเมลอัตโนมัติ',help:'คู่มือการใช้งาน'};
  $('pageTitle').textContent=t[view]||'แดชบอร์ด';
  ({dashboard:renderDashboard,reports:renderReports,kiosks:renderKiosks,insights:renderInsights,directory:renderDirectory,users:renderUsers,perms:renderPerms,audit:renderAudit,autoreport:renderAutoReport,help:renderHelp}[view]||renderDashboard)();
}
function stat(label,val,sub,color){return '<div class="stat"><div class="stat-label">'+label+'</div><div class="stat-num" style="color:'+(color||'var(--navy)')+'">'+val+'</div><div class="mini">'+(sub||'')+'</div></div>';}

/* ---------- แดชบอร์ด ---------- */
function renderDashboard(){
  const s=data.summary||{},L=s.latest,rc=s.recheck||[];
  const probTop=(s.problem||[]).slice(0,6);
  const shiftRows=Object.entries(s.shiftCounts||{}).sort((a,b)=>b[1]-a[1]);
  const offRows=Object.entries(s.officerCounts||{}).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const recent=(data.reports||[]).slice(0,8);
  $('content').innerHTML=
    '<div class="stats grid">'+
      stat('จำนวนรายงาน',s.total||0,'รายการตรวจสอบ','var(--cyan)')+
      stat('Readiness เฉลี่ย',(s.avgReadiness||0)+'%','เฉลี่ยทุกรอบ','var(--mint)')+
      stat('รอบล่าสุด',L?(L.pct+'%'):'-',L?(dispDate(L.date)+' · '+esc(L.shift)):'ยังไม่มีรายงาน','var(--amber)')+
      stat('เครื่องที่ต้องติดตาม',(s.problem||[]).length,'เคยพบ Not Ready','var(--rose)')+
    '</div>'+
    '<div class="exec"><div class="panel"><div class="panel-head"><div><div class="panel-title">สถานะรอบล่าสุด</div><div class="mini">'+(L?(dispDate(L.date)+' · '+esc(L.shift)+' · '+esc(L.officer)):'ยังไม่มีรายงาน')+'</div></div>'+(L?'<button class="btn" onclick="openReportDetail('+L.id+')">ดูรายละเอียด</button>':'')+'</div>'+
      '<div class="exec-grid"><div class="exec-item"><b>Kiosk พร้อมใช้งาน</b><span class="tag '+(L?pctTone(L.pct):'neutral')+'">'+(L?(L.ready+' / '+L.total):'-')+'</span><div class="bar" style="margin-top:10px"><div class="fill" style="width:'+(L?L.pct:0)+'%"></div></div><div class="mini" style="margin-top:6px">Readiness '+(L?L.pct:0)+'%'+(L&&L.pending?' · เฉพาะที่ตรวจ '+(L.checkedPct==null?'—':L.checkedPct+'%')+' · ⏳ รอตรวจซ้ำ '+L.pending:'')+'</div></div>'+
        '<div class="exec-item"><b>Website (PC)</b><span class="tag '+(L?(L.webPc?'excellent':'critical'):'neutral')+'">'+(L?(L.webPc?'System Ready':'Not Ready'):'-')+'</span><div class="mini" style="margin-top:8px">ภาพรวมพร้อม '+(s.webPcPct||0)+'% ของรอบ</div></div>'+
        '<div class="exec-item"><b>Website (Mobile)</b><span class="tag '+(L?(L.webMobile?'excellent':'critical'):'neutral')+'">'+(L?(L.webMobile?'System Ready':'Not Ready'):'-')+'</span><div class="mini" style="margin-top:8px">ภาพรวมพร้อม '+(s.webMobilePct||0)+'% ของรอบ</div></div></div></div>'+
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">ข้อเสนอแนะถัดไป</div><div class="mini">แนวทางการติดตาม</div></div></div><div class="next-steps">'+dashSteps(s)+'</div></div></div>'+
    '<div class="panel" style="margin-bottom:16px'+(rc.length?';border:1px solid #fcd34d;background:#fffbeb':'')+'"><div class="panel-head"><div><div class="panel-title">⏳ ค้างตรวจซ้ำ (เครื่องไม่ว่าง)</div><div class="mini">เครื่องที่ยังตรวจไม่ได้ในรอบล่าสุด — กลับไปตรวจแล้วกด "ตรวจซ้ำ" เพื่ออัปเดต</div></div>'+(rc.length?'<span class="tag" style="background:#fef3c7;color:#b45309">'+rc.length+' เครื่อง</span>':'')+'</div>'+
      (rc.length?('<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>Kiosk</th><th>รอบ</th><th>ผู้ตรวจ</th><th>หมายเหตุ</th><th></th></tr></thead><tbody>'+
        rc.map(x=>'<tr><td class="kid">'+esc(x.kioskId)+'</td><td class="nowrap">'+esc(dispDate(x.date))+' · '+esc(x.shift)+'</td><td>'+esc(x.officer)+'</td><td class="comment">'+(x.remark?esc(x.remark):'<span class="mini">—</span>')+'</td><td class="nowrap"><button class="btn primary" onclick="openReportDetail('+x.reportId+')">ตรวจซ้ำ</button></td></tr>').join('')+
        '</tbody></table></div>')
       :'<div class="empty">ไม่มีเครื่องค้างตรวจ ✓</div>')+
    '</div>'+
    '<div class="panel" style="margin-bottom:16px"><div class="panel-head"><div><div class="panel-title">แนวโน้ม Readiness (รอบล่าสุด)</div><div class="mini">% ความพร้อมของแต่ละรอบ · เขียว=สูง · แดง=ต่ำ</div></div></div>'+trendChartSvg(data.reports)+'</div>'+
    '<div class="dash grid">'+
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">รายงานล่าสุด</div><div class="mini">8 รายการล่าสุด</div></div><button class="btn" onclick="view=\'reports\';render()">ดูทั้งหมด</button></div>'+
        '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>วันที่</th><th>รอบ</th><th>ผู้ตรวจ</th><th>Readiness</th></tr></thead><tbody>'+
        (recent.map(r=>'<tr style="cursor:pointer" onclick="openReportDetail('+r.id+')"><td class="nowrap">'+esc(dispDate(r.date))+'</td><td>'+esc(r.shift)+'</td><td>'+esc(r.officer)+'</td><td><span class="tag '+pctTone(r.pct)+'">'+r.pct+'%</span></td></tr>').join('')||'<tr><td colspan="4" class="empty">ยังไม่มีรายงาน</td></tr>')+
        '</tbody></table></div></div>'+
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">เครื่องที่ต้องติดตาม</div><div class="mini">Kiosk ที่พบ Not Ready บ่อย</div></div></div><div class="rank">'+
        (probTop.map(h=>'<div class="rank-row"><div><div class="rank-name">'+esc(h.id)+'</div><div class="rank-meta">Not Ready '+h.notReady+'/'+h.checks+' ครั้ง · ล้มบ่อย: '+topFail(h.fail)+'</div><div class="bar" style="margin-top:8px"><div class="fill" style="width:'+Math.round(h.notReady/Math.max(1,h.checks)*100)+'%;background:linear-gradient(90deg,var(--rose),var(--amber))"></div></div></div><div class="score">'+(h.pct==null?'-':h.pct+'%')+'</div></div>').join('')||'<div class="empty">ไม่มีเครื่องที่พบปัญหา 🎉</div>')+
        '</div></div>'+
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">จำนวนรายงานตามรอบ</div><div class="mini">IMP/D · IMP/N</div></div></div>'+barList(shiftRows,'var(--violet)','var(--cyan)')+'</div>'+
      '<div class="panel"><div class="panel-head"><div><div class="panel-title">จำนวนรายงานตามผู้ตรวจ</div><div class="mini">เจ้าหน้าที่ Onsite Support</div></div></div>'+barList(offRows,'var(--primary)','var(--mint)')+'</div>'+
    '</div>';
}
function topFail(f){const a=[['System',f.system],['RustDesk',f.rustdesk],['Network',f.network]].filter(x=>x[1]>0).sort((x,y)=>y[1]-x[1]);return a.length?a.map(x=>x[0]+'('+x[1]+')').slice(0,2).join(', '):'-';}
// กราฟแท่งแนวโน้ม Readiness (รอบล่าสุดสูงสุด 14 รอบ) — SVG ปรับขนาดตามจอ
function trendChartSvg(reports){
  const arr=(reports||[]).slice(0,14).reverse();
  if(!arr.length)return '<div class="empty">ยังไม่มีข้อมูล</div>';
  const W=760,H=250,padL=32,padR=12,padT=16,padB=50,cw=W-padL-padR,ch=H-padT-padB;
  const n=arr.length,slot=cw/n,bw=Math.min(42,slot*0.62);
  const col=p=>p>=95?'#16a34a':p>=85?'#0ea5e9':p>=70?'#f59e0b':p>=50?'#fb7185':'#ef4444';
  let g='';
  for(let i=0;i<=5;i++){const y=padT+ch-ch*i/5;g+='<line x1="'+padL+'" y1="'+y+'" x2="'+(W-padR)+'" y2="'+y+'" stroke="#e7edf7" stroke-width="1"/><text x="'+(padL-6)+'" y="'+(y+3.5)+'" text-anchor="end" font-size="10" fill="#94a3b8">'+(i*20)+'</text>';}
  arr.forEach((r,i)=>{const x=padL+slot*i+slot/2,bh=Math.max(2,ch*r.pct/100),y=padT+ch-bh;
    const d=parseDate(r.date),lbl=d?(String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')):'';
    g+='<rect x="'+(x-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="3" fill="'+col(r.pct)+'"><title>'+esc(dispDate(r.date))+' · '+esc(r.shift)+' = '+r.pct+'%</title></rect>'+
      '<text x="'+x+'" y="'+(y-4)+'" text-anchor="middle" font-size="10" font-weight="700" fill="#0b2f6b">'+r.pct+'</text>'+
      '<text x="'+x+'" y="'+(padT+ch+15)+'" text-anchor="middle" font-size="9.5" fill="#6a7d9b">'+lbl+'</text>'+
      '<text x="'+x+'" y="'+(padT+ch+27)+'" text-anchor="middle" font-size="8.5" fill="#9aa7bd">'+(String(r.shift).indexOf('IMP/D')>=0?'กลางวัน':'กลางคืน')+'</text>';});
  return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" style="max-height:270px;display:block">'+g+'</svg>';
}
function barList(rows,c1,c2){const max=Math.max(1,...rows.map(x=>x[1]));return rows.map(([k,v])=>'<div class="kpi-line"><span>'+esc(k||'-')+'</span><b>'+v+'</b></div><div class="bar" style="margin-bottom:8px"><div class="fill" style="width:'+Math.round(v/max*100)+'%;background:linear-gradient(90deg,'+c1+','+c2+')"></div></div>').join('')||'<div class="empty">ไม่มีข้อมูล</div>';}
function dashSteps(s){const steps=[];
  steps.push('ตรวจสอบระบบ TDAC ให้ครบทุกกะ (IMP/D และ IMP/N) และบันทึกรายงานทุกครั้ง');
  const worst=(s.problem||[])[0];
  if(worst)steps.push('ติดตามเครื่อง '+esc(worst.id)+' ที่พบ Not Ready '+worst.notReady+' ครั้ง (ระบบที่ล้มบ่อย: '+topFail(worst.fail)+')');
  else steps.push('ยังไม่พบ Kiosk ที่มีปัญหาซ้ำ — คงการตรวจสอบตามรอบปกติ');
  if((s.webPcPct||0)<100||(s.webMobilePct||0)<100)steps.push('ตรวจการแสดงผล Website ทั้ง PC ('+(s.webPcPct||0)+'%) และ Mobile ('+(s.webMobilePct||0)+'%) ที่ยังไม่พร้อมครบทุกรอบ');
  else steps.push('Website (PC/Mobile) พร้อมใช้งานครบทุกรอบที่บันทึกไว้');
  return steps.map((x,i)=>'<div class="step"><div class="step-num">'+(i+1)+'</div><div>'+x+'</div></div>').join('');
}

/* ---------- รายการรายงาน ---------- */
function renderReports(){
  const f=(filter||'').toLowerCase();
  const rows=(data.reports||[]).filter(r=>!f||((dispDate(r.date)+' '+r.shift+' '+r.officer+' '+r.issue).toLowerCase().includes(f)));
  $('content').innerHTML='<div class="toolbar"><input class="input search" value="'+esc(filter)+'" oninput="filter=this.value;render()" placeholder="ค้นหาวันที่ รอบ ผู้ตรวจ หรือปัญหา"><span class="mini">'+(data.reports||[]).length+' รายงาน</span></div>'+
    '<div class="table-wrap"><table><thead><tr><th>วันที่ตรวจสอบ</th><th>รอบ</th><th>ผู้ตรวจสอบ</th><th>Kiosk พร้อม</th><th>Readiness</th><th>Web PC</th><th>Web Mobile</th><th>ปัญหา</th><th></th></tr></thead><tbody>'+
    (rows.map(r=>'<tr><td class="nowrap">'+esc(dispDate(r.date))+'</td><td>'+esc(r.shift)+'</td><td>'+esc(r.officer)+'</td><td class="nowrap">'+r.ready+' / '+r.total+(r.pending?' <span class="mini" style="color:#b45309">(⏳'+r.pending+')</span>':'')+'</td><td><span class="tag '+pctTone(r.pct)+'">'+r.pct+'%</span>'+(r.pending?'<div class="mini">ตรวจได้ '+(r.checkedPct==null?'—':r.checkedPct+'%')+'</div>':'')+'</td>'+
      '<td>'+badge(r.webPc)+'</td><td>'+badge(r.webMobile)+'</td><td class="comment">'+(r.issue?esc(r.issue.slice(0,60))+(r.issue.length>60?'…':''):'<span class="mini">—</span>')+'</td>'+
      '<td class="nowrap"><button class="btn icon" onclick="openReportDetail('+r.id+')" title="ดู/แก้ไข">👁</button>'+(can('delete_report')?' <button class="btn icon danger" onclick="deleteReport('+r.id+')" title="ลบ">x</button>':'')+'</td></tr>').join('')||'<tr><td colspan="9" class="empty">ยังไม่มีรายงาน</td></tr>')+
    '</tbody></table></div>';
}
function badge(ok){return '<span class="tag '+(ok?'excellent':'critical')+'">'+(ok?'Ready':'Not Ready')+'</span>';}

/* ---------- สรุปรายเครื่อง Kiosk ---------- */
function renderKiosks(){
  const h=(data.summary&&data.summary.health)||[];
  $('content').innerHTML='<div class="notice">🖥️ <span>สรุปสุขภาพของเครื่อง Kiosk แต่ละตัวจากทุกรอบการตรวจสอบ — ดูได้ว่าเครื่องไหนมีปัญหาบ่อย และระบบใด (System/RustDesk/Network) ที่ล้มบ่อยที่สุด</span></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Kiosk ID</th><th>จำนวนครั้งที่ตรวจ</th><th>Not Ready</th><th>Readiness</th><th>System fail</th><th>RustDesk fail</th><th>Network fail</th></tr></thead><tbody>'+
    (h.map(x=>'<tr><td class="kid">'+esc(x.id)+'</td><td>'+x.checks+'</td><td>'+(x.notReady?'<span class="tag weak">'+x.notReady+'</span>':'<span class="mini">0</span>')+'</td>'+
      '<td>'+(x.pct==null?'<span class="mini">—</span>':'<span class="tag '+pctTone(x.pct)+'">'+x.pct+'%</span>')+'</td>'+
      '<td>'+failCell(x.fail.system)+'</td><td>'+failCell(x.fail.rustdesk)+'</td><td>'+failCell(x.fail.network)+'</td></tr>').join('')||'<tr><td colspan="7" class="empty">ยังไม่มีข้อมูล</td></tr>')+
    '</tbody></table></div>';
}
function failCell(n){return n?('<b style="color:var(--rose)">'+n+'</b>'):'<span class="mini">0</span>';}

/* ---------- วิเคราะห์ภาพรวม ---------- */
function renderInsights(){
  const s=data.summary||{},worst=(s.problem||[])[0],reports=data.reports||[];
  // readiness รายเดือน
  const byMonth={};reports.forEach(r=>{const d=parseDate(r.date);if(!d)return;const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');(byMonth[k]=byMonth[k]||[]).push(r.pct);});
  const monthRows=Object.entries(byMonth).sort((a,b)=>a[0]<b[0]?1:-1).slice(0,8).map(([k,arr])=>{const a=k.split('-');return [THAI_MONTHS[+a[1]-1]+' '+(+a[0]+543),Math.round(arr.reduce((x,y)=>x+y,0)/arr.length),arr.length];});
  const fail={system:0,rustdesk:0,network:0};(s.health||[]).forEach(h=>{fail.system+=h.fail.system;fail.rustdesk+=h.fail.rustdesk;fail.network+=h.fail.network;});
  const failRows=[['System',fail.system],['RustDesk',fail.rustdesk],['Network',fail.network]].sort((a,b)=>b[1]-a[1]);
  $('content').innerHTML='<div class="dash grid">'+
    '<div class="panel"><div class="panel-head"><div><div class="panel-title">วิเคราะห์ภาพรวม</div><div class="mini">สรุปจากทุกรอบการตรวจสอบ</div></div></div><div class="insight">'+
      '<div class="insight-card"><b>ภาพรวมความพร้อม</b>Readiness เฉลี่ย '+(s.avgReadiness||0)+'% จาก '+(s.total||0)+' รอบการตรวจสอบ · Website PC พร้อม '+(s.webPcPct||0)+'% · Mobile พร้อม '+(s.webMobilePct||0)+'%</div>'+
      '<div class="insight-card"><b>เครื่องที่ควรติดตาม</b>'+(worst?esc(worst.id)+' พบ Not Ready '+worst.notReady+'/'+worst.checks+' ครั้ง (ระบบที่ล้มบ่อย: '+topFail(worst.fail)+')':'ยังไม่พบเครื่องที่มีปัญหาซ้ำ')+'</div>'+
      '<div class="insight-card"><b>ระบบที่ล้มบ่อยที่สุด</b>'+(failRows[0]&&failRows[0][1]?failRows.filter(x=>x[1]).map(x=>x[0]+' ('+x[1]+' ครั้ง)').join(', '):'ไม่พบการล้มของระบบ')+'</div>'+
      '<div class="insight-card"><b>การรับแจ้งปัญหา</b>มีรอบที่บันทึกปัญหา/ข้อเสนอแนะ '+((s.issues||[]).length)+' รอบ</div>'+
    '</div></div>'+
    '<div class="panel"><div class="panel-head"><div><div class="panel-title">Readiness เฉลี่ยรายเดือน</div><div class="mini">8 เดือนล่าสุด</div></div></div>'+
      (monthRows.length?'<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>เดือน</th><th>Readiness</th><th>รอบ</th></tr></thead><tbody>'+monthRows.map(m=>'<tr><td>'+esc(m[0])+'</td><td><span class="tag '+pctTone(m[1])+'">'+m[1]+'%</span></td><td>'+m[2]+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">ยังไม่มีข้อมูล</div>')+
    '</div>'+
    '<div class="panel" style="grid-column:1/-1"><div class="panel-head"><div><div class="panel-title">บันทึกปัญหา/ข้อเสนอแนะล่าสุด</div><div class="mini">จากเจ้าหน้าที่ ตม.</div></div></div>'+
      ((s.issues||[]).length?'<div style="display:grid;gap:10px">'+(s.issues||[]).slice(0,12).map(r=>'<div class="insight-card"><b>'+esc(dispDate(r.date))+' · '+esc(r.shift)+' · '+esc(r.officer)+'</b>'+esc(r.issue)+'</div>').join('')+'</div>':'<div class="empty">ยังไม่มีบันทึกปัญหา</div>')+
    '</div></div>';
}

/* ---------- คู่มือการใช้งาน ---------- */
function renderHelp(){
  const roleNow=user.isAdmin?'admin':(user.role||'senior');
  const sec=(t,b)=>'<div class="panel"><div class="panel-title">'+t+'</div><div style="line-height:1.75;color:#28384f">'+b+'</div></div>';
  const ul=a=>'<ul style="margin:6px 0 0;padding-left:20px;line-height:1.9">'+a.map(x=>'<li>'+x+'</li>').join('')+'</ul>';
  const ol=a=>'<ol style="margin:6px 0 0;padding-left:20px;line-height:1.9">'+a.map(x=>'<li>'+x+'</li>').join('')+'</ol>';
  const eff=(role,key)=>{const c=CAPS.find(x=>x.key===key);if(perms&&perms[role]&&perms[role][key]!==undefined)return !!perms[role][key];return c?!!c.def[role]:false;};
  const ctr=v=>'<td style="text-align:center">'+v+'</td>',yn=b=>b?'✔':'—';
  let prows='<tr><td>ส่งรายงานการตรวจสอบ (ฟอร์มสาธารณะ)</td>'+ctr('✔')+ctr('✔')+ctr('✔')+ctr('✔')+'</tr>';
  prows+='<tr><td>ดูแดชบอร์ด / รายงาน / วิเคราะห์ (เข้าระบบ)</td>'+ctr('—')+ctr('✔')+ctr('✔')+ctr('✔')+'</tr>';
  CAPS.forEach(c=>{prows+='<tr><td>'+esc(c.label)+'</td>'+ctr('—')+ctr(yn(eff('senior',c.key)))+ctr(yn(eff('manager',c.key)))+ctr('✔')+'</tr>';});
  prows+='<tr><td><b>จัดการผู้ใช้ / สิทธิ์ / บันทึกการใช้งาน</b></td>'+ctr('—')+ctr('—')+ctr('—')+ctr('<b>✔</b>')+'</tr>';
  let h='';
  h+=sec('คู่มือการใช้งาน OSO-TDAC Operational Report',
    '<span class="tag neutral">คู่มือเวอร์ชัน '+APP_VERSION+'</span><br><br>ระบบรายงานการตรวจสอบระบบ TDAC (Website PC+Mobile และ Kiosk IMM001–IMM020) ณ ท่าอากาศยานสุวรรณภูมิ<br>บัญชีของคุณมีสิทธิ์: <span class="tag neutral">'+esc(roleNow)+'</span><br><br>ระบบแบ่งเป็น 2 ส่วน:'+ul([
      '<b>หน้าฟอร์มรายงาน (สาธารณะ)</b> — เจ้าหน้าที่ Onsite Support กรอกรายงานได้เลย ไม่ต้องล็อกอิน',
      '<b>ระบบหลังบ้าน</b> — Senior / Manager / Admin ล็อกอินเพื่อดูสรุป ทำรายงาน และจัดการข้อมูล'
    ]));
  h+=sec('สิทธิ์การใช้งานแต่ละระดับ (ปัจจุบัน)',
    '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>ความสามารถ</th><th>ผู้กรอก<br>(สาธารณะ)</th><th>senior</th><th>manager</th><th>admin</th></tr></thead><tbody>'+prows+'</tbody></table></div><div class="mini" style="margin-top:8px">admin ปรับสิทธิ์ได้ที่เมนู "จัดการสิทธิ์" มีผลกับผู้ใช้ที่ออนไลน์ทันที</div>');
  h+=sec('A. สำหรับเจ้าหน้าที่ Onsite Support (หน้าสาธารณะ ไม่ต้องล็อกอิน)',
    ol([
      'เปิดลิงก์ระบบ จะเข้าหน้าฟอร์มรายงานทันที',
      'เลือก <b>วันที่</b>, <b>รอบ</b> (IMP/D 10:00 หรือ IMP/N 22:00) และ <b>ชื่อผู้ตรวจสอบ</b>',
      '<b>Kiosk Checklist</b> — ขออนุญาต ตม. ก่อน แล้วติ๊ก System / RustDesk / Network ของ IMM001–IMM020 (กด <b>Check All</b> เมื่อพร้อมครบ 3 รายการ) ใส่ Remark ได้',
      '<b>Website/Mobile</b> — เปิด tdac.immigration.go.th บน PC และ Mobile แล้วติ๊ก System Ready',
      'กรอก <b>ปัญหา/ข้อเสนอแนะ</b> จากเจ้าหน้าที่ ตม. (ถ้ามี)',
      'กด <b>ส่งรายงานการตรวจสอบ</b> → แถบสรุปด้านบนแสดง Readiness แบบ real-time'
    ])+'<div class="mini" style="margin-top:8px">หมายเหตุ: เครื่องนับว่า <b>Not Ready</b> เมื่อ checkbox ใดยังไม่ติ๊ก — ไม่ใช่เพราะมี Remark</div>');
  h+=sec('B. สำหรับ Senior / Manager (หลังล็อกอิน)',
    'เมนูด้านซ้าย:'+ul([
      '<b>1. แดชบอร์ด</b> — KPI (จำนวนรายงาน, Readiness เฉลี่ย, รอบล่าสุด), เครื่องที่ต้องติดตาม, จำนวนตามรอบ/ผู้ตรวจ',
      '<b>2. รายการรายงาน</b> — ดูทุกรายงาน ค้นหาได้ · กด 👁 เพื่อดู/แก้ไขรายละเอียดทั้งฉบับ · ลบได้ (ตามสิทธิ์)',
      '<b>3. สรุปรายเครื่อง Kiosk</b> — สุขภาพรายเครื่อง: จำนวนครั้งตรวจ, Not Ready, Readiness, ระบบที่ล้มบ่อย',
      '<b>4. วิเคราะห์ภาพรวม</b> — Readiness รายเดือน + ระบบที่ล้มบ่อย + บันทึกปัญหา',
      '<b>จัดการรายชื่อ</b> — เพิ่ม/ลบ/เปิด-ปิด ชื่อเจ้าหน้าที่ผู้ตรวจสอบ',
      '<b>Tools</b> — ออกรายงาน DOCX, ส่งออก CSV, รีเฟรช, เปลี่ยนรหัสผ่าน'
    ]));
  h+=sec('C. สำหรับ Admin (เพิ่มเติม)',
    'admin ทำได้ทุกอย่างของ senior/manager และมีเมนูพิเศษ:'+ul([
      '<b>จัดการผู้ใช้ระบบ</b> — เพิ่ม/เปลี่ยนสิทธิ์/ลบบัญชี + อนุมัติคำขอลงทะเบียน',
      '<b>จัดการสิทธิ์</b> — กำหนดว่า senior/manager ทำอะไรได้ (มีผลทันที)',
      '<b>บันทึกการใช้งานระบบ (Audit Log)</b> — ประวัติการเพิ่ม/แก้/ลบ/เข้าระบบ',
      '<b>ตั้งค่าส่งอีเมลอัตโนมัติ</b> — ส่งรายงาน DOCX ของเดือนก่อนหน้าอัตโนมัติ 1 ครั้ง/เดือน'
    ]));
  h+=sec('D. รายงานและการส่งออก',
    ul([
      '<b>รายงาน DOCX</b> — เมนู Tools หรือปุ่มมุมขวาบน → เลือกรายวัน/รายเดือน/รายปี → ได้ไฟล์ Word: KPI + กราฟ Not Ready รายเครื่อง + ตารางสรุป + บันทึกปัญหา',
      '<b>ส่งออก CSV</b> — ทุกรายงานเปิดใน Excel ได้',
      '<b>ส่งอีเมล (DOCX)</b> — ในหน้าต่างรายงาน กรอกอีเมลผู้รับ → ส่งแนบไฟล์ DOCX (ตั้งค่า Brevo ก่อน — ดู SEND-EMAIL.md)',
      '<b>ส่งอัตโนมัติทุกเดือน</b> — เมนู "ตั้งค่าส่งอีเมลอัตโนมัติ" (admin) ดู AUTO-REPORT.md'
    ]));
  $('content').innerHTML=h;
}

/* ---------- จัดการรายชื่อเจ้าหน้าที่ ---------- */
async function renderDirectory(){
  $('content').innerHTML=LOADING;
  const {data:o,error}=await sb.from('officers').select('*').order('name');
  if(error){$('content').innerHTML='<div class="empty">โหลดรายชื่อไม่สำเร็จ</div>';return;}
  const items=o||[];
  $('content').innerHTML='<div class="panel"><div class="panel-head"><div><div class="panel-title">เจ้าหน้าที่ Onsite Support (ผู้ตรวจสอบ)</div><div class="mini">'+items.length+' รายชื่อ · ปิดใช้งานจะไม่แสดงในฟอร์มสาธารณะ · <b>อีเมล</b> = ที่อยู่รับรายงาน PDF อัตโนมัติจากฟอร์ม</div></div></div>'+
    '<div class="dir-add"><input class="input" id="add_officer" placeholder="พิมพ์ชื่อแล้วกดเพิ่ม" onkeydown="if(event.key===\'Enter\')addOfficer()"><button class="btn primary" onclick="addOfficer()">เพิ่ม</button></div>'+
    '<div class="dir-list">'+(items.map(it=>'<div class="dir-item" style="align-items:center"><div style="flex:1;min-width:0"><div>'+esc(it.name)+(it.active?'':' <span class="tag neutral">ปิดใช้งาน</span>')+'</div><input class="input" type="email" style="min-height:34px;margin-top:6px;max-width:300px" value="'+esc(it.email||'')+'" placeholder="อีเมลรับรายงาน PDF (เช่น name@example.com)" onchange="setOfficerEmail('+it.id+',this.value)"></div><div style="display:flex;gap:6px;flex-shrink:0"><button class="btn sm" onclick="toggleOfficer('+it.id+','+(it.active?'false':'true')+')">'+(it.active?'ปิดใช้งาน':'เปิดใช้งาน')+'</button><button class="btn icon danger" title="ลบ" onclick="delOfficer('+it.id+')">x</button></div></div>').join('')||'<div class="empty">ยังไม่มีรายชื่อ</div>')+'</div></div>';
}
async function setOfficerEmail(id,email){
  email=(email||'').trim().toLowerCase();
  if(email&&!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email))return toast('รูปแบบอีเมลไม่ถูกต้อง',true);
  const {error}=await sb.from('officers').update({email:email||null}).eq('id',id);
  if(error)return toast('บันทึกอีเมลไม่สำเร็จ: '+error.message,true);
  logAction('update','officer','id='+id+' email='+(email||'(ลบ)'));toast('บันทึกอีเมลแล้ว');
}
function nkey(s){return String(s||'').trim().replace(/\s+/g,' ').toLowerCase();}
async function addOfficer(){
  const el=$('add_officer'),name=(el.value||'').trim().replace(/\s+/g,' ');if(!name)return toast('กรุณากรอกชื่อ',true);
  const {data:ex}=await sb.from('officers').select('name');if((ex||[]).some(x=>nkey(x.name)===nkey(name)))return toast('มีชื่อ "'+name+'" อยู่แล้ว',true);
  const {error}=await sb.from('officers').insert({name});if(error)return toast('เพิ่มไม่สำเร็จ: '+error.message,true);
  el.value='';logAction('create','officer',name);toast('เพิ่มแล้ว');renderDirectory();
}
async function toggleOfficer(id,active){
  const {error}=await sb.from('officers').update({active}).eq('id',id);if(error)return toast('อัปเดตไม่สำเร็จ: '+error.message,true);
  logAction('update','officer','id='+id+' active='+active);renderDirectory();
}
async function delOfficer(id){
  if(!confirm('ลบรายชื่อนี้?'))return;const {error}=await sb.from('officers').delete().eq('id',id);if(error)return toast('ลบไม่สำเร็จ: '+error.message,true);
  logAction('delete','officer','id='+id);toast('ลบแล้ว');renderDirectory();
}

/* ---------- Modal รายละเอียด/แก้ไขรายงาน ---------- */
function openReportDetail(id){
  detailId=Number(id);const r=(data.reports||[]).find(x=>x.id===detailId);if(!r)return toast('ไม่พบรายงาน',true);
  const editable=can('edit_report');
  $('rdTitle').textContent=(editable?'แก้ไขรายงาน':'รายละเอียดรายงาน')+' · '+dispDate(r.date);
  $('rdSub').textContent='รอบ '+r.shift+(r.inspectStart?' · เวลา '+r.inspectStart+(r.inspectEnd?'–'+r.inspectEnd:''):'')+' · ผู้ตรวจ '+r.officer+' · บันทึกเมื่อ '+r.created;
  const dis=editable?'':' disabled';
  let b='<div class="form-grid">'+
    '<div class="field"><label class="label">วันที่ตรวจสอบ</label><input type="date" class="input" id="rdDate" value="'+esc(r.date)+'"'+dis+'></div>'+
    '<div class="field"><label class="label">รอบการตรวจสอบ</label><select class="input" id="rdShift"'+dis+'>'+SHIFTS.map(s=>'<option value="'+esc(s)+'"'+(s===r.shift?' selected':'')+'>'+esc(s)+'</option>').join('')+'</select></div></div>'+
    '<div class="form-grid"><div class="field"><label class="label">เวลาเริ่มตรวจ</label><input type="time" class="input" id="rdStart" value="'+esc(r.inspectStart||'')+'"'+dis+'></div>'+
    '<div class="field"><label class="label">ตรวจเสร็จเวลา</label><input type="time" class="input" id="rdEnd" value="'+esc(r.inspectEnd||'')+'"'+dis+'></div></div>'+
    '<div class="field"><label class="label">ชื่อเจ้าหน้าที่ผู้ตรวจสอบ</label><select class="input" id="rdOfficer"'+dis+'>'+
      [r.officer].concat((data.officers||[]).filter(n=>n!==r.officer)).map(n=>'<option value="'+esc(n)+'"'+(n===r.officer?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></div>'+
    '<div class="sumbar" style="margin:6px 0 14px;grid-template-columns:repeat(3,1fr)"><div class="sumchip"><div class="n">'+r.total+'</div><div class="l">Kiosks</div></div><div class="sumchip ok"><div class="n">'+r.ready+'</div><div class="l">พร้อมใช้งาน</div></div><div class="sumchip bad"><div class="n">'+r.notReady+'</div><div class="l">Not Ready</div></div><div class="sumchip"><div class="n" style="color:#b45309">'+(r.pending||0)+'</div><div class="l">รอตรวจซ้ำ</div></div><div class="sumchip pct"><div class="n">'+r.pct+'%</div><div class="l">Readiness</div></div><div class="sumchip pct"><div class="n">'+(r.checkedPct==null?'—':r.checkedPct+'%')+'</div><div class="l">Readiness (ตรวจได้)</div></div>'+
      '<div class="sumchip"><div class="n" style="font-size:16px;color:'+(r.webPc?'var(--green)':'var(--rose)')+'">'+(r.webPc?'Ready':'Not Ready')+'</div><div class="l">Website (PC)</div></div>'+
      '<div class="sumchip"><div class="n" style="font-size:16px;color:'+(r.webMobile?'var(--green)':'var(--rose)')+'">'+(r.webMobile?'Ready':'Not Ready')+'</div><div class="l">Website (Mobile)</div></div></div>'+
    timelineHtml(r)+
    '<div style="overflow:auto"><table class="ktable"><thead><tr><th style="width:90px">Kiosk</th><th>System / RustDesk / Network</th><th style="min-width:150px">Remark</th></tr></thead><tbody id="rdKioskBody">'+kioskRowsHtml()+'</tbody></table></div>'+
    '<div style="overflow:auto;margin-top:12px"><table class="ktable"><thead><tr><th style="width:150px">Platform</th><th style="width:140px">System Ready</th><th>Remark</th></tr></thead><tbody>'+
      '<tr><td class="kid">Website (PC)</td><td><label class="chk'+(r.webPc?' on':'')+'"><input type="checkbox" id="rdWebPc"'+(r.webPc?' checked':'')+dis+' onchange="this.closest(\'.chk\').classList.toggle(\'on\',this.checked)"><span>System Ready</span></label></td><td><textarea class="remark-input" id="rdWebPcRemark"'+dis+' oninput="autoGrow(this)">'+esc(r.webPcRemark)+'</textarea><div class="photo-box" id="rdPhoto-web-pc"></div></td></tr>'+
      '<tr><td class="kid">Website (Mobile)</td><td><label class="chk'+(r.webMobile?' on':'')+'"><input type="checkbox" id="rdWebMobile"'+(r.webMobile?' checked':'')+dis+' onchange="this.closest(\'.chk\').classList.toggle(\'on\',this.checked)"><span>System Ready</span></label></td><td><textarea class="remark-input" id="rdWebMobileRemark"'+dis+' oninput="autoGrow(this)">'+esc(r.webMobileRemark)+'</textarea><div class="photo-box" id="rdPhoto-web-mobile"></div></td></tr>'+
    '</tbody></table></div>'+
    '<div class="field" style="margin-top:14px"><label class="label">ปัญหา / ข้อเสนอแนะ</label><textarea class="input" id="rdIssue"'+dis+' style="min-height:90px">'+esc(r.issue)+'</textarea><div class="photo-box" id="rdPhoto-issue"></div></div>';
  $('rdBody').innerHTML=b;
  photoReadonly=!editable;resetPhotos();
  photoState.issue=(r.issuePhotos||[]).slice();photoState['web-pc']=(r.webPcPhotos||[]).slice();photoState['web-mobile']=(r.webMobilePhotos||[]).slice();
  setKiosks('rdKioskBody',r.kiosks);
  renderPhotos('issue','rdKioskBody');renderPhotos('web-pc','rdKioskBody');renderPhotos('web-mobile','rdKioskBody');
  if(!editable)$('rdKioskBody').querySelectorAll('input,textarea,button').forEach(el=>{if(el.tagName==='BUTTON')el.style.display='none';else el.disabled=true;});
  let foot='<button class="btn" onclick="closeReportDetail()">ปิด</button>';
  if(can('delete_report'))foot='<button class="btn danger" onclick="deleteReport('+r.id+',true)">ลบรายงาน</button>'+foot;
  if(editable)foot+='<button class="btn primary" id="rdSaveBtn" onclick="saveReportDetail()">บันทึกการแก้ไข</button>';
  $('rdFoot').innerHTML=foot;
  $('reportDetailModal').classList.add('open');
}
function closeReportDetail(){$('reportDetailModal').classList.remove('open');detailId=0;}
async function saveReportDetail(){
  if(!detailId)return;
  const date=$('rdDate').value,shift=$('rdShift').value,officer=$('rdOfficer').value;
  if(!date||!shift||!officer)return toast('กรอกวันที่ รอบ และผู้ตรวจให้ครบ',true);
  const kiosks=readKiosks('rdKioskBody'),st=readinessStats(kiosks,KIOSK_COUNT);
  $('rdSaveBtn').disabled=true;
  const upd={report_date:date,shift,officer,
    inspect_start:($('rdStart')&&$('rdStart').value||'').trim()||null,inspect_end:($('rdEnd')&&$('rdEnd').value||'').trim()||null,
    web_pc_ready:!!$('rdWebPc').checked,web_pc_remark:($('rdWebPcRemark').value||'').trim()||null,
    web_mobile_ready:!!$('rdWebMobile').checked,web_mobile_remark:($('rdWebMobileRemark').value||'').trim()||null,
    issue_log:($('rdIssue').value||'').trim()||null,
    issue_photos:(photoState.issue||[]).slice(),web_pc_photos:(photoState['web-pc']||[]).slice(),web_mobile_photos:(photoState['web-mobile']||[]).slice(),
    kiosks_total:KIOSK_COUNT,kiosks_ready:st.ready,kiosks_pending:st.pending,readiness_pct:st.pct};
  const {error}=await sb.from('reports').update(upd).eq('id',detailId);
  if(error){$('rdSaveBtn').disabled=false;return toast('บันทึกไม่สำเร็จ: '+error.message,true);}
  // แทนที่ report_kiosks ทั้งชุด (ลบเก่า + ใส่ใหม่)
  await sb.from('report_kiosks').delete().eq('report_id',detailId);
  const rows=kiosks.map(k=>Object.assign({report_id:detailId},k));
  const {error:ke}=await sb.from('report_kiosks').insert(rows);
  $('rdSaveBtn').disabled=false;
  if(ke)return toast('บันทึก Kiosk ไม่สำเร็จ: '+ke.message,true);
  logAction('update','report','id='+detailId+' '+date+' '+shift);
  toast('บันทึกการแก้ไขแล้ว');closeReportDetail();refresh();
}
async function deleteReport(id,fromModal){
  if(!can('delete_report'))return toast('คุณไม่มีสิทธิ์ลบรายงาน',true);
  if(!confirm('ลบรายงานการตรวจสอบนี้? (ลบรายละเอียด Kiosk ทั้งหมดด้วย)\nการลบนี้ย้อนกลับไม่ได้'))return;
  const {error}=await sb.from('reports').delete().eq('id',id);
  if(error)return toast('ลบไม่สำเร็จ: '+error.message,true);
  logAction('delete','report','id='+id);toast('ลบรายงานแล้ว');if(fromModal)closeReportDetail();refresh();
}

/* ---------- ส่งออก CSV ---------- */
async function exportCSV(){
  await ensureFresh();
  const head=['วันที่','รอบ','ผู้ตรวจสอบ','Kiosk พร้อม','รอตรวจซ้ำ','Kiosk ทั้งหมด','Readiness %','Readiness ตรวจได้ %','Web PC','Web Mobile','ปัญหา/ข้อเสนอแนะ','บันทึกเมื่อ'];
  const rows=(data.reports||[]).map(r=>[dispDate(r.date),r.shift,r.officer,r.ready,r.pending||0,r.total,r.pct,(r.checkedPct==null?'':r.checkedPct),r.webPc?'Ready':'Not Ready',r.webMobile?'Ready':'Not Ready',r.issue||'',r.created]);
  const csv=[head].concat(rows).map(row=>row.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='OSO_TDAC_Reports_'+new Date().toISOString().slice(0,10)+'.csv';a.click();toast('ส่งออกแล้ว');
}

/* ============================================================
   จัดการผู้ใช้ระบบ / สิทธิ์ / Audit (reuse จาก OSO Evaluation)
   ============================================================ */
async function adminFn(body){
  try{const {data,error}=await sb.functions.invoke('admin-users',{body});
    if(error){let msg=error.message||'error';try{if(error.context&&typeof error.context.json==='function'){const j=await error.context.json();if(j&&j.error)msg=j.error;}}catch(_){}return {error:msg};}
    if(data&&data.error)return {error:data.error};return {data:data||{}};
  }catch(ex){return {error:String((ex&&ex.message)||ex)};}
}
async function renderUsers(){
  if(!user.isAdmin){toast('เฉพาะผู้ดูแลระบบ (admin)',true);view='dashboard';return render();}
  $('content').innerHTML=LOADING;
  const r=await adminFn({action:'list'});
  if(r.error){$('content').innerHTML='<div class="panel"><div class="panel-title">จัดการผู้ใช้ระบบ</div><div class="empty" style="text-align:left;line-height:1.7">เรียกใช้ Edge Function ไม่สำเร็จ<br><b>'+esc(r.error)+'</b><br><br>ตรวจว่า: 1) deploy ฟังก์ชัน <code>admin-users</code> แล้ว 2) ตั้งความลับ <code>ADMIN_EMAILS="'+esc(user.email)+'"</code> (ดู USER-MANAGEMENT.md)</div></div>';return;}
  const users=(r.data&&r.data.users)||[];
  let pmap={};try{const {data:profs}=await sb.from('profiles').select('email,display_name');(profs||[]).forEach(p=>pmap[p.email]=p.display_name||'');}catch(e){}
  let reqs=[];try{const {data:rq}=await sb.from('access_requests').select('*').eq('status','pending').order('created_at',{ascending:false});reqs=rq||[];}catch(e){}
  const reqPanel='<div class="panel" style="margin-top:16px"><div class="panel-title">คำขอลงทะเบียน (รออนุมัติ) ('+reqs.length+')</div><div class="mini" style="margin-bottom:8px">อนุมัติ = กำหนดสิทธิ์ + เปิดให้เข้าใช้งาน · ปฏิเสธ = ลบบัญชีคำขอ</div>'+
    (reqs.length?'<div class="table-wrap"><table><thead><tr><th>อีเมล</th><th>ชื่อ-นามสกุล</th><th>เหตุผล</th><th>วันที่ขอ</th><th>อนุมัติเป็น</th><th></th></tr></thead><tbody>'+
      reqs.map(q=>{const uid=(users.find(u=>u.email===q.email)||{}).id||'';return '<tr><td><b>'+esc(q.email)+'</b></td><td>'+esc(q.full_name||'-')+'</td><td>'+esc(q.reason||'-')+'</td><td class="nowrap">'+esc(q.created_at?new Date(q.created_at).toLocaleString('th-TH'):'-')+'</td><td><select class="input" id="rqrole'+q.id+'" style="min-height:34px;width:auto;padding:4px 10px"><option value="senior">senior</option><option value="manager">manager</option><option value="admin">admin</option></select></td><td class="nowrap"><button class="btn primary sm" onclick="approveRequest('+q.id+',\''+js(q.email)+'\',\''+uid+'\')">อนุมัติ</button> <button class="btn danger sm" onclick="rejectRequest('+q.id+',\''+js(q.email)+'\',\''+uid+'\')">ปฏิเสธ</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="empty">ไม่มีคำขอรออนุมัติ</div>')+'</div>';
  const roleSel=(id,rr)=>'<select onchange="setUserRole(\''+id+'\',this.value)" class="input" style="min-height:34px;width:auto;padding:4px 10px">'+['admin','senior','manager'].map(x=>'<option value="'+x+'"'+(x===rr?' selected':'')+'>'+x+'</option>').join('')+'</select>';
  $('content').innerHTML=
    '<div class="panel"><div class="panel-head"><div><div class="panel-title">เพิ่มผู้ใช้ใหม่</div><div class="mini">สร้างบัญชี + กำหนดสิทธิ์</div></div></div>'+
    '<div class="form-grid"><div class="field"><label class="label">Email</label><input class="input" id="nuEmail" type="email" placeholder="user@example.com"></div><div class="field"><label class="label">รหัสผ่าน</label><div style="position:relative"><input class="input" id="nuPass" type="password" placeholder="เช่น Onsite@2026" style="padding-right:46px"><button type="button" onclick="togglePass(\'nuPass\',this)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;cursor:pointer;font-size:19px;line-height:1;padding:6px;color:#64748b">👁</button></div></div></div>'+
    '<div style="display:flex;gap:10px;align-items:flex-end;margin-top:12px"><div class="field" style="margin:0"><label class="label">สิทธิ์</label><select class="input" id="nuRole" style="width:auto"><option value="senior">senior</option><option value="manager">manager</option><option value="admin">admin</option></select></div><button class="btn primary" onclick="addUser()">+ เพิ่มผู้ใช้</button></div></div>'+
    reqPanel+
    '<div class="panel" style="margin-top:16px"><div class="panel-title">ผู้ใช้ทั้งหมด ('+users.length+')</div><div class="mini" style="margin-bottom:8px">แก้ "ชื่อที่แสดง" แล้วคลิกออกจากช่อง = บันทึกอัตโนมัติ</div><div class="table-wrap"><table><thead><tr><th>Email</th><th>ชื่อที่แสดง</th><th>สิทธิ์</th><th>เข้าระบบล่าสุด</th><th></th></tr></thead><tbody>'+
    (users.map(u=>'<tr><td><b>'+esc(u.email)+'</b>'+(u.email===user.email?' <span class="tag neutral">คุณ</span>':'')+'</td><td><input class="input" style="min-height:32px;width:180px" value="'+esc(pmap[u.email]||'')+'" placeholder="เช่น นางสาวณัฏฐา ..." onchange="setDisplayName(\''+js(u.email)+'\',this.value)"></td><td>'+roleSel(u.id,u.role)+'</td><td class="nowrap">'+esc(u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleString('th-TH'):'-')+'</td><td class="nowrap">'+(u.email===user.email?'':'<button class="btn danger sm" onclick="deleteUser(\''+u.id+'\',\''+js(u.email)+'\')">ลบ</button>')+'</td></tr>').join('')||'<tr><td colspan="5" class="empty">ไม่มีผู้ใช้</td></tr>')+
    '</tbody></table></div></div>';
}
async function addUser(){
  const raw=($('nuEmail').value||'');const email=raw.normalize('NFKC').replace(/[^\x21-\x7E]/g,'').toLowerCase();
  const pass=$('nuPass').value||'',role=$('nuRole').value;
  if(!/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(email))return toast('รูปแบบอีเมลไม่ถูกต้อง: '+(email||'(ว่าง)'),true);
  if(pass.length<6)return toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร',true);
  const r=await adminFn({action:'create',email,password:pass,role});if(r.error)return toast('เพิ่มไม่สำเร็จ: '+r.error,true);
  logAction('user_create','user',email+' ('+role+')');toast('เพิ่มผู้ใช้ '+email+' แล้ว');renderUsers();
}
async function setUserRole(id,role){const r=await adminFn({action:'updateRole',id,role});if(r.error)return toast('เปลี่ยนสิทธิ์ไม่สำเร็จ: '+r.error,true);logAction('user_role','user',id+' → '+role);toast('อัปเดตสิทธิ์เป็น '+role+' แล้ว');}
async function deleteUser(id,email){if(!confirm('ลบบัญชีผู้ใช้ '+email+'?'))return;const r=await adminFn({action:'delete',id});if(r.error)return toast('ลบไม่สำเร็จ: '+r.error,true);logAction('user_delete','user',email);toast('ลบผู้ใช้แล้ว');renderUsers();}
async function approveRequest(reqId,email,uid){
  const sel=$('rqrole'+reqId);const role=(sel&&sel.value)||'senior';
  if(!uid)return toast('ไม่พบบัญชีของ '+email+' — ลองรีเฟรช',true);
  const r=await adminFn({action:'approve',id:uid,email,role});if(r.error)return toast('อนุมัติไม่สำเร็จ: '+r.error,true);
  try{await sb.from('access_requests').update({status:'approved',reviewed_by:user.email,reviewed_at:new Date().toISOString()}).eq('id',reqId);}catch(e){}
  logAction('user_approve','user',email+' ('+role+')');toast('อนุมัติ '+email+' เป็น '+role+' แล้ว'+(r.data&&r.data.mailed?' (ส่งอีเมลแล้ว)':''));renderUsers();
}
async function rejectRequest(reqId,email,uid){
  if(!confirm('ปฏิเสธคำขอของ '+email+'? (บัญชีจะถูกลบ)'))return;
  if(uid){const r=await adminFn({action:'delete',id:uid});if(r.error&&!/not.*found|no.*user/i.test(r.error))console.warn('reject delete:',r.error);}
  try{await sb.from('access_requests').update({status:'rejected',reviewed_by:user.email,reviewed_at:new Date().toISOString()}).eq('id',reqId);}catch(e){}
  logAction('user_reject','user',email);toast('ปฏิเสธคำขอแล้ว');renderUsers();
}
async function setDisplayName(email,name){
  name=(name||'').trim();const {error}=await sb.from('profiles').upsert({email,display_name:name||null,updated_at:new Date().toISOString()},{onConflict:'email'});
  if(error)return toast('บันทึกชื่อไม่สำเร็จ: '+error.message,true);
  logAction('update','user','ชื่อที่แสดง: '+email+' = '+(name||'(ลบ)'));toast('บันทึกชื่อที่แสดงแล้ว');
  if(email===user.email){user.displayName=name||user.email;hydrateUser();}
}
async function renderAudit(){
  if(!user.isAdmin){toast('เฉพาะผู้ดูแลระบบ (admin)',true);view='dashboard';return render();}
  $('content').innerHTML=LOADING;
  const {data,error}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(500);
  if(error){$('content').innerHTML='<div class="panel"><div class="panel-title">บันทึกการใช้งานระบบ</div><div class="empty" style="text-align:left;line-height:1.7">อ่านบันทึกไม่สำเร็จ: <b>'+esc(error.message)+'</b><br>ตรวจว่ารัน schema.sql และตั้ง role=admin แล้วออก-เข้าระบบใหม่</div></div>';return;}
  const rows=data||[];
  const actMap={create:'เพิ่ม',update:'แก้ไข',delete:'ลบ',login:'เข้าระบบ',permissions:'แก้ไขสิทธิ์',user_create:'เพิ่มผู้ใช้',user_role:'เปลี่ยนสิทธิ์ผู้ใช้',user_delete:'ลบผู้ใช้',user_approve:'อนุมัติผู้ใช้',user_reject:'ปฏิเสธผู้ใช้',password:'เปลี่ยนรหัสผ่าน',email:'ส่งอีเมลรายงาน'};
  const f=(filter||'').toLowerCase();
  const v2=rows.filter(r=>!f||((r.actor||'')+' '+(r.action||'')+' '+(r.entity||'')+' '+(r.detail||'')).toLowerCase().includes(f));
  $('content').innerHTML='<div class="toolbar"><input class="input search" value="'+esc(filter)+'" oninput="filter=this.value;render()" placeholder="ค้นหาผู้ใช้ การกระทำ หรือรายละเอียด"><button class="btn" onclick="filter=\'\';renderAudit()">รีเฟรช</button><span class="mini">'+rows.length+' รายการล่าสุด</span></div>'+
    '<div class="table-wrap"><table><thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>ส่วน</th><th>รายละเอียด</th></tr></thead><tbody>'+
    (v2.map(r=>'<tr><td class="nowrap">'+esc(new Date(r.created_at).toLocaleString('th-TH'))+'</td><td>'+esc(r.actor||'-')+'</td><td><span class="tag neutral">'+esc(actMap[r.action]||r.action)+'</span></td><td>'+esc(r.entity||'-')+'</td><td class="comment">'+esc(r.detail||'-')+'</td></tr>').join('')||'<tr><td colspan="5" class="empty">ยังไม่มีบันทึก</td></tr>')+
    '</tbody></table></div>';
}
function renderPerms(){
  if(!user.isAdmin){toast('เฉพาะผู้ดูแลระบบ (admin)',true);view='dashboard';return render();}
  const cell=(role,c)=>{const cur=(perms[role]&&perms[role][c.key]!==undefined)?!!perms[role][c.key]:!!c.def[role];return '<input type="checkbox" data-role="'+role+'" data-cap="'+c.key+'"'+(cur?' checked':'')+' style="width:18px;height:18px;cursor:pointer">';};
  $('content').innerHTML='<div class="panel"><div class="panel-head"><div><div class="panel-title">จัดการสิทธิ์การใช้งาน</div><div class="mini">กำหนดว่าแต่ละบทบาททำอะไรได้ · admin มีสิทธิ์ทุกอย่างเสมอ</div></div><button class="btn primary" onclick="savePerms()">บันทึกสิทธิ์</button></div>'+
    '<div class="table-wrap"><table style="min-width:auto"><thead><tr><th>ความสามารถ</th><th style="text-align:center">senior</th><th style="text-align:center">manager</th><th style="text-align:center">admin</th></tr></thead><tbody>'+
    CAPS.map(c=>'<tr><td>'+esc(c.label)+'</td><td style="text-align:center">'+cell('senior',c)+'</td><td style="text-align:center">'+cell('manager',c)+'</td><td style="text-align:center">✔</td></tr>').join('')+
    '<tr style="opacity:.7"><td>จัดการผู้ใช้ / สิทธิ์ / บันทึกการใช้งาน</td><td style="text-align:center">—</td><td style="text-align:center">—</td><td style="text-align:center">✔</td></tr>'+
    '</tbody></table></div></div>';
}
async function savePerms(){
  const next={senior:{},manager:{}};
  document.querySelectorAll('#content input[type=checkbox][data-cap]').forEach(b=>{next[b.dataset.role][b.dataset.cap]=b.checked;});
  const {error}=await sb.from('app_settings').upsert({key:'permissions',value:next,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)return toast('บันทึกไม่สำเร็จ: '+error.message,true);
  perms=next;logAction('permissions','permissions','update');applyRoleUI();toast('บันทึกสิทธิ์แล้ว');
}

/* ============================================================
   รายงาน DOCX (สร้างในเบราว์เซอร์ด้วย JSZip) — เนื้อหา TDAC
   ============================================================ */
function dEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');}
function dRun(text,o){o=o||{};const sz=Math.round((o.sz||22)*1.3);const rpr='<w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New" w:cs="TH Sarabun New"/>'+(o.bold?'<w:b/><w:bCs/>':'')+'<w:color w:val="'+(o.color||'1f2937')+'"/><w:sz w:val="'+sz+'"/><w:szCs w:val="'+sz+'"/></w:rPr>';const lines=String(text==null?'':text).split('\n');let out='';for(let i=0;i<lines.length;i++){if(i>0)out+='<w:r>'+rpr+'<w:br/></w:r>';out+='<w:r>'+rpr+'<w:t xml:space="preserve">'+dEsc(lines[i])+'</w:t></w:r>';}return out;}
function dPar(text,o){o=o||{};const jc=o.align?'<w:jc w:val="'+o.align+'"/>':'';const shd=o.fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+o.fill+'"/>':'';const ind=o.indent?'<w:ind w:left="'+o.indent+'"/>':'';return '<w:p><w:pPr><w:spacing w:before="'+(o.before||0)+'" w:after="'+(o.after==null?60:o.after)+'" w:line="276" w:lineRule="auto"/>'+jc+shd+ind+'</w:pPr>'+dRun(text,o)+'</w:p>';}
function dHeading(text){return dPar(text,{sz:26,bold:true,color:'1749c4',before:200,after:80});}
function dCellPar(text,o){o=o||{};const shd=o.fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+o.fill+'"/>':'';return '<w:p><w:pPr><w:spacing w:before="20" w:after="20"/>'+(o.align?'<w:jc w:val="'+o.align+'"/>':'')+shd+'</w:pPr>'+dRun(text,o)+'</w:p>';}
function dTable(rows,widths,headerFill){
  const grid='<w:tblGrid>'+widths.map(w=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>';
  const borders='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D0D7E5"/><w:left w:val="single" w:sz="4" w:color="D0D7E5"/><w:bottom w:val="single" w:sz="4" w:color="D0D7E5"/><w:right w:val="single" w:sz="4" w:color="D0D7E5"/><w:insideH w:val="single" w:sz="4" w:color="D0D7E5"/><w:insideV w:val="single" w:sz="4" w:color="D0D7E5"/></w:tblBorders>';
  const trs=rows.map((cells,ri)=>{const isH=ri===0;return '<w:tr>'+(isH?'<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>':'')+cells.map((cell,ci)=>{const fill=isH?(headerFill||'E8F0FC'):null;return '<w:tc><w:tcPr><w:tcW w:w="'+widths[ci]+'" w:type="dxa"/>'+(fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+fill+'"/>':'')+'<w:vAlign w:val="center"/></w:tcPr>'+dCellPar(cell,{sz:20,bold:isH,color:isH?'0b2f6b':'1f2937'})+'</w:tc>';}).join('')+'</w:tr>';}).join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="'+widths.reduce((a,b)=>a+b,0)+'" w:type="dxa"/><w:tblLayout w:type="fixed"/>'+borders+'</w:tblPr>'+grid+trs+'</w:tbl>'+dPar('',{after:60});
}
function dKpiCards(cards){
  const w=Math.floor(9000/cards.length);
  const grid='<w:tblGrid>'+cards.map(()=>'<w:gridCol w:w="'+w+'"/>').join('')+'</w:tblGrid>';
  // card[3] = สีค่าตัวเลข (ถ้ามี) ใช้สีเฉพาะการ์ดได้
  const cell=(t,o)=>'<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F2F7FF"/><w:vAlign w:val="center"/></w:tcPr>'+dCellPar(t,o)+'</w:tc>';
  const r1='<w:tr>'+cards.map(c=>cell(c[0],{sz:18,color:'6a7d9b',align:'center'})).join('')+'</w:tr>';
  const r2='<w:tr>'+cards.map(c=>cell(c[1],{sz:34,bold:true,color:c[3]||'0b2f6b',align:'center'})).join('')+'</w:tr>';
  const r3='<w:tr>'+cards.map(c=>cell(c[2],{sz:18,color:'6a7d9b',align:'center'})).join('')+'</w:tr>';
  return '<w:tbl><w:tblPr><w:tblW w:w="'+(w*cards.length)+'" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="DCE5F2"/><w:left w:val="single" w:sz="4" w:color="DCE5F2"/><w:bottom w:val="single" w:sz="4" w:color="DCE5F2"/><w:right w:val="single" w:sz="4" w:color="DCE5F2"/><w:insideH w:val="single" w:sz="4" w:color="DCE5F2"/><w:insideV w:val="single" w:sz="4" w:color="DCE5F2"/></w:tblBorders></w:tblPr>'+grid+r1+r2+r3+'</w:tbl>'+dPar('',{after:80});
}
// โหลดไบต์โลโก้ (cache) สำหรับฝังใน DOCX
let LOGO_CACHE=null;
async function getLogoBytes(){
  if(LOGO_CACHE)return LOGO_CACHE;
  try{const f=async u=>new Uint8Array(await (await fetch(u)).arrayBuffer());
    LOGO_CACHE={tdac:await f('assets/logo-tdac.png'),somapa:await f('assets/logo-somapa.png')};
  }catch(e){LOGO_CACHE={};}
  return LOGO_CACHE;
}
// แถวโลโก้ส่วนหัวเอกสาร DOCX (คืน '' ถ้าโหลดโลโก้ไม่ได้)
function dLogoHeaderXml(logos){
  if(!logos||!logos.tdac||!logos.somapa)return '';
  const cy=430000;  // สูง ~12 มม.
  const pic=(rid,id,cx,name)=>'<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="'+id+'" name="'+name+'"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+name+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr>'+
    pic('rIdLogo1',101,Math.round(cy*2.64),'logo-tdac')+
    '<w:r><w:rPr><w:rFonts w:ascii="TH Sarabun New" w:hAnsi="TH Sarabun New"/></w:rPr><w:t xml:space="preserve">       </w:t></w:r>'+
    pic('rIdLogo2',102,Math.round(cy*2.97),'logo-somapa')+'</w:p>';
}
const D_LOGO_RELS='<Relationship Id="rIdLogo1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-tdac.png"/><Relationship Id="rIdLogo2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo-somapa.png"/>';
function addLogoMedia(wordFolder,logos){if(logos&&logos.tdac&&logos.somapa){const m=wordFolder.folder('media');m.file('logo-tdac.png',logos.tdac);m.file('logo-somapa.png',logos.somapa);}}

// ตารางคีย์-ค่า (ไม่มีแถวหัว) — คอลัมน์ซ้ายเป็นป้ายชื่อ
function dKvTable(pairs,w1,w2){
  const borders='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D0D7E5"/><w:left w:val="single" w:sz="4" w:color="D0D7E5"/><w:bottom w:val="single" w:sz="4" w:color="D0D7E5"/><w:right w:val="single" w:sz="4" w:color="D0D7E5"/><w:insideH w:val="single" w:sz="4" w:color="D0D7E5"/><w:insideV w:val="single" w:sz="4" w:color="D0D7E5"/></w:tblBorders>';
  const trs=pairs.map(p=>'<w:tr>'+
    '<w:tc><w:tcPr><w:tcW w:w="'+w1+'" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="F2F7FF"/><w:vAlign w:val="center"/></w:tcPr>'+dCellPar(p[0],{sz:20,bold:true,color:'0b2f6b'})+'</w:tc>'+
    '<w:tc><w:tcPr><w:tcW w:w="'+w2+'" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>'+dCellPar(p[1],{sz:20,color:'1f2937'})+'</w:tc></w:tr>').join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="'+(w1+w2)+'" w:type="dxa"/><w:tblLayout w:type="fixed"/>'+borders+'</w:tblPr><w:tblGrid><w:gridCol w:w="'+w1+'"/><w:gridCol w:w="'+w2+'"/></w:tblGrid>'+trs+'</w:tbl>'+dPar('',{after:80});
}
// ดึงรูปจาก URL เป็นไบต์ + ขนาดจริง (สำหรับฝังใน DOCX) — คืน null ถ้าล้มเหลว (ไม่ทำให้ DOCX พัง)
async function fetchDocxImage(url){
  try{
    const resp=await fetch(url,{mode:'cors',cache:'no-store'});if(!resp.ok)return null;
    const blob=await resp.blob();const bytes=new Uint8Array(await blob.arrayBuffer());
    const dim=await new Promise(res=>{const u=URL.createObjectURL(blob);const im=new Image();im.onload=()=>{res({w:im.naturalWidth||320,h:im.naturalHeight||240});URL.revokeObjectURL(u);};im.onerror=()=>{res({w:320,h:240});URL.revokeObjectURL(u);};im.src=u;});
    return {bytes,w:dim.w,h:dim.h};
  }catch(e){return null;}
}
// ไบต์รูปสำหรับฝัง DOCX: ใช้ของที่แคชไว้ตอนอัปโหลดก่อน (ชัวร์สุด) แล้วค่อย fallback ไปดึงจาก Storage
async function docxImageFor(path){
  const c=photoBytes[path];
  if(c&&c.bytes&&c.bytes.length)return c;
  return await fetchDocxImage(photoUrl(path));
}
// รวบรวม path รูปทุกช่องจากออบเจ็กต์รายงาน → [{label, path}]
function collectReportPhotos(r){
  const out=[],push=(label,arr)=>{(arr||[]).forEach(p=>{if(p)out.push({label,path:p});});};
  push('ข้อเสนอแนะ / ปัญหา', r.issue_photos||r.issuePhotos);
  push('Website (PC)', r.web_pc_photos||r.webPcPhotos);
  push('Website (Mobile)', r.web_mobile_photos||r.webMobilePhotos);
  (r.kiosks||[]).forEach(k=>push((k.kiosk_id||'Kiosk')+' — หมายเหตุ', k.remark_photos));
  return out;
}
// XML รูปภาพ inline ขนาด cx,cy (EMU)
function dPhotoXml(rid,cx,cy,pid,name){
  return '<w:p><w:pPr><w:spacing w:before="20" w:after="80"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="'+pid+'" name="'+name+'"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="'+pid+'" name="'+name+'"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rid+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
// DOCX รายงานการตรวจสอบ 1 ฉบับ (สำหรับส่งอีเมลให้เจ้าหน้าที่ OSO จากฟอร์มสาธารณะ) — รูปแบบทางการ พอดี A4
async function buildSingleReportDocxBlob(r){
  if(typeof JSZip==='undefined'){toast('โหลด JSZip ไม่สำเร็จ',true);return null;}
  const yes='✔',no='✘';   // ✔ / ✘
  const logos=await getLogoBytes();
  let body=dLogoHeaderXml(logos);
  body+=dPar('รายงานการตรวจสอบระบบ TDAC',{sz:38,bold:true,color:'0b2f6b',align:'center',after:40});
  body+=dPar('Website (PC + Mobile) และ Kiosk · Onsite Support Officer · ท่าอากาศยานสุวรรณภูมิ (BKK)',{sz:18,color:'374151',align:'center',after:180});
  const webReady=(r.webPc?1:0)+(r.webMobile?1:0),webPct=Math.round(webReady/2*100);
  const rst=readinessStats(r.kiosks||[],r.total||KIOSK_COUNT);
  const pending=rst.occupied,notReady=rst.notReady,checkedPct=rst.checkedPct;
  const tStart=r.inspectStart||'',tEnd=r.inspectEnd||'';
  const timeRange=tStart?(tStart+(tEnd?' – '+tEnd+' น. (รอบแรก)':' น. (ยังไม่ระบุเวลาสิ้นสุด)')):(tEnd?'ถึง '+tEnd+' น.':'—');
  const TL=inspectionTimeline(r);
  const kv=[
    ['วันที่ตรวจสอบ',dispDate(r.date)],
    ['รอบการตรวจสอบ',r.shift],
    ['ช่วงเวลาการตรวจ',timeRange],
    ['ผู้ตรวจสอบ (OSO)',r.officer],
    ['ความพร้อม Kiosk',rst.pct+'%   ('+rst.usable+' / '+r.total+' เครื่องพร้อมใช้งาน)'+(rst.needRecheck?'   ·   รอตรวจซ้ำ '+rst.needRecheck+' เครื่อง (เข้าไม่ได้ '+rst.occupied+' · รอตรวจบางรายการ '+rst.wait+')':'')],
    ['ความพร้อม Website',webPct+'%   ('+webReady+' / 2 แพลตฟอร์มพร้อมใช้งาน)']
  ];
  kv.push(['ตรวจครบทุกเครื่อง', TL.pendingNow>0?('ยังไม่ครบ — เหลือรอตรวจซ้ำ '+TL.pendingNow+' เครื่อง'):(TL.completeAt?(TL.completeAt+' น.'+(TL.crossedMidnight?' (วันถัดไป)':'')):'—')]);
  if(TL.pendingNow===0&&TL.totalMin!=null)kv.push(['ระยะเวลารวมจนตรวจครบ', fmtDur(TL.totalMin)+(TL.firstPassMin!=null?'   (รอบแรก '+fmtDur(TL.firstPassMin)+(TL.waitMin?' · รอ/ตรวจซ้ำ '+fmtDur(TL.waitMin):'')+')':'')]);
  else if(TL.firstPassMin!=null)kv.push(['ระยะเวลาตรวจรอบแรก', fmtDur(TL.firstPassMin)]);
  kv.push(['จัดทำเมื่อ',new Date().toLocaleString('th-TH')]);
  body+=dKvTable(kv,3200,6800);
  body+=dKpiCards([['Kiosks Total',String(r.total),'เครื่อง'],['พร้อมใช้งาน',String(rst.usable),'เครื่อง',rst.usable?'15803d':'6a7d9b'],['รอตรวจซ้ำ',String(rst.needRecheck),'เครื่อง',rst.needRecheck?'b9770e':'6a7d9b'],['Not Ready',String(notReady),'เครื่อง',notReady?'c0392b':'6a7d9b'],['Readiness (รวม)',rst.pct+'%','ใช้งานได้ / ทั้งหมด'],['Readiness (ตรวจได้)',(checkedPct==null?'—':checkedPct+'%'),'เฉพาะที่ตรวจ']]);
  body+=dKpiCards([
    ['Website (PC)',r.webPc?'✔':'✘',r.webPc?'System Ready':'Not Ready',r.webPc?'15803d':'c0392b'],
    ['Website (Mobile)',r.webMobile?'✔':'✘',r.webMobile?'System Ready':'Not Ready',r.webMobile?'15803d':'c0392b'],
    ['Web Readiness',webPct+'%',webReady+' / 2 พร้อม',webPct>=100?'15803d':webPct>=50?'b9770e':'c0392b']
  ]);
  if(TL.rechecks.length){
    body+=dHeading('ไทม์ไลน์การตรวจซ้ำ (เครื่องที่ไม่ว่างตอนตรวจรอบแรก)');
    const trows=TL.rechecks.map(x=>[x.id,x.at+' น.',x.waitMin!=null?('รอ '+x.waitMin+' นาที'):'—']);
    body+=dTable([['Kiosk','เวลาตรวจซ้ำ','ระยะเวลารอ (นับจากจบรอบแรก)']].concat(trows),[2000,3000,5000]);
  }
  body+=dHeading('Kiosk Checklist (IMM001–IMM020)');
  const krows=(r.kiosks||[]).map(k=>{const cls=kioskClass(k),wl=waitLabels(k).join(', ');
    const mark=t=>k.occupied?'—':(subStateOf(k,t)==='wait'?'⏳':(subStateOf(k,t)==='ok'?yes:no));
    const status=cls==='occupied'?'เครื่องไม่ว่าง (รอตรวจซ้ำ)'
      :cls==='ready'?'พร้อมใช้งาน (ตรวจครบ)'
      :cls==='usable_wait'?('พร้อมใช้งาน · รอตรวจ '+wl+(k.recheck_at?' (ตรวจซ้ำ '+k.recheck_at+' น.)':''))
      :('Not Ready'+(k.recheck_at?' · ตรวจซ้ำ '+k.recheck_at+' น.':''));
    return [k.kiosk_id,mark('system'),mark('rustdesk'),mark('network'),status,k.remark||''];});
  body+=dTable([['Kiosk','System','RustDesk','Network','สถานะ','Remark']].concat(krows),[1300,1300,1500,1300,1500,3100]);
  body+=dHeading('Website / Mobile Checklist');
  body+=dTable([['Platform','System Ready','Remark'],
    ['Website (PC)',r.webPc?yes:no,r.webPcRemark||''],
    ['Website (Mobile)',r.webMobile?yes:no,r.webMobileRemark||'']],[2700,2200,5100]);
  body+=dHeading('รายละเอียดการรับแจ้งปัญหา / ข้อเสนอแนะ');
  body+=dPar(r.issue||'— ไม่มี —',{fill:'F4F6F9'});
  // ---- ภาพประกอบ: ฝังรูปจาก Storage (ทั้งบล็อกอยู่ใน try/catch — ถ้าพลาดก็ออกรายงานได้โดยไม่มีรูป) ----
  let photoMedia=[],photoRelsXml='';
  try{
    const photos=collectReportPhotos(r);let gallery='',n=0,failed=0;
    for(const ph of photos){
      const img=await docxImageFor(ph.path);if(!img){failed++;continue;}
      n++;const fname='photo-'+n+'.jpg',rid='rIdPhoto'+n,pid=200+n;
      const wpx=Math.min(img.w||320,340),hpx=Math.round((img.h||240)*(wpx/(img.w||320)));
      gallery+=dPar(ph.label,{sz:18,bold:true,color:'0b2f6b',after:20})+dPhotoXml(rid,Math.round(wpx*9525),Math.round(Math.max(1,hpx)*9525),pid,fname);
      photoMedia.push({name:fname,bytes:img.bytes});
      photoRelsXml+='<Relationship Id="'+rid+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+fname+'"/>';
    }
    if(n)body+=dHeading('ภาพประกอบ (หมายเหตุ / ข้อเสนอแนะ)')+gallery;
    // เดิม: รูปหายเงียบ ๆ ไม่มีใครรู้ — ตอนนี้เตือนให้เห็นว่าแนบรูปไม่ครบ
    if(failed)toast('แนบรูปลงไฟล์รายงานไม่สำเร็จ '+failed+' รูป (รายงานส่งได้ แต่ไม่มีรูปครบ)',true);
  }catch(e){photoMedia=[];photoRelsXml='';toast('แนบรูปลงไฟล์รายงานไม่สำเร็จ (ส่งรายงานแบบไม่มีรูป)',true);}
  const hasLogo=!!(logos&&logos.tdac&&logos.somapa);
  const docXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="850" w:bottom="900" w:left="850"/></w:sectPr></w:body></w:document>';
  const ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const drels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+(hasLogo?D_LOGO_RELS:'')+photoRelsXml+'</Relationships>';
  const zip=new JSZip();
  zip.file('[Content_Types].xml',ct);
  zip.folder('_rels').file('.rels',rels);
  const wordF=zip.folder('word');wordF.file('document.xml',docXml);
  if(hasLogo||photoMedia.length)wordF.folder('_rels').file('document.xml.rels',drels);
  if(hasLogo)addLogoMedia(wordF,logos);
  if(photoMedia.length){const m=wordF.folder('media');photoMedia.forEach(p=>m.file(p.name,p.bytes));}
  return await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
// กราฟแท่ง: bars=[{label,value,color}]
function chartCanvas(bars,unit){
  const cv=document.createElement('canvas');cv.width=640;cv.height=340;const g=cv.getContext('2d');
  g.fillStyle='#ffffff';g.fillRect(0,0,cv.width,cv.height);
  const n=Math.max(1,bars.length),pad=46,baseY=250,h=196;
  const maxV=Math.max(1,...bars.map(b=>b.value));
  const slot=(cv.width-pad*2)/n,bw=Math.min(58,slot*0.62);
  g.strokeStyle='#e2e8f0';g.fillStyle='#94a3b8';g.font='11px Tahoma';g.textAlign='right';
  for(let i=0;i<=5;i++){const y=baseY-h*i/5;g.beginPath();g.moveTo(pad,y);g.lineTo(cv.width-pad,y);g.stroke();g.fillText(String(Math.round(maxV*i/5)),pad-6,y+4);}
  g.textAlign='center';
  bars.forEach((b,i)=>{const x=pad+slot*i+slot/2,bh=h*b.value/maxV;
    g.fillStyle=b.color||'#2563eb';g.fillRect(x-bw/2,baseY-bh,bw,bh);
    g.fillStyle='#0b2f6b';g.font='bold 12px Tahoma';g.fillText(String(b.value),x,baseY-bh-6);
    g.fillStyle='#334155';g.font='10px Tahoma';g.save();g.translate(x,baseY+10);g.rotate(-Math.PI/4);g.textAlign='right';g.fillText(b.label,0,0);g.restore();});
  return cv;
}
function chartPng(bars){const b64=chartCanvas(bars).toDataURL('image/png').split(',')[1];const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return arr;}
function dImage(){const cx=640*9525,cy=340*9525;return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="120"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="1" name="chart"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="chart.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';}

// คัดข้อมูลตามช่วงวันที่ (report_date อยู่ในช่วง [start,end))
function periodReports(start,end){return (data.reports||[]).filter(r=>{const d=parseDate(r.date);return d&&d>=start&&d<end;});}
function problemBars(reports){
  const hmap={};KIOSKS.forEach(id=>hmap[id]={id,notReady:0,checks:0});
  reports.forEach(r=>r.kiosks.forEach(k=>{const h=hmap[k.kiosk_id];if(!h)return;if(k.occupied)return;h.checks++;if(!(k.system_ready&&k.rustdesk_ready&&k.network_ready))h.notReady++;}));
  return Object.values(hmap).filter(h=>h.notReady>0).sort((a,b)=>b.notReady-a.notReady).slice(0,12).map(h=>({label:h.id,value:h.notReady,color:'#f43f5e'}));
}
async function buildReportDocxBlob(start,end,word,label){
  if(typeof JSZip==='undefined'){toast('โหลด JSZip ไม่สำเร็จ',true);return null;}
  const now=new Date();await ensureFresh();
  const reports=periodReports(start,end),s=summarize(reports);
  const bars=problemBars(reports);const hasChart=bars.length>0;
  const logos=await getLogoBytes();const hasLogo=!!(logos&&logos.tdac&&logos.somapa);
  toast('กำลังสร้าง DOCX...');
  let body=dLogoHeaderXml(logos);
  body+=dPar('รายงานการตรวจสอบระบบ TDAC (Website + Kiosk) '+word+' '+label,{sz:34,bold:true,color:'111827',align:'center',after:60});
  body+=dPar('Onsite Support Officer · ท่าอากาศยานสุวรรณภูมิ (BKK)',{sz:20,color:'374151',align:'center',after:200});
  body+=dTable([['รอบรายงาน',label],['วันที่จัดทำ',now.toLocaleString('th-TH')],['จัดทำโดย',user.displayName||user.email],['แหล่งข้อมูล','OSO-TDAC Operational Report (Supabase)']],[2600,6400],'F2F7FF');
  body+=dHeading('สรุปภาพรวม (Dashboard Summary)');
  body+=dKpiCards([['จำนวนรายงาน',String(s.total),'รอบ'],['Readiness เฉลี่ย',(s.avgReadiness||0)+'%','ทุกรอบ'],['Web PC พร้อม',(s.webPcPct||0)+'%','ของรอบ'],['Web Mobile พร้อม',(s.webMobilePct||0)+'%','ของรอบ']]);
  body+=dHeading('กราฟจำนวนครั้ง Not Ready รายเครื่อง');
  if(hasChart)body+=dImage();else body+=dPar('ไม่พบเครื่อง Kiosk ที่ Not Ready ในรอบรายงานนี้ (ทุกเครื่องพร้อมใช้งาน)',{color:'15803d'});
  body+=dHeading('เครื่อง Kiosk ที่ต้องติดตาม');
  const ph=(s.problem||[]).map((h,i)=>[String(i+1),h.id,String(h.notReady)+' / '+h.checks,(h.pct==null?'-':h.pct+'%'),topFail(h.fail)]);
  body+=ph.length?dTable([['ลำดับ','Kiosk ID','Not Ready','Readiness','ระบบที่ล้มบ่อย']].concat(ph),[900,2200,2000,1600,2300]):dPar('ไม่มีเครื่องที่พบปัญหาในรอบรายงานนี้',{color:'15803d'});
  body+=dHeading('จำนวนรายงานตามรอบ');
  const sr=Object.entries(s.shiftCounts||{}).sort((a,b)=>b[1]-a[1]).map((x,i)=>[String(i+1),x[0]||'-',String(x[1])]);
  body+=sr.length?dTable([['ลำดับ','รอบการตรวจสอบ','จำนวนรายงาน']].concat(sr),[900,6000,2100]):dPar('ไม่มีข้อมูล',{color:'6a7d9b'});
  body+=dHeading('จำนวนรายงานตามผู้ตรวจสอบ');
  const or=Object.entries(s.officerCounts||{}).sort((a,b)=>b[1]-a[1]).map((x,i)=>[String(i+1),x[0]||'-',String(x[1])]);
  body+=or.length?dTable([['ลำดับ','เจ้าหน้าที่ Onsite Support','จำนวนรายงาน']].concat(or),[900,6000,2100]):dPar('ไม่มีข้อมูล',{color:'6a7d9b'});
  body+=dHeading('ข้อเสนอแนะเชิงบริหาร');
  const worst=(s.problem||[])[0];
  const r1=s.total?'รักษาการตรวจสอบระบบ TDAC ให้ครบทุกกะ (IMP/D และ IMP/N) และบันทึกรายงานทุกครั้งเพื่อให้ติดตามแนวโน้มได้':'เริ่มบันทึกรายงานการตรวจสอบให้ครบถ้วนทุกกะก่อนใช้ประกอบการตัดสินใจ';
  const r2=worst?'เร่งตรวจสอบและประสานงานซ่อมบำรุงเครื่อง '+worst.id+' ซึ่งพบ Not Ready '+worst.notReady+' ครั้ง (ระบบที่ล้มบ่อย: '+topFail(worst.fail)+')':'ยังไม่พบเครื่อง Kiosk ที่มีปัญหาซ้ำ คงการตรวจสอบตามรอบปกติ';
  const r3=((s.webPcPct||0)<100||(s.webMobilePct||0)<100)?'ติดตามการแสดงผลของ Website TDAC ทั้ง PC ('+(s.webPcPct||0)+'%) และ Mobile ('+(s.webMobilePct||0)+'%) ที่ยังไม่พร้อมครบทุกรอบ':'Website (PC/Mobile) พร้อมใช้งานครบทุกรอบที่บันทึกไว้ ให้คงมาตรฐานนี้';
  body+=dPar('1. '+r1,{fill:'F4F6F9',after:40});
  body+=dPar('2. '+r2,{fill:'F4F6F9',after:40});
  body+=dPar('3. '+r3,{fill:'F4F6F9',after:40});
  body+=dHeading('รายละเอียดรายงานทั้งหมดในรอบ');
  const dr=reports.map((r,i)=>[String(i+1),dispDate(r.date),r.shift,r.officer,r.ready+'/'+r.total,r.pct+'%']);
  body+=dr.length?dTable([['ลำดับ','วันที่','รอบ','ผู้ตรวจสอบ','Kiosk พร้อม','Readiness']].concat(dr),[700,2000,1800,2300,1100,1100]):dPar('ไม่มีรายงานในรอบนี้',{color:'6a7d9b'});
  body+=dHeading('บันทึกปัญหา/ข้อเสนอแนะในรอบรายงาน');
  const issues=reports.filter(r=>r.issue);
  if(issues.length)issues.forEach(r=>{body+=dPar(dispDate(r.date)+' · '+r.shift+' · '+r.officer,{sz:18,bold:true,color:'0b2f6b',before:80,after:20});body+=dPar(r.issue,{fill:'F4F6F9'});});
  else body+=dPar('ไม่มีบันทึกปัญหาในรอบรายงานนี้',{color:'6a7d9b'});

  const docXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body></w:document>';
  const ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const drels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart1.png"/>'+(hasLogo?D_LOGO_RELS:'')+'</Relationships>';
  const zip=new JSZip();
  zip.file('[Content_Types].xml',ct);
  zip.folder('_rels').file('.rels',rels);
  const wordF=zip.folder('word');wordF.file('document.xml',docXml);wordF.folder('_rels').file('document.xml.rels',drels);
  wordF.folder('media').file('chart1.png',chartPng(hasChart?bars:[{label:'-',value:0,color:'#cbd5e1'}]));
  addLogoMedia(wordF,logos);
  return await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function makeReport(start,end,word,label,suffix){
  const blob=await buildReportDocxBlob(start,end,word,label);if(!blob)return;
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='OSO_TDAC_'+suffix+'.docx';a.click();toast('สร้างรายงาน DOCX แล้ว');
}
function blobToB64(blob){return new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(String(fr.result).split(',')[1]);fr.onerror=()=>res(null);fr.readAsDataURL(blob);});}

// ---------- HTML preview ----------
function reportStyles(){return '<style>.rpt{font-family:"TH Sarabun New","Sarabun",Tahoma,sans-serif;color:#1f2937;font-size:16px;line-height:1.5;background:#fff;padding:16px}.rpt h1{color:#1749c4;font-size:24px;text-align:center;margin:0 0 4px}.rpt .sub{text-align:center;color:#374151;margin:0 0 16px;font-size:15px}.rpt h2{color:#0b2f6b;font-size:18px;border-bottom:2px solid #e8f0fc;padding-bottom:4px;margin:18px 0 8px}.rpt table{border-collapse:collapse;width:100%;margin:6px 0;font-size:14px;table-layout:fixed}.rpt th,.rpt td{border:1px solid #d0d7e5;padding:5px 7px;text-align:left;vertical-align:top;word-break:break-word}.rpt thead th{background:#e8f0fc;color:#0b2f6b}.rpt .meta th{width:130px;background:#f2f7ff}.rpt .kpis{display:flex;gap:10px;margin:8px 0}.rpt .kpi{flex:1;border:1px solid #dce5f2;border-radius:8px;padding:10px;text-align:center;background:#f8fbff}.rpt .kpi .n{font-size:22px;font-weight:700;color:#0b2f6b}.rpt ul{margin:6px 0;padding-left:20px}.rpt img{max-width:100%;display:block;margin:0 auto}body{margin:0}@media print{.noprint{display:none}}</style>';}
function buildReportInner(start,end,word,label){
  const reports=periodReports(start,end),s=summarize(reports),bars=problemBars(reports);
  const tbl=(head,rows,cols)=>'<table><thead><tr>'+head.map((h,i)=>'<th'+(cols&&cols[i]?' style="width:'+cols[i]+'"':'')+'>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+(rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')||'<tr><td colspan="'+head.length+'" style="text-align:center;color:#888">ไม่มีข้อมูล</td></tr>')+'</tbody></table>';
  let h='<h1>รายงานการตรวจสอบระบบ TDAC (Website + Kiosk) '+esc(word)+' '+esc(label)+'</h1><p class="sub">Onsite Support Officer · ท่าอากาศยานสุวรรณภูมิ (BKK)</p>';
  h+='<table class="meta"><tbody><tr><th>รอบรายงาน</th><td>'+esc(label)+'</td></tr><tr><th>วันที่จัดทำ</th><td>'+esc(new Date().toLocaleString('th-TH'))+'</td></tr><tr><th>จัดทำโดย</th><td>'+esc(user.displayName||user.email)+'</td></tr></tbody></table>';
  h+='<h2>สรุปภาพรวม</h2><div class="kpis"><div class="kpi"><div class="n">'+s.total+'</div><div>จำนวนรายงาน</div></div><div class="kpi"><div class="n">'+(s.avgReadiness||0)+'%</div><div>Readiness เฉลี่ย</div></div><div class="kpi"><div class="n">'+(s.webPcPct||0)+'%</div><div>Web PC พร้อม</div></div><div class="kpi"><div class="n">'+(s.webMobilePct||0)+'%</div><div>Web Mobile พร้อม</div></div></div>';
  if(bars.length){const url=chartCanvas(bars).toDataURL('image/png');h+='<h2>จำนวนครั้ง Not Ready รายเครื่อง</h2><div style="text-align:center"><img src="'+url+'" style="max-width:660px;width:100%;border:1px solid #e2e8f0;border-radius:8px"></div>';}
  h+='<h2>เครื่อง Kiosk ที่ต้องติดตาม</h2>'+tbl(['ลำดับ','Kiosk ID','Not Ready','Readiness','ระบบที่ล้มบ่อย'],(s.problem||[]).map((x,i)=>[i+1,esc(x.id),x.notReady+' / '+x.checks,(x.pct==null?'-':x.pct+'%'),esc(topFail(x.fail))]),['8%','22%','22%','18%','30%']);
  h+='<h2>จำนวนรายงานตามรอบ</h2>'+tbl(['ลำดับ','รอบ','จำนวน'],Object.entries(s.shiftCounts||{}).sort((a,b)=>b[1]-a[1]).map((x,i)=>[i+1,esc(x[0]||'-'),x[1]]),['12%','60%','28%']);
  h+='<h2>จำนวนรายงานตามผู้ตรวจสอบ</h2>'+tbl(['ลำดับ','เจ้าหน้าที่','จำนวน'],Object.entries(s.officerCounts||{}).sort((a,b)=>b[1]-a[1]).map((x,i)=>[i+1,esc(x[0]||'-'),x[1]]),['12%','60%','28%']);
  h+='<h2>รายละเอียดรายงานทั้งหมด</h2>'+tbl(['ลำดับ','วันที่','รอบ','ผู้ตรวจสอบ','Kiosk พร้อม','Readiness'],reports.map((r,i)=>[i+1,esc(dispDate(r.date)),esc(r.shift),esc(r.officer),r.ready+'/'+r.total,r.pct+'%']),['7%','22%','18%','27%','13%','13%']);
  const issues=reports.filter(r=>r.issue);
  h+='<h2>บันทึกปัญหา/ข้อเสนอแนะ</h2>'+(issues.length?'<ul>'+issues.map(r=>'<li><b>'+esc(dispDate(r.date))+' · '+esc(r.shift)+' · '+esc(r.officer)+'</b><br>'+esc(r.issue)+'</li>').join('')+'</ul>':'<p style="color:#888">ไม่มีบันทึกปัญหาในรอบรายงานนี้</p>');
  return h;
}
async function previewReportPDF(start,end,word,label){
  await ensureFresh();
  const w=window.open('','_blank');if(!w)return toast('เบราว์เซอร์บล็อก popup',true);
  const html='<!DOCTYPE html><html lang="th"><head><meta charset="UTF-8"><title>ตัวอย่างรายงาน</title>'+reportStyles()+'</head><body><div class="rpt" style="max-width:820px;margin:0 auto">'+buildReportInner(start,end,word,label)+'<div class="noprint" style="text-align:center;margin:22px 0"><button onclick="window.print()" style="padding:10px 22px;font-size:15px;background:#2563eb;color:#fff;border:0;border-radius:8px;cursor:pointer">🖨 พิมพ์ / บันทึกเป็น PDF</button></div></div></body></html>';
  w.document.write(html);w.document.close();
}

// ---------- เลือกช่วงรายงาน ----------
function openReportModal(){
  const now=new Date(),p2=n=>String(n).padStart(2,'0');
  const today=now.getFullYear()+'-'+p2(now.getMonth()+1)+'-'+p2(now.getDate());
  $('rptMonth').value=now.getFullYear()+'-'+p2(now.getMonth()+1);$('rptFrom').value=today;$('rptTo').value=today;
  const yr=now.getFullYear();let yo='';for(let y=yr+1;y>=yr-6;y--)yo+='<option value="'+y+'"'+(y===yr?' selected':'')+'>'+(y+543)+' ('+y+')</option>';
  $('rptYear').innerHTML=yo;$('rptType').value='month';updateReportFields();$('reportModal').classList.add('open');
}
function closeReport(){$('reportModal').classList.remove('open');}
function updateReportFields(){const t=$('rptType').value;$('rpt_day').classList.toggle('hidden',t!=='day');$('rpt_month').classList.toggle('hidden',t!=='month');$('rpt_year').classList.toggle('hidden',t!=='year');}
function computePeriod(){
  const t=$('rptType').value;let start,end,word,label,suffix;
  if(t==='day'){
    const f=$('rptFrom').value,to=$('rptTo').value;if(!f||!to){toast('เลือกช่วงวันที่ก่อน',true);return null;}
    let sa=new Date(f+'T00:00:00'),eb=new Date(to+'T00:00:00');if(eb<sa){const x=sa;sa=eb;eb=x;}
    start=sa;end=new Date(eb.getTime()+86400000);
    if(sa.getTime()===eb.getTime()){word='ประจำวันที่';label=thaiDate(sa);}else{word='ระหว่างวันที่';label=thaiDate(sa)+' ถึง '+thaiDate(eb);}
    suffix='Daily_'+f+(f===to?'':('_to_'+to));
  }else if(t==='month'){
    const m=$('rptMonth').value;if(!m){toast('เลือกเดือนก่อน',true);return null;}
    const a=m.split('-').map(Number);start=new Date(a[0],a[1]-1,1);end=new Date(a[0],a[1],1);
    word='ประจำเดือน';label=THAI_MONTHS[a[1]-1]+' '+(a[0]+543);suffix='Monthly_'+m;
  }else{
    const y=Number($('rptYear').value);start=new Date(y,0,1);end=new Date(y+1,0,1);
    word='ประจำปี';label='พ.ศ. '+(y+543);suffix='Year_'+y;
  }
  return {start,end,word,label,suffix};
}
async function runReport(action){
  const p=computePeriod();if(!p)return;
  if(action==='preview')return previewReportPDF(p.start,p.end,p.word,p.label);
  if(action==='email')return emailReportPDF(p.start,p.end,p.word,p.label,p.suffix);
  closeReport();toast('กำลังสร้าง DOCX...');await makeReport(p.start,p.end,p.word,p.label,p.suffix);
}
async function callFn(name,body){
  try{const {data,error}=await sb.functions.invoke(name,{body});
    if(error){let msg=error.message||'error';try{if(error.context&&typeof error.context.json==='function'){const j=await error.context.json();if(j&&j.error)msg=j.error;}}catch(_){}return {error:msg};}
    if(data&&data.error)return {error:data.error};return {data:data||{}};
  }catch(ex){return {error:String((ex&&ex.message)||ex)};}
}
async function emailReport(to,start,end,word,label,suffix){
  await ensureFresh();
  const dblob=await buildReportDocxBlob(start,end,word,label);if(!dblob)return {ok:false,error:'สร้างไฟล์ DOCX ไม่สำเร็จ'};
  const docxB64=await blobToB64(dblob);if(!docxB64)return {ok:false,error:'แปลงไฟล์ DOCX ไม่สำเร็จ'};
  const reports=periodReports(start,end),s=summarize(reports),worst=(s.problem||[])[0],signer=user.displayName||user.email;
  const subject='รายงานการตรวจสอบระบบ TDAC '+word+' '+label;
  const msg='เรียน ผู้เกี่ยวข้อง\n\n'+
    'สรุปผลการตรวจสอบระบบ TDAC '+word+' '+label+'\n'+
    '• จำนวนรายงาน: '+s.total+' รอบ\n'+
    '• Readiness เฉลี่ย: '+(s.avgReadiness||0)+'%\n'+
    '• Website PC พร้อม: '+(s.webPcPct||0)+'% · Mobile พร้อม: '+(s.webMobilePct||0)+'%\n'+
    (worst?'• เครื่องที่ควรติดตาม: '+worst.id+' (Not Ready '+worst.notReady+' ครั้ง)\n':'• ไม่พบเครื่อง Kiosk ที่มีปัญหาซ้ำ\n')+
    '\nรายละเอียดทั้งหมดอยู่ในไฟล์ DOCX ที่แนบมาพร้อมอีเมลนี้\n\nขอแสดงความนับถือ\n'+signer;
  const r=await callFn('send-report',{to,subject,attachments:[{content:docxB64,name:'OSO_TDAC_'+suffix+'.docx'}],message:msg});
  if(r.error)return {ok:false,error:r.error};
  logAction('email','report',to+' / '+label+' (DOCX)');return {ok:true,sent:to};
}
async function emailReportPDF(start,end,word,label,suffix){
  const list=($('rptEmail').value||'').normalize('NFKC').replace(/[^\x21-\x7E]/g,'').toLowerCase().split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
  const reMail=/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  if(!list.length||!list.every(e=>reMail.test(e)))return toast('อีเมลผู้รับไม่ถูกต้อง: '+(list.join(', ')||'(ว่าง)'),true);
  const to=list.join(',');toast('กำลังสร้างรายงาน DOCX...');
  try{const r=await emailReport(to,start,end,word,label,suffix);if(!r.ok)return toast('ส่งไม่สำเร็จ: '+(r.error||''),true);toast('ส่งอีเมลแล้ว (DOCX) → '+to);closeReport();}
  catch(e){toast('สร้าง/ส่งรายงานไม่สำเร็จ: '+((e&&e.message)||e),true);}
}

/* ============================================================
   ส่งรายงานรายเดือนอัตโนมัติ (GitHub Actions) + ตั้งค่า
   ============================================================ */
async function sendAutoMonthly(recipientsCsv,force){
  try{
    if(!sb)return {ok:false,error:'ยังไม่ได้ตั้งค่า Supabase'};
    const cfg=await loadAutoReport();
    if(!force&&cfg.enabled!==true)return {ok:true,skipped:true,message:'ปิดการส่งอัตโนมัติอยู่'};
    const now=new Date();
    const start=new Date(now.getFullYear(),now.getMonth()-1,1),end=new Date(now.getFullYear(),now.getMonth(),1);
    const word='ประจำเดือน',label=THAI_MONTHS[start.getMonth()]+' '+(start.getFullYear()+543),suffix=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0');
    const src=((cfg.recipients||'').trim())||String(recipientsCsv||'');
    const list=src.normalize('NFKC').replace(/[^\x21-\x7E]/g,'').toLowerCase().split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
    const reMail=/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
    const valid=list.filter(e=>reMail.test(e));
    if(!valid.length)return {ok:false,error:'ไม่มีอีเมลผู้รับที่ถูกต้อง'};
    const r=await emailReport(valid.join(','),start,end,word,label,suffix);
    if(r&&r.ok&&!force){try{const thNow=new Date(Date.now()+7*3600*1000);const monthKey=thNow.getUTCFullYear()+'-'+String(thNow.getUTCMonth()+1).padStart(2,'0');await sb.from('app_settings').update({value:{enabled:cfg.enabled,day:cfg.day,hour:cfg.hour,lastSent:monthKey},updated_at:new Date().toISOString()}).eq('key','auto_report_sched');}catch(e){}}
    return Object.assign({period:label,recipients:valid},r);
  }catch(e){return {ok:false,error:String((e&&e.message)||e)};}
}
window.sendAutoMonthly=sendAutoMonthly;
async function loadAutoReport(){try{const {data}=await sb.from('app_settings').select('value').eq('key','auto_report').maybeSingle();return (data&&data.value)||{};}catch(e){return {};}}
async function renderAutoReport(){
  if(!user.isAdmin){toast('เฉพาะผู้ดูแลระบบ (admin)',true);view='dashboard';return render();}
  $('content').innerHTML=LOADING;
  const cfg=await loadAutoReport();const enabled=cfg.enabled===true,recipients=esc(cfg.recipients||'');
  const day=Number(cfg.day||1),hour=(cfg.hour!=null?Number(cfg.hour):8);
  const dayOpts=Array.from({length:31},(_,i)=>i+1).map(d=>'<option value="'+d+'"'+(d===day?' selected':'')+'>'+d+(d>=29?' (หรือวันสุดท้ายของเดือน)':'')+'</option>').join('');
  const hourOpts=Array.from({length:24},(_,i)=>i).map(hh=>'<option value="'+hh+'"'+(hh===hour?' selected':'')+'>'+String(hh).padStart(2,'0')+':00 น.</option>').join('');
  $('content').innerHTML=
    '<div class="panel"><div class="panel-title">ตั้งค่าส่งรายงานรายเดือนอัตโนมัติ</div>'+
    '<div class="mini" style="margin:6px 0 14px;line-height:1.7">ระบบจะส่งรายงาน <b>DOCX พร้อมกราฟ</b> ทางอีเมลอัตโนมัติตาม <b>วันและเวลา</b> ที่กำหนด (เวลาไทย) โดยใช้ข้อมูล <b>วันที่ 1 ถึงสิ้นเดือนของเดือนก่อนหน้า</b></div>'+
    '<label style="display:flex;align-items:center;gap:10px;background:#f2f7ff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;cursor:pointer;margin-bottom:14px"><input type="checkbox" id="arEnabled" '+(enabled?'checked':'')+' style="width:20px;height:20px;cursor:pointer"><span><b>เปิดการส่งอัตโนมัติ</b></span></label>'+
    '<div class="form-grid"><div class="field"><label class="label">ส่งทุกวันที่ (ของเดือน)</label><select class="input" id="arDay">'+dayOpts+'</select></div><div class="field"><label class="label">เวลาที่ส่ง (เวลาไทย)</label><select class="input" id="arHour">'+hourOpts+'</select></div></div>'+
    '<div class="field"><label class="label">อีเมลผู้รับรายงาน (หลายคนคั่นด้วย , )</label><textarea class="input" id="arRecipients" style="min-height:80px" placeholder="name@example.com, name2@example.com">'+recipients+'</textarea></div>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px"><button class="btn primary" onclick="saveAutoReport()">บันทึกการตั้งค่า</button><button class="btn" onclick="testAutoReport()">✉ ทดสอบส่งทันที (เดือนก่อนหน้า)</button></div>'+
    '<div class="mini" style="margin-top:14px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 13px;line-height:1.7">📌 ต้องตั้งค่า <b>GitHub Secrets</b> (บัญชีบอท) และ <b>Brevo</b> ก่อน ดู <code>AUTO-REPORT.md</code></div></div>';
}
async function saveAutoReport(){
  const enabled=$('arEnabled').checked,recipients=($('arRecipients').value||'').trim();
  const day=Number($('arDay').value)||1,hour=Number($('arHour').value)||0,ts=new Date().toISOString();
  let lastSent=null;try{const {data:pv}=await sb.from('app_settings').select('value').eq('key','auto_report_sched').maybeSingle();lastSent=(pv&&pv.value&&pv.value.lastSent)||null;}catch(e){}
  const r1=await sb.from('app_settings').upsert({key:'auto_report',value:{enabled,recipients,day,hour},updated_at:ts},{onConflict:'key'});
  const r2=await sb.from('app_settings').upsert({key:'auto_report_sched',value:{enabled,day,hour,lastSent},updated_at:ts},{onConflict:'key'});
  if(r1.error||r2.error)return toast('บันทึกไม่สำเร็จ: '+((r1.error||r2.error).message),true);
  logAction('update','auto_report',(enabled?'เปิด':'ปิด')+' · วันที่ '+day+' '+String(hour).padStart(2,'0')+':00 · '+recipients);toast('บันทึกการตั้งค่าแล้ว');
}
async function testAutoReport(){
  const recipients=($('arRecipients').value||'').trim();if(!recipients)return toast('กรุณากรอกอีเมลผู้รับก่อนทดสอบ',true);
  const now=new Date();const start=new Date(now.getFullYear(),now.getMonth()-1,1),end=new Date(now.getFullYear(),now.getMonth(),1);
  const label=THAI_MONTHS[start.getMonth()]+' '+(start.getFullYear()+543);
  if(!confirm('ส่งรายงานทดสอบ ('+label+') ไปยัง:\n'+recipients+' ?'))return;
  const suffix=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0');
  const list=recipients.normalize('NFKC').replace(/[^\x21-\x7E]/g,'').toLowerCase().split(/[,;]+/).map(s=>s.trim()).filter(Boolean);
  const reMail=/^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;const valid=list.filter(e=>reMail.test(e));
  if(!valid.length)return toast('อีเมลผู้รับไม่ถูกต้อง',true);
  toast('กำลังส่งรายงานทดสอบ...');
  const r=await emailReport(valid.join(','),start,end,'ประจำเดือน',label,suffix);
  if(!r.ok)return toast('ส่งไม่สำเร็จ: '+(r.error||''),true);toast('ส่งรายงานทดสอบแล้ว → '+valid.join(', '));
}
