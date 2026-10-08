const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={window:{},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/speed-dashboard.js','utf8'),c);
c.getLogoBytes=async()=>null;
c.JSZip=class{constructor(){this.docs={}}file(n,x){if(n==='document.xml')c.__xml=x;return this}folder(){return this}async generateAsync(){return c.__xml}};
const zone=vm.runInContext('ZONES',c);
const kiosks=zone.flatMap(z=>Array.from(z.ids,id=>({kiosk_id:id,system_ready:true,rustdesk_ready:true,network_ready:true,recheck_items:[],
  remark:id==='IMM001'?'หมายเหตุปกติ':id==='IMM002'?'\n- [Wi-Fi AOT TDAC | Download 120.50 Mbps | Upload 40.00 Mbps]':null})));
vm.runInContext('buildSingleReportDocxBlob',c)({kiosks,total:20,date:'2026-10-07',shift:'IMP/D 10:00',officer:'ทดสอบ',webPc:true,webMobile:true}).then(xml=>{
  const cells=[...xml.matchAll(/<w:tc>.*?<\/w:tc>/gs)].map(m=>[...m[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x=>x[1]).join('|'));
  const remarkOf=id=>{const i=cells.findIndex(t=>t===id);return cells[i+5]};
  assert.equal(remarkOf('IMM003'),'-','no speed + no remark => single hyphen');
  assert.equal(remarkOf('IMM001'),'หมายเหตุปกติ','plain remark unchanged');
  assert.ok(remarkOf('IMM002').includes('- [Wi-Fi AOT TDAC | Download 120.50 Mbps | Upload 40.00 Mbps]'),'speed result still shown');
  assert.ok(!xml.includes('<w:t xml:space="preserve">—</w:t>')||!remarkOf('IMM003').includes('—'),'no em dash in kiosk remark');
  console.log('PASS report remark: single "-" when no speed data');
}).catch(e=>{console.error(e);process.exitCode=1});
