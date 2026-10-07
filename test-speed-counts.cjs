const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={window:{},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/speed-dashboard.js','utf8'),c);
const k=(id,d,u)=>({kiosk_id:id,remark:`\n- [Wi-Fi AOT TDAC | Download ${d} Mbps | Upload ${u} Mbps]`});
c.rows=[{kiosks:[k('IMM001','100','20'),k('IMM002','0','—'),k('IMM007','200','—'),{kiosk_id:'IMM020',remark:null}]}];
const xml=vm.runInContext('speedSummaryDocx(rows)',c);
for(const t of ['จำนวนเครื่องที่ทดสอบ Download 3 เครื่อง','จำนวนเครื่องที่ทดสอบ Upload 1 เครื่อง','จำนวนเครื่องที่ทดสอบ Download</w:t>','จำนวนเครื่องที่ทดสอบ Upload</w:t>','3 เครื่อง','1 เครื่อง'])assert.ok(xml.includes(t),t);
assert.ok(!xml.includes('จำนวน Download</w:t>'));
console.log('PASS speed report states tested kiosk counts for Download and Upload');
