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
  const checkTimeFor = vm.runInContext('checkTimeFor', context);
  at(10, 5);  assert.equal(checkTimeFor(['ok', 'wait', 'wait']), '10:05');
  at(10, 47); assert.equal(checkTimeFor(['ok', 'ok', 'wait']), '10:47');
  at(11, 2);  assert.equal(checkTimeFor(['ok', 'ok', 'no']), '11:02');
  assert.equal(checkTimeFor(['wait', 'wait', 'wait']), '');
  const endTimeOrNow = vm.runInContext('endTimeOrNow', context);
  assert.equal(endTimeOrNow('11:30'), '11:30');
  assert.equal(endTimeOrNow(''), '11:02');
  assert.equal(endTimeOrNow('  '), '11:02');
  vm.runInContext('delete globalThis.Date', context);
  console.log('zone mapping, clicks, legacy preservation, DOCX report XML, wait breakdown and live check time and end-time fallback OK');
}).catch(e => { console.error(e); process.exitCode = 1; });
