// Speed reporting: each saved kiosk measurement is one sample; Download/Upload have separate denominators.
let speedFrom='',speedTo='';
function speedStats(reports){
  const samples=[];
  (reports||[]).forEach(r=>(r.kiosks||[]).forEach(k=>{
    const v=speedSplit(immSplit(k.remark).text),zone=ZONES.findIndex(z=>z.ids.includes(k.kiosk_id));
    const n=x=>x!==''&&Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
    const download=n(v.download),upload=n(v.upload);
    if(download!==null||upload!==null)samples.push({date:r.date||'',shift:r.shift||'',id:k.kiosk_id,zone,download,upload});
  }));
  const calc=arr=>{const mean=t=>{const v=arr.map(x=>x[t]).filter(x=>x!==null);return {count:v.length,avg:v.length?v.reduce((a,b)=>a+b,0)/v.length:null};};return {download:mean('download'),upload:mean('upload'),count:arr.length};};
  return {samples,all:calc(samples),zones:ZONES.map((z,i)=>Object.assign({title:z.title},calc(samples.filter(x=>x.zone===i))))};
}
function speedFmt(v){return v===null?'—':v.toFixed(2);}
function speedSummaryDocx(reports){
  const s=speedStats(reports),items=[Object.assign({title:'รวมทุกโซน'},s.all),...s.zones];
  let body=dHeading('Network speed test Wi-Fi: AOT TDAC',{keepNext:true});
  body+=dPar('ค่าเฉลี่ยจากผลทดสอบที่กรอกจริง หน่วย Mbps • ช่องว่างไม่นับเป็น 0 • Download/Upload นับจำนวนตัวอย่างแยกกัน',{sz:18});
  items.forEach(x=>{body+=dPar(x.title,{bold:true,keepNext:true});body+=dKpiCards([['Download เฉลี่ย',speedFmt(x.download.avg),'Mbps · '+x.download.count+' ตัวอย่าง'],['Upload เฉลี่ย',speedFmt(x.upload.avg),'Mbps · '+x.upload.count+' ตัวอย่าง']]);});
  body+=dTable([['โซน','Download เฉลี่ย (Mbps)','จำนวน Download','Upload เฉลี่ย (Mbps)','จำนวน Upload'],...items.map(x=>[x.title,speedFmt(x.download.avg),String(x.download.count),speedFmt(x.upload.avg),String(x.upload.count)])],[2800,2200,1400,2200,1400],null,{keepTogether:true});
  return body;
}
function selectedSpeedReports(){return (data.reports||[]).filter(r=>(!speedFrom||r.date>=speedFrom)&&(!speedTo||r.date<=speedTo));}
function speedCardHtml(x){return '<div class="sumchip"><b>'+esc(x.title)+'</b><div style="font-size:18px;margin-top:8px">↓ '+speedFmt(x.download.avg)+' / ↑ '+speedFmt(x.upload.avg)+'</div><div class="mini">Mbps · Download '+x.download.count+' / Upload '+x.upload.count+' ตัวอย่าง</div></div>';}
function applySpeedFilter(){speedFrom=$('speedFrom').value;speedTo=$('speedTo').value;if(speedFrom&&speedTo&&speedFrom>speedTo)return toast('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด',true);renderSpeedDashboard();}
function renderSpeedDashboard(){
  if(!user||!user.isAdmin)return toast('เฉพาะ Admin เท่านั้น',true);
  const s=speedStats(selectedSpeedReports());
  $('content').innerHTML='<div class="panel" style="padding:16px"><h2>Network speed test Wi-Fi: AOT TDAC</h2><div class="form-grid"><label>ตั้งแต่<input class="input" type="date" id="speedFrom" value="'+esc(speedFrom)+'"></label><label>ถึง<input class="input" type="date" id="speedTo" value="'+esc(speedTo)+'"></label></div><button class="btn" onclick="applySpeedFilter()">กรองช่วงวันที่</button> <button class="btn primary" onclick="exportSpeedDocx()">สรุปรายงาน DOCX</button><p class="mini">ค่าเฉลี่ยถ่วงตามจำนวนผลทดสอบที่กรอกจริง ไม่ใช่ค่าเฉลี่ยของค่าเฉลี่ยโซน • ช่องว่างไม่นับเป็น 0 • หน่วย Mbps</p><div class="sumbar">'+[Object.assign({title:'รวมทุกโซน'},s.all),...s.zones].map(speedCardHtml).join('')+'</div><div class="table-wrap"><table><thead><tr><th>วันที่ / รอบ</th><th>Kiosk</th><th>โซน</th><th>Download (Mbps)</th><th>Upload (Mbps)</th></tr></thead><tbody>'+s.samples.map(x=>'<tr><td>'+esc(x.date)+' / '+esc(x.shift)+'</td><td>'+esc(x.id)+'</td><td>'+esc(ZONES[x.zone]?.title||'ไม่ระบุ')+'</td><td>'+speedFmt(x.download)+'</td><td>'+speedFmt(x.upload)+'</td></tr>').join('')+'</tbody></table></div>'+(s.samples.length?'':'<p>ยังไม่มีผลทดสอบความเร็วในช่วงนี้</p>')+'</div>';
}
async function exportSpeedDocx(){
  if(!user||!user.isAdmin)return toast('เฉพาะ Admin เท่านั้น',true);
  await ensureFresh();
  const reports=selectedSpeedReports(),s=speedStats(reports);
  const body=dPar('รายงานสรุป Network speed test Wi-Fi: AOT TDAC',{sz:30,bold:true})+dPar('ช่วงวันที่: '+(speedFrom||'ทั้งหมด')+' ถึง '+(speedTo||'ทั้งหมด'))+speedSummaryDocx(reports)+dHeading('ผลทดสอบรายเครื่อง')+dTable([['วันที่ / รอบ','Kiosk','Download (Mbps)','Upload (Mbps)'],...s.samples.map(x=>[x.date+' / '+x.shift,x.id,speedFmt(x.download),speedFmt(x.upload)])],[3600,2000,2200,2200]);
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.folder('word').file('document.xml','<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body></w:document>');
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='AOT-TDAC-Speed-Report.docx';a.click();setTimeout(()=>URL.revokeObjectURL(u),30000);
}
