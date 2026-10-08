const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={window:{},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/speed-dashboard.js','utf8'),c);
const k=(id,d,u)=>({kiosk_id:id,remark:`\n- [Wi-Fi AOT TDAC | Download ${d} Mbps | Upload ${u} Mbps]`});
c.rows=[{kiosks:[k('IMM001','100','20'),k('IMM002','0','—'),k('IMM007','200','—'),{kiosk_id:'IMM020',remark:null}]}];
const xml=vm.runInContext('speedSummaryDocx(rows)',c);
// Download tested on 3 kiosks, Upload on 1: the report must show both numbers, never merge them.
assert.ok(xml.includes('จำนวนเครื่องที่ทดสอบ Download 3 เครื่อง • Upload 1 เครื่อง'),'summary line shows both counts');
assert.ok(xml.includes('Download 3 / Upload 1 เครื่อง'),'total row shows both counts');
assert.ok(xml.includes('จำนวนเครื่องที่ทดสอบ Download/Upload'),'single count column header');
assert.ok(!xml.includes('จำนวน Download</w:t>'));
console.log('PASS speed report states tested kiosk counts for Download and Upload');
