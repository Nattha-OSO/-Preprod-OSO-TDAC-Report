const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={window:{addEventListener(){}},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/speed-dashboard.js','utf8'),c);
const k=(id,d,u)=>({kiosk_id:id,remark:`\n- [Wi-Fi AOT TDAC | Download ${d} Mbps | Upload ${u} Mbps]`});
const text=p=>[...p.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m=>m[1]).join('');
const parse=xml=>{
  const rows=[...xml.matchAll(/<w:tr>.*?<\/w:tr>/gs)].map(r=>[...r[0].matchAll(/<w:tc>.*?<\/w:tc>/gs)].map(t=>({txt:text(t[0]),center:t[0].includes('<w:jc w:val="center"/>'),bold:t[0].includes('<w:b/>')})));
  return rows;
};

// Scenario from the approved layout: Zone1 none, Zone2 48/58, Zone3 78/98, Zone4 98/65 -> overall 74.67 / 73.67, 3 kiosks
c.same=[{kiosks:[k('IMM007','48','58'),k('IMM011','78','98'),k('IMM017','98','65'),{kiosk_id:'IMM001',remark:null}]}];
let xml=vm.runInContext('speedSummaryDocx(same)',c);
const heads=[...xml.matchAll(/<w:p>.*?<\/w:p>/gs)].map(m=>text(m[0])).filter(Boolean);
assert.equal(heads[0],'Network speed test Wi-Fi: AOT TDAC','heading');
assert.ok(heads[1].startsWith('ค่าเฉลี่ยจากผลทดสอบที่กรอกจริง'),'description line kept');
assert.equal(heads[2],'จำนวนเครื่องที่ทดสอบ Download และ Upload 3 เครื่อง','combined count line when equal');
let rows=parse(xml);
assert.equal(rows.length,6,'header + 4 zones + total');
assert.deepEqual(rows[0].map(x=>x.txt),['โซน','Download เฉลี่ย (Mbps)','Upload เฉลี่ย (Mbps)','จำนวนเครื่องที่ทดสอบ Download/Upload'],'4 columns');
assert.ok(rows[0].every(x=>x.center),'header centered');
assert.deepEqual(rows[1].map(x=>x.txt).slice(1),['-','-','0 เครื่อง'],'empty zone shows hyphen');
assert.deepEqual(rows[2].map(x=>x.txt).slice(1),['48.00','58.00','1 เครื่อง']);
assert.deepEqual(rows[3].map(x=>x.txt).slice(1),['78.00','98.00','1 เครื่อง']);
assert.deepEqual(rows[4].map(x=>x.txt).slice(1),['98.00','65.00','1 เครื่อง']);
assert.ok(rows[1][0].txt.startsWith('Zone 1')&&rows[4][0].txt.startsWith('Zone 4'),'zones in order');
for(const r of rows.slice(1,5)){assert.ok(!r[0].center,'zone name left-aligned');assert.ok(r.slice(1).every(x=>x.center),'values centered');}
assert.deepEqual(rows[5].map(x=>x.txt),['รวมทุกโซน','74.67','73.67','3 เครื่อง'],'total row is last');
assert.ok(rows[5].every(x=>x.center&&x.bold),'total row centered and bold');
assert.ok(!xml.includes('—'),'no em dash');

// Download/Upload samples differ -> never hide the difference
c.diff=[{kiosks:[k('IMM007','100','—'),k('IMM011','200','—'),k('IMM017','300','40')]}];
xml=vm.runInContext('speedSummaryDocx(diff)',c);
const h2=[...xml.matchAll(/<w:p>.*?<\/w:p>/gs)].map(m=>text(m[0])).filter(Boolean);
assert.equal(h2[2],'จำนวนเครื่องที่ทดสอบ Download 3 เครื่อง • Upload 1 เครื่อง','separate counts when different');
rows=parse(xml);
assert.equal(rows[5][3].txt,'Download 3 / Upload 1 เครื่อง');
assert.equal(rows[3][3].txt,'Download 1 / Upload 0 เครื่อง'.replace('1 / Upload 0','1 / Upload 0'));

// no data at all
c.none=[{kiosks:[{kiosk_id:'IMM001',remark:null}]}];
xml=vm.runInContext('speedSummaryDocx(none)',c);
rows=parse(xml);assert.deepEqual(rows[5].map(x=>x.txt),['รวมทุกโซน','-','-','0 เครื่อง']);
console.log('PASS speed summary layout: count line, 4 columns, zones then bold total row, hyphen for empty');
