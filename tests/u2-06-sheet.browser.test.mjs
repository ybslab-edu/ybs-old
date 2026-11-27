import {previewBase, previewPath, cleanPreview} from './fixtures/preview-site.mjs';
// 僅啟動 loopback 靜態站；所有登入、上傳及教師邊界均為合成替身。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve(new URL('..',import.meta.url).pathname),outside=[];
const evidence=process.env.SHEET_EVIDENCE_DIR||'/tmp/ybs-u206-sheet';
let server,browser,base;
before(async()=>{
 mkdirSync(evidence,{recursive:true});
 server=createServer((req,res)=>{try{
  let path=new URL(req.url,'http://127.0.0.1').pathname;if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error('outside root');
  let data=readFileSync(file);const ext=extname(path);
  if(ext==='.html')data=Buffer.from(data.toString().replace(/<link[^>]+https:\/\/fonts\.googleapis\.com[^>]*>/g,''));
  if(path==='/assets/shell.css')data=Buffer.from(data.toString().replace(/^@import.*$/gm,''));
  res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'})[ext]||'application/octet-stream');res.end(data);
 }catch{res.statusCode=404;res.end();}});
 base = await previewBase(server);
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server?.listening)await new Promise(r=>server.close(r));assert.deepEqual(outside,[],'不得有外網請求');});
async function pageFor(width=360,teacher=false,dir='u2-06'){
 const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==new URL(base).origin){outside.push(url.origin);return route.abort();}
  if(previewPath(url.pathname)==='/assets/teacher.js')return route.fulfill({contentType:'text/javascript',body:`window.TEACHER={remembered:()=>${teacher},remember(){}};`});
  if(previewPath(url.pathname)==='/assets/lock.js')return route.fulfill({contentType:'text/javascript',body:'// offline lock boundary'});
  if(previewPath(url.pathname)==='/assets/login.js')return route.fulfill({contentType:'text/javascript',body:'window.__submitted=[];window.YBS={enabled:()=>true,profile:()=>null,button(){},logout(){},leaveGuest(){},status(){},flush(){},guest(){},submit:x=>__submitted.push(x)};'});
  return cleanPreview(route);
 });
 await page.goto(base+'/115-g9/'+dir+'/');
 if(!teacher){await page.locator('#g-manual').evaluate(b=>b.click()).catch(()=>{});await page.locator('#in-cls').fill('999');await page.locator('#in-seat').fill('1');await page.locator('#g-next').click();await page.locator('#g-go').click();}
 // u2-05 第一關直接顯示原始表格與答案欄，沒有委託附件區。
 await page.waitForSelector(dir==='u2-05'?'#stage .quest-answers [data-answer="0"]':'#stage .quest-attach');return {page,errors};
}
async function checkSheetLayout(page){
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'頁面不可水平溢出');
 const regions=page.locator('#stage .sheet-scroll:visible');
 assert.ok(await regions.count()>0,'表格捲動區必須可見');
 for(const region of await regions.all()){
  const result=await region.evaluate(el=>{
   const box=el.getBoundingClientRect(),before=el.scrollLeft,wide=el.scrollWidth>el.clientWidth;
   el.scrollLeft=el.scrollWidth;
   const last=el.querySelector('tbody tr:last-child > :last-child').getBoundingClientRect();
   const result={contained:box.left>=0&&box.right<=innerWidth,wide,scrolled:el.scrollLeft>0,lastVisible:last.left>=box.left&&last.right<=box.right+1};
   el.scrollLeft=before;return result;
  });
  assert.equal(result.contained,true,'捲動容器須留在視窗內');
  if(result.wide){assert.equal(result.scrolled,true,'寬表格須在自身容器水平捲動');assert.equal(result.lastVisible,true,'水平捲動後可讀取最右欄');}
 }
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'捲動表格後頁面仍不可水平溢出');
}
async function choose(page,id,value){await page.locator('#'+id).selectOption(String(value));}
async function solve(page,round){
 // 從表格資料獨立計算操作；不以 APP.handle.fill() 代替學生操作。
 const a=await page.evaluate(()=>{
  const i=APP.inst,cells=i.rows.map(r=>r.cells),bad=r=>r[3]==='不同意'||r[4]==='未滿18歲'&&r[5]!=='已取得'||r.slice(0,9).some(v=>v==='')||!Number.isInteger(r[8])||r[8]<1||r[8]>5;
  const filtered=i.rows.filter(r=>r.cells[2]===i.group&&r.cells[7].split('、').includes(i.slot)),counts=['入口引導','遊戲體驗','舞台支援'].map(j=>filtered.filter(r=>r.cells[6]===j).length);
  const gaps=i.demand?.map((v,k)=>Math.max(v-counts[k],0));
  const backup=i.backups?.find(b=>b.size===i.rows.length&&b.first===cells[0][6]&&b.last===cells.at(-1)[1]).label;
  const multi=i.rows.find(r=>r.id===i.reasonRow)?.cells;
  return {i,backup,counts,invalid:i.rows.filter(r=>bad(r.cells)).map(r=>r.id),reasons:multi?[multi[3]==='不同意'||multi[4]==='未滿18歲'&&multi[5]!=='已取得',multi.slice(0,9).some(v=>v===''),!Number.isInteger(multi[8])||multi[8]<1||multi[8]>5,false]:[],percent:Math.round(counts[2]/filtered.length*100),priority:['入口引導','遊戲體驗','舞台支援'][gaps?.indexOf(Math.max(...gaps))]};
 });
 if(round===0){
  await choose(page,'flow','停止接受回應 → 備份原始資料 → 清理工作副本');await choose(page,'backup',a.backup);
  for(let k=0;k<a.i.examples.length;k++)await choose(page,'class-'+k,a.i.examples[k].answer);
 }else if(round===1){
  await choose(page,'format-range','A2:J'+(a.i.rows.length+1));await choose(page,'format-rule','blank');await page.locator('#format-apply').click();
  for(const id of a.invalid)await page.locator('[data-rowpick="'+id+'"]').check();await page.locator('#exclude').click();
  for(let k=0;k<4;k++)await page.locator('#reason-'+k).setChecked(a.reasons[k]);
 }else if(round===2){
  await page.locator('[data-column="0"]').uncheck();await page.locator('#dedup-run').click();await choose(page,'concept','兩筆暫留並交窗口核對');
 }else{
  await choose(page,'filter-group',a.i.group);await choose(page,'filter-slot',a.i.slot);await page.locator('#filter-apply').click();
  for(let k=0;k<3;k++)await page.locator('#stat-'+k).fill(String(a.counts[k]));
  await choose(page,'chart-source','本組清理、去重並篩選後的統計表');await choose(page,'chart-title',a.i.group+' '+a.i.slot+'場第一志願分布');await page.locator('#chart-make').click();await page.locator('#percent').fill(String(a.percent));await choose(page,'priority',a.priority);await choose(page,'rationale','比較有效回覆筆數與需求，優先補足最大缺口');
 }
}
for(const width of [360,560,1280])test(`學生${width}px四關兩組實際操作、錯答訂正、鍵盤焦點、局部捲動、紀錄`,async()=>{
 const {page,errors}=await pageFor(width);try{
  assert.equal(await page.locator('#tbar').isVisible(),false);
  for(let r=0;r<4;r++){
   await page.evaluate(r=>APP.load(r),r);assert.equal(await page.locator('#b-send').isDisabled(),true);await checkSheetLayout(page);
   await solve(page,r);
   // 產生一個可送出的錯誤狀態，再訂正同題。
   if(r===0)await choose(page,'flow','先備份 → 停止接受回應 → 清理工作副本');
   if(r===1){await choose(page,'format-rule','over5');await page.locator('#format-apply').click();}
   if(r===2){await page.locator('[data-column="0"]').check();await page.locator('#dedup-run').click();}
   if(r===3)await page.locator('#percent').fill('999');
   const prior=await page.evaluate(()=>JSON.stringify(APP.inst));await page.locator('#b-send').click();assert.match(await page.locator('#verdict').textContent(),/還不對/);assert.equal(await page.evaluate(()=>JSON.stringify(APP.inst)),prior);
   // 復原後重新操作，避免上一個成功操作殘留。
   if(r===1)await page.locator('#restore-all').click();
   if(r===2){await page.locator('#dedup-undo').click();await page.locator('#columns-all').click();}
   await solve(page,r);await page.locator('#b-send').click();await page.evaluate(()=>document.getElementById('b-send').onclick());assert.match(await page.locator('#streak').textContent(),/1\/2/);
   await page.screenshot({path:resolve(evidence,`u206-${width}-round${r+1}.png`),fullPage:true});
   await page.locator('#b-next-group').click();assert.equal(await page.locator('#b-send').isDisabled(),true);assert.notEqual(await page.evaluate(()=>JSON.stringify(APP.inst)),prior);
   await checkSheetLayout(page);
   await solve(page,r);await page.locator('#b-send').click();assert.match(await page.locator('#verdict').textContent(),/過關/);
   await checkSheetLayout(page);
  }
  assert.equal(await page.evaluate(()=>__submitted.length),4);
  await page.evaluate(()=>APP.load(1));const box=page.locator('[data-rowpick]').first();await box.focus();await page.keyboard.press('Space');assert.equal(await box.isChecked(),true);
  await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');
  const region=page.locator('#working-sheet .sheet-scroll');await region.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(120);
  if(width===360)assert.ok(await region.evaluate(e=>e.scrollLeft)>0,'表格可用鍵盤水平捲動');
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('D12 360px錯標題及錯篩選不顯示圖表或圖例，訂正標題後可重新製圖',async()=>{
 const {page,errors}=await pageFor(360);try{
  await page.evaluate(()=>APP.load(3));await solve(page,3);
  const {title,wrongTitles}=await page.evaluate(()=>{
   const i=APP.inst,title=i.group+' '+i.slot+'場第一志願分布';
   return {title,wrongTitles:i.titleOptions.filter(t=>t!==title)};
  });
  const blocked=async()=>{
   await page.locator('#chart-make').click();assert.match(await page.locator('#sheet-status').textContent(),/標題/);
   assert.equal(await page.locator('#chart-output figure').count(),0);assert.equal(await page.locator('.sheet-pie').count(),0);assert.equal(await page.locator('.sheet-legend').count(),0);
   assert.equal(await page.evaluate(()=>APP.handle.get().chart),null);assert.equal(await page.locator('#b-send').isDisabled(),true);
   for(const id of ['percent','priority','rationale'])assert.equal(await page.locator('#'+id).inputValue(),'');
  };
  for(const wrongTitle of ['',...wrongTitles]){
   await solve(page,3);assert.equal(await page.locator('.sheet-pie').count(),1);
   await choose(page,'chart-title',wrongTitle);await blocked();
   await choose(page,'chart-title',title);await page.locator('#chart-make').click();
   assert.equal(await page.locator('.sheet-pie').count(),1);assert.equal(await page.locator('#chart-output figcaption strong').textContent(),title);
  }
  for(const id of ['filter-group','filter-slot']){
   await solve(page,3);
   const other=await page.locator('#'+id+' option').evaluateAll(options=>options.find(o=>o.value&&!o.selected).value);
   await choose(page,id,other);await page.locator('#filter-apply').click();assert.equal(await page.locator('#chart-title').inputValue(),title);await blocked();
  }
  await solve(page,3);await page.locator('#b-send').click();assert.match(await page.locator('#streak').textContent(),/1\/2/);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
test('第四關過期圖表、標題來源、0空圖及篩選清除；教師完整狀態不送成績；u2-05/07回歸',async()=>{
 const {page,errors}=await pageFor(360,true);try{
  for(let r=0;r<4;r++){await page.evaluate(r=>APP.load(r),r);await page.locator('#tb-ans').click();assert.equal(await page.locator('#b-send').isDisabled(),false);await page.locator('#b-send').click();await page.locator('#b-next-group').click();await page.locator('#tb-ans').click();await page.locator('#b-send').click();assert.match(await page.locator('#verdict').textContent(),/過關/);}
  assert.equal(await page.evaluate(()=>__submitted.length),0);
  await page.evaluate(()=>APP.load(3));await page.locator('#tb-ans').click();assert.equal(await page.locator('.sheet-pie').count(),1);
  for(const id of ['filter-group','filter-slot','chart-source','chart-title']){
   await page.locator('#tb-ans').click();await page.locator('#'+id).selectOption('');assert.equal(await page.locator('.sheet-pie').count(),0);assert.equal(await page.locator('#percent').inputValue(),'');assert.equal(await page.locator('#priority').inputValue(),'');
  }
  await page.locator('#tb-ans').click();for(let k=0;k<3;k++)await page.locator('#stat-'+k).fill('0');await page.locator('#chart-make').click();assert.match(await page.locator('.sheet-empty').textContent(),/0 筆/);assert.doesNotMatch(await page.locator('#chart-output').textContent(),/NaN|Infinity/);
  await choose(page,'chart-source','原始表單摘要');await page.locator('#chart-make').click();assert.equal(await page.locator('.sheet-pie').count(),0);
  await page.locator('#filter-clear').click();assert.equal(await page.locator('#filtered-sheet tbody tr').count(),await page.evaluate(()=>APP.inst.rows.length));assert.deepEqual(errors,[]);
 }finally{await page.close();}
 for(const dir of ['u2-05','u2-07']){
  const {page:p,errors:e}=await pageFor(360,true,dir);try{for(let r=0;r<4;r++){await p.evaluate(r=>APP.load(r),r);await p.locator('#tb-ans').click();await p.locator('#b-send').click();await p.locator('#b-next-group').click();await p.locator('#tb-ans').click();await p.locator('#b-send').click();assert.match(await p.locator('#verdict').textContent(),/過關/);}assert.deepEqual(e,[]);}finally{await p.close();}
 }
});
test('四關師生文案：任務兩行、共用聲明預設折疊且操作區無重複開場',async()=>{
 for(const teacher of [false,true]){
  const {page,errors}=await pageFor(360,teacher);try{
   for(let r=0;r<4;r++){
    await page.evaluate(r=>APP.load(r),r);
    assert.deepEqual(await page.locator('#says .tk > b').allTextContents(),['現在','要做到']);
    assert.equal(await page.locator('#says .tip').count(),0);
    assert.deepEqual(await page.locator('#says .tk > span').allTextContents(),await page.evaluate(r=>[ROUNDS[r].now,ROUNDS[r].goal],r));
    assert.equal(await page.locator('.quest-note > p').count(),0);
    const details=page.locator('.quest-note > details');assert.equal(await details.getAttribute('open'),null);
    const declaration=details.locator('p').first();assert.equal(await declaration.isVisible(),false);
    await details.locator('summary').click();assert.equal(await declaration.isVisible(),true);
    assert.equal(await declaration.textContent(),'全部為虛構示意資料；你在 YBS 模擬操作，不需開啟其他工具。各關提供獨立副本，並非你上一關的輸出。');
    assert.doesNotMatch(await page.locator('#stage').textContent(),/小洛委託|每關答對兩組|切關會放棄|你可以操作、復原及訂正/);
   }
   assert.deepEqual(errors,[]);
  }finally{await page.close();}
 }
});
