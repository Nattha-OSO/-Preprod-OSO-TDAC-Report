const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:{addEventListener(){}},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
const html=vm.runInContext('kioskRowsHtml()',c);
assert.equal((html.match(/data-speed="download"/g)||[]).length,20);
assert.equal((html.match(/data-speed="upload"/g)||[]).length,20);
const join=vm.runInContext('speedJoin',c),split=vm.runInContext('speedSplit',c);
const r=split(join('ข้อความเดิม','IMM001', '123.45','67.89'));assert.deepEqual([r.text,r.profile,r.download,r.upload],['ข้อความเดิม','SIM Card / APK 1.0.7','123.45','67.89']);
assert.ok(join('ข้อความเดิม','IMM001','123.45','67.89').includes('\n- [Network speed test | SIM Card / APK 1.0.7'));
assert.ok(html.includes('Network speed test: SIM Card / APK 1.0.7'));
// ทุกเครื่องเป็น APK 1.0.7 และไม่มี 1.0.6 เหลือในไฟล์ที่ใช้งานจริง
const prof=vm.runInContext('speedProfile',c);
for(let i=1;i<=20;i++)assert.ok(/APK 1\.0\.7$/.test(prof('IMM'+String(i).padStart(3,'0'))),'IMM'+i);
assert.ok(!/APK 1\.0\.6/.test(fs.readFileSync(__dirname+'/app.js','utf8')+fs.readFileSync(__dirname+'/guide.html','utf8')));
// รายงานเก่าที่บันทึก APK 1.0.6 ไว้ ต้องคงค่าเดิมเมื่อเปิดแก้แล้วบันทึกซ้ำ (และ DOCX) — ไม่ถูกทับด้วยค่าปัจจุบัน
const old=split('x\n- [Network speed test | SIM Card / APK 1.0.6 | Download 10 Mbps | Upload 20 Mbps]');
assert.equal(old.profile,'SIM Card / APK 1.0.6');
assert.ok(join(old.text,'IMM001',old.download,old.upload,old.profile).includes('SIM Card / APK 1.0.6'),'old profile kept');
assert.ok(join('x','IMM001','1','2','').includes('APK 1.0.7'),'new entry uses current profile');
assert.ok(html.includes('Network speed test: Wi-Fi AOT TDAC / APK 1.0.7'));
assert.equal(join('ข้อความเดิม','IMM001','',''),'ข้อความเดิม');
const legacy=split('ข้อความเดิม\n- [Wi-Fi AOT TDAC | Download 10 Mbps | Upload 20 Mbps]');assert.deepEqual([legacy.profile,legacy.download,legacy.upload],['Wi-Fi AOT TDAC','10','20']);
console.log('PASS per-kiosk speed fields, profile remarks and legacy remarks');
