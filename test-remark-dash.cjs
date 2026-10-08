const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={window:{addEventListener(){}},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);
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
  const dashParas=[...xml.matchAll(/<w:p>(?:(?!<\/w:p>).)*?<w:t xml:space="preserve">-<\/w:t>(?:(?!<\/w:p>).)*?<\/w:p>/gs)].map(m=>m[0]);
  assert.ok(dashParas.length>=17,'placeholder dash present for empty remarks: '+dashParas.length);
  assert.ok(dashParas.every(x=>x.includes('<w:jc w:val="center"/>')),'placeholder "-" is centered');
  c.sampleRows=[{kiosks:[{kiosk_id:'IMM001',remark:'\n- [Wi-Fi AOT TDAC | Download 100 Mbps | Upload 20 Mbps]'}]}];
  const speedXml=vm.runInContext('speedSummaryDocx(sampleRows)',c);
  const tbl=speedXml.slice(speedXml.indexOf('<w:tbl>'),speedXml.indexOf('</w:tbl>'));
  const speedRows=[...tbl.matchAll(/<w:tr>.*?<\/w:tr>/gs)].map(r=>[...r[0].matchAll(/<w:tc>.*?<\/w:tc>/gs)].map(t=>t[0]));
  assert.equal(speedRows.length,6,'header + 4 zones + total');
  assert.ok(speedRows[0].every(x=>x.includes('<w:jc w:val="center"/>')),'speed header centered');
  for(const r of speedRows.slice(1,5)){assert.ok(!r[0].includes('<w:jc w:val="center"/>'),'zone name left-aligned');assert.ok(r.slice(1).every(x=>x.includes('<w:jc w:val="center"/>')),'speed values centered');}
  assert.ok(speedRows[5].every(x=>x.includes('<w:jc w:val="center"/>')),'total row centered');
  const webAt=xml.indexOf('Website / Mobile Checklist');
  const webTbl=xml.slice(xml.indexOf('<w:tbl>',webAt),xml.indexOf('</w:tbl>',webAt));
  const webRemark=[...webTbl.matchAll(/<w:tr>.*?<\/w:tr>/gs)].slice(1).map(r=>[...r[0].matchAll(/<w:tc>.*?<\/w:tc>/gs)].pop()[0]);
  assert.equal(webRemark.length,2,'PC and Mobile rows');
  for(const cell of webRemark){
    assert.ok(cell.includes('<w:t xml:space="preserve">-</w:t>'),'web remark uses single hyphen');
    assert.ok(!cell.includes('—'),'no em dash in web remark');
    assert.ok(cell.includes('<w:jc w:val="center"/>'),'web remark hyphen centered');
  }
  console.log('PASS report remark: single "-" when no speed data, centered (Kiosk + Website tables); speed table fully centered');
}).catch(e=>{console.error(e);process.exitCode=1});
