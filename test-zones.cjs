const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const copy = ['app.js','index.html','guide.html'].map(name => fs.readFileSync(__dirname + '/' + name, 'utf8')).join('\n');
const context = {window: {}, document: {addEventListener() {}}, setTimeout, clearTimeout};
vm.createContext(context);
vm.runInContext(source, context);
const result = vm.runInContext(`(() => ({html:kioskRowsHtml(),zones:ZONES.map(z=>({title:z.title,ids:z.ids})),split:immSplit,join:immJoin}))()`, context);
const expected = [
  ['ช่องตรวจตม.ฝั่งตะวันตก', 1, 6],
  ['fast track', 7, 10],
  ['ช่องตรวจตม.ฝั่งตะวันออก', 11, 16],
  ['พิธีการ', 17, 20],
];
assert.equal(result.zones.length, 4);
expected.forEach(([name, first, last], index) => {
  const zone = result.zones[index];
  assert.ok(zone.title.includes(`Zone ${index + 1}`) && zone.title.includes(name));
  assert.deepEqual(Array.from(zone.ids), Array.from({length:last-first+1}, (_, i) => 'IMM' + String(first+i).padStart(3, '0')));
  assert.equal((result.html.match(new RegExp(`data-zone="${index}"`, 'g')) || []).length, 1);
});
assert.equal((result.html.match(/class="btn-imm"/g) || []).length, 4);
assert.equal((result.html.match(/class="imm-val"/g) || []).length, 20);
for (const state of ['yes','no']) assert.equal(result.split(result.join(state, 'บันทึก')).imm, state);
// Simulate a restored legacy report whose machines in one zone have different values.
const values = Object.fromEntries(result.zones.flatMap(z => Array.from(z.ids, id => [id, {value: ''}])));
const buttons = result.zones.map((_, i) => ({dataset: {zone: String(i), state: ''}, closest: () => body}));
const body = {id: 'editKioskBody', querySelector(selector) {
  const id = /data-kiosk="([^"]+)"/.exec(selector)?.[1];
  const zone = /data-zone="(\d+)"/.exec(selector)?.[1];
  return id ? values[id] : buttons[Number(zone)];
}};
values.IMM001.value = 'yes'; values.IMM002.value = 'no';
vm.runInContext('syncZoneImm', context)(body, 0);
assert.equal(buttons[0].dataset.state, 'mixed');
assert.equal(values.IMM002.value, 'no'); // reading an old report must not silently change it
vm.runInContext('cycleImm', context)(buttons[0]);
assert.ok(Array.from(result.zones[0].ids).every(id => values[id].value === 'yes'));
assert.ok(Array.from(result.zones[1].ids).every(id => values[id].value === ''));
vm.runInContext('cycleImm', context)(buttons[0]);
assert.ok(Array.from(result.zones[0].ids).every(id => values[id].value === 'no'));
const summary = vm.runInContext('zoneImmSummary', context);
const zoneRows = values => Array.from(result.zones[0].ids, (id, i) => ({kiosk_id:id,remark:values[i]}));
assert.equal(summary(zoneRows(Array(6).fill('มีเจ้าหน้าที่ ตม. ประจำจุด')), result.zones[0]), 'yes');
assert.equal(summary(zoneRows(['มีเจ้าหน้าที่ ตม. ประจำจุด','ไม่มีเจ้าหน้าที่ ตม. ประจำจุด',...Array(4).fill('มีเจ้าหน้าที่ ตม. ประจำจุด')]), result.zones[0]), 'mixed');
assert.equal(summary(zoneRows(Array(6).fill(null)), result.zones[0]), '');
// Exercise the real single-report renderer and inspect its DOCX document XML.
let documentXml = '';
context.JSZip = class {
  file(name, content) { if (name === 'document.xml') documentXml = content; return this; }
  folder() { return this; }
  async generateAsync() { return documentXml; }
};
context.getLogoBytes = async () => null;
const kiosks = result.zones.flatMap((zone, zi) => Array.from(zone.ids, (id, i) => ({
  kiosk_id:id, system_ready:true, rustdesk_ready:true, network_ready:true,
  remark: zi === 0 ? 'มีเจ้าหน้าที่ ตม. ประจำจุด' : zi === 1 ? 'ไม่มีเจ้าหน้าที่ ตม. ประจำจุด' : zi === 2 && i === 0 ? 'มีเจ้าหน้าที่ ตม. ประจำจุด' : null
})));
vm.runInContext('buildSingleReportDocxBlob', context)({kiosks, total:20, date:'2026-09-29', shift:'IMP/D 10:00', officer:'Test', webPc:true, webMobile:true}).then(xml => {
  for (const zone of result.zones) assert.ok(xml.includes(zone.title), zone.title);
  assert.ok(xml.includes('เจ้าหน้าที่ ตม. ประจำจุด: มี'));
  assert.ok(xml.includes('เจ้าหน้าที่ ตม. ประจำจุด: ไม่มี'));
  assert.ok(xml.includes('ข้อมูลเดิมต่างกัน'));
  assert.ok(xml.includes('IMM011 (ตม. มี)'));
  assert.ok(xml.includes('IMM012 (ตม. ไม่ระบุ)'));
  assert.ok((xml.match(/Remark \(หมายเหตุ \+ ภาพถ่าย\)/g) || []).length >= 4);
  const waitBreakdownText = vm.runInContext('waitBreakdownText', context);
assert.ok(!copy.includes('ยังตรวจไม่ได้'));
assert.ok(copy.includes('ยังไม่ได้ตรวจ'));
  assert.equal(waitBreakdownText([{l:'System',wait:0},{l:'RustDesk',wait:2},{l:'Network',wait:0}]), 'RustDesk 2');
  assert.equal(waitBreakdownText([{l:'System',wait:0},{l:'RustDesk',wait:0}]), 'ตรวจครบทุกรายการ');
  // เวลาตรวจต้องเป็นเวลาปัจจุบันทุกครั้งที่กด และล้างเมื่อกลับเป็น ⏳ ครบ
  const RealDate = vm.runInContext('Date', context);
  const at = (h, m) => { context.Date = class extends RealDate { constructor() { super(2026, 8, 30, h, m); } }; };
  at(11, 2);
  const endTimeOrNow = vm.runInContext('endTimeOrNow', context);
  assert.equal(endTimeOrNow('11:30'), '11:30');
  assert.equal(endTimeOrNow(''), '11:02');
  assert.equal(endTimeOrNow('  '), '11:02');
  context.__RealDate = RealDate;
  vm.runInContext('globalThis.Date = __RealDate', context);
}).then(() => {
  // ---- ผู้โดยสารใช้งานอยู่ ----
  const P = 'ผู้โดยสารใช้งานอยู่', Y = 'มีเจ้าหน้าที่ ตม. ประจำจุด';
  const immSplit = vm.runInContext('immSplit', context), immJoin = vm.runInContext('immJoin', context);
  for (const [imm, pax, text] of [['', true, 'x'], ['yes', true, 'x'], ['no', false, 'x'], ['yes', true, ''], ['', false, 'ข้อความ\nสองบรรทัด']]) {
    const s = immSplit(immJoin(imm, text, pax));
    assert.deepEqual([s.imm, s.pax, s.text], [imm, pax, text], JSON.stringify([imm, pax, text]));
  }
  assert.equal(immJoin('yes', 'x', true), Y + '\n' + P + '\nx');
  assert.equal(immSplit(P).pax, true);
  assert.equal(immSplit(P).text, '');
  assert.equal(immSplit('หมายเหตุปกติ\n' + P).pax, false);   // marker กลางข้อความไม่นับ
  assert.equal(immSplit('หมายเหตุปกติ\n' + P).text, 'หมายเหตุปกติ\n' + P);
  // นับ pax เฉพาะเครื่องที่ยังมี ⏳ ค้าง
  const paxKiosks = vm.runInContext('paxKiosks', context);
  const waitK = { kiosk_id:'IMM007', system_ready:true, rustdesk_ready:false, network_ready:true, recheck_items:['rustdesk'], remark:P };
  const doneK = { kiosk_id:'IMM008', system_ready:true, rustdesk_ready:true, network_ready:true, recheck_items:[], remark:P };
  assert.deepEqual(Array.from(paxKiosks([waitK, doneK]), k => k.kiosk_id), ['IMM007']);
  const wbt = vm.runInContext('waitBreakdownText', context);
  assert.equal(wbt([{l:'RustDesk', wait:1}], 1), 'RustDesk 1\n🧍 ' + P + ' 1 เครื่อง');
  assert.equal(wbt([{l:'RustDesk', wait:1}], 0), 'RustDesk 1');
  // รายงาน DOCX: เหตุผลในสถานะ + แถวสรุปที่หัวรายงาน + เครื่องอื่นไม่โดนป้าย
  const withTimes = kiosks.map(k => ({ ...k, recheck_at: '10:47' }));   // ข้อมูลรายงานเก่าที่เคยมีเวลารายเครื่อง
  const kiosks2 = kiosks.map(k => k.kiosk_id === 'IMM007' ? { ...k, rustdesk_ready:false, recheck_items:['rustdesk'], remark:P + '\nผู้โดยสารกำลังทำรายการ' } : k);
  return vm.runInContext('buildSingleReportDocxBlob', context)({kiosks: kiosks2, total:20, date:'2026-09-29', shift:'IMP/D 10:00', officer:'Test', webPc:true, webMobile:true});
}).then(xml => {
  assert.ok(xml.includes('เครื่องที่ผู้โดยสารใช้งานอยู่'), 'summary row');
  // หัวข้อรายละเอียด Kiosk ต้องขึ้นหน้าใหม่ (และมีเพียงจุดเดียวในเอกสาร)
  const H = 'รายละเอียดการตรวจความพร้อมของ KIOSK TDAC';
  const at = xml.indexOf(H), pStart = xml.lastIndexOf('<w:p>', at);
  assert.ok(at > 0 && xml.slice(pStart, at).includes('<w:pageBreakBefore/>'), 'heading starts a new page');
  assert.equal(xml.split('<w:pageBreakBefore/>').length - 1, 1, 'only one forced page break');
  assert.ok(xml.includes('1 เครื่อง (IMM007)'));
  assert.ok(xml.includes('ยังไม่ได้ตรวจ RustDesk — ผู้โดยสารใช้งานอยู่'), 'status text');
  assert.equal(xml.split('— ผู้โดยสารใช้งานอยู่').length - 1, 1, 'label only on IMM007');
  assert.ok(xml.includes('ผู้โดยสารกำลังทำรายการ'), 'inspector text kept in Remark');
  // ---- เวอร์ชันระบบ 2026.10.00 แสดงครบทุกจุด ----
  assert.equal(vm.runInContext('APP_RELEASE', context), '2026.10.00');
  assert.ok(/^\d{4}\.\d{2}\.\d{2}$/.test(vm.runInContext('APP_RELEASE', context)), 'release format YYYY.MM.NN');
  assert.ok(!xml.includes('เวอร์ชันระบบ') && !xml.includes('2026.10.00'), 'no version row in DOCX report');
  const pageHtml = fs.readFileSync(__dirname + '/index.html', 'utf8');
  assert.equal((pageHtml.match(/data-release/g) || []).length, 2, 'public + login labels');
  assert.ok(fs.readFileSync(__dirname + '/guide.html', 'utf8').includes('เวอร์ชัน 2026.10.00'), 'guide footer');
  // ---- ตารางในรายงาน: แถวไม่ถูกตัดข้ามหน้า + ตารางโซนย้ายไปเริ่มหน้าใหม่ได้ทั้งก้อนเมื่อใส่ไม่พอ ----
  if (process.env.DUMP_XML) fs.writeFileSync(process.env.DUMP_XML, xml);
  const tables = xml.split('<w:tbl>').slice(1).map(x => x.split('</w:tbl>')[0]);
  const zoneTables = tables.filter(x => x.includes('Remark (หมายเหตุ'));
  assert.ok(zoneTables.length >= 4, 'zone tables present');
  for (const tb of tables) {
    const rows = tb.split('<w:tr>').slice(1);
    assert.ok(rows.every(r => r.startsWith('<w:trPr>') && r.includes('<w:cantSplit/>')), 'every row is cantSplit');
  }
  for (const tb of zoneTables.slice(0, 4)) {
    const rows = tb.split('<w:tr>').slice(1);
    rows.slice(0, -1).forEach((r, i) => assert.ok(!r.includes('<w:p>') || (r.match(/<w:p>/g) || []).length === (r.match(/<w:p><w:pPr><w:keepNext\/>/g) || []).length, 'row ' + i + ' keeps with next'));
    assert.ok(!rows[rows.length - 1].includes('<w:keepNext/>'), 'last row must not chain to following content');
  }
  // หัวข้อโซน + บรรทัดสถานะ ตม. ต้องไปกับตาราง
  for (const zt of ['Zone 1 ·', 'Zone 4 ·']) {
    const i = xml.indexOf(zt), ps = xml.lastIndexOf('<w:p>', i);
    assert.ok(xml.slice(ps, i).includes('<w:keepNext/>'), zt + ' heading keeps with table');
  }
  // ---- ไม่แสดงเวลาตรวจรายเครื่อง ----
  const withTimes = kiosks.map(k => ({ ...k, recheck_at: '10:47' }));   // ข้อมูลรายงานเก่าที่เคยมีเวลารายเครื่อง
  const times = vm.runInContext('buildSingleReportDocxBlob', context)({kiosks: withTimes, inspectStart:'10:00', inspectEnd:'11:30', total:20, date:'2026-09-29', shift:'IMP/D 10:00', officer:'Test', webPc:true, webMobile:true});
  return times.then(x3 => {
    assert.ok(!x3.includes('ตรวจเมื่อ') && !x3.includes('ตรวจซ้ำ') && !x3.includes('10:47'), 'no per-kiosk time / recheck table in report');
    assert.ok(x3.includes('1 ชม. 30 นาที'), 'overall duration from start/end still shown');
    // ปุ่มกด ✓/✘ ต้องไม่ลงเวลาให้เครื่องอีก
    const el0 = (state) => ({ dataset:{ state }, classList:{ toggle(){}, remove(){}, add(){} }, textContent:'', value:'' });
    const els0 = {}, ID = 'IMM003';
    ['system','rustdesk','network'].forEach(tp => els0['.subchk[data-kiosk="' + ID + '"][data-type="' + tp + '"]'] = el0('wait'));
    els0['.recheck-val[data-kiosk="' + ID + '"]'] = el0(''); els0['.btn-all[data-kiosk="' + ID + '"]'] = el0(''); els0['tr[data-row="' + ID + '"]'] = el0('');
    const body0 = { id:'x', querySelector: s => els0[s] || null };
    const sysBtn = els0['.subchk[data-kiosk="' + ID + '"][data-type="system"]']; sysBtn.dataset.kiosk = ID; sysBtn.closest = () => body0;
    vm.runInContext('cycleSub', context)(sysBtn);
    assert.equal(sysBtn.dataset.state, 'ok');
    assert.equal(els0['.recheck-val[data-kiosk="' + ID + '"]'].value, '', 'no time stamped on click');
    return xml;
  });
}).then(xml => {
  // ---- ปุ่มในฟอร์ม: กดได้เฉพาะเครื่องที่ยังมี ⏳ และล้างเองเมื่อตรวจครบ ----
  const el = (state) => ({ dataset:{ state }, classList:{ toggle(){}, remove(){}, add(){} }, textContent:'' });
  const id = 'IMM007', els = {};
  ['system','rustdesk','network'].forEach(t => els['.subchk[data-kiosk="' + id + '"][data-type="' + t + '"]'] = el('ok'));
  els['.subchk[data-kiosk="' + id + '"][data-type="rustdesk"]'].dataset.state = 'wait';
  els['.btn-all[data-kiosk="' + id + '"]'] = el(''); els['tr[data-row="' + id + '"]'] = el(''); els['.btn-pax[data-kiosk="' + id + '"]'] = el('');
  const body = { id:'x', querySelector: s => els[s] || null };
  const paxBtn = els['.btn-pax[data-kiosk="' + id + '"]']; paxBtn.dataset.kiosk = id; paxBtn.closest = () => body;
  context.document.getElementById = () => el('');
  const togglePax = vm.runInContext('togglePax', context), syncRowBtn = vm.runInContext('syncRowBtn', context);
  togglePax(paxBtn);  assert.equal(paxBtn.dataset.state, 'on');
  togglePax(paxBtn);  assert.equal(paxBtn.dataset.state, '');
  togglePax(paxBtn);  assert.equal(paxBtn.dataset.state, 'on');
  els['.subchk[data-kiosk="' + id + '"][data-type="rustdesk"]'].dataset.state = 'ok';  // ตรวจครบแล้ว
  syncRowBtn(body, id); assert.equal(paxBtn.dataset.state, '', 'auto-clear when fully checked');
  togglePax(paxBtn);  assert.equal(paxBtn.dataset.state, '', 'cannot turn on when nothing is pending');
  console.log('zone mapping, clicks, legacy preservation, DOCX report XML, wait breakdown, end-time fallback, passenger-in-use, table pagination and no per-kiosk time OK');
}).catch(e => { console.error(e); process.exitCode = 1; });
