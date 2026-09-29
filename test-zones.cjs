const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
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
console.log('zone mapping, clicks, legacy preservation and remark round-trip OK');
