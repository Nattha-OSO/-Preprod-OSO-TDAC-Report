const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:{addEventListener(){}},document:{addEventListener(){}},setTimeout,clearTimeout};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/app.js','utf8'),c);
let ranges=[];const rows=Array.from({length:3780},(_,i)=>({id:i+1,report_id:Math.floor(i/20)+1,kiosk_id:'IMM'+String(i%20+1).padStart(3,'0')}));
c.sb={from(){return {select(){return this},order(){return this},async range(a,b){ranges.push([a,b]);return {data:rows.slice(a,b+1),error:null}}}}};
vm.runInContext('sb = globalThis.sb',c);
(async()=>{const got=await vm.runInContext('loadAllKiosks()',c);assert.equal(got.length,3780);assert.equal(got.filter(k=>k.report_id===189).length,20);assert.equal(ranges.length,4);console.log('PASS: 189 reports / 3780 kiosks loaded without truncation');})().catch(e=>{console.error(e);process.exitCode=1});
