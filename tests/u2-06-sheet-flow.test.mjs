import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {setup,read,plain} from './fixtures/u2-06-sheet.mjs';

for(let round=0;round<4;round++)test(`第${round+1}關完整外框：錯答、訂正、兩組、同題重送、換關與重設`,()=>{
 const h=setup(),send=()=>h.get('b-send').onclick();h.run(`APP.load(${round})`);
 assert.equal(h.get('b-send').disabled,true);const before=h.run('JSON.stringify(APP.inst)');send();assert.match(h.get('streak').textContent,/0\/2/);
 h.run('APP.handle.fill();globalThis.getAnswer=APP.handle.get;APP.handle.get=()=>({})');send();assert.match(h.get('verdict').textContent,/還不對/);assert.equal(h.run('JSON.stringify(APP.inst)'),before);
 h.run('APP.handle.get=getAnswer');h.get('tb-ans').click();send();send();assert.match(h.get('streak').textContent,/1\/2/);
 h.run('globalThis.original=ROUNDS[APP.ri].gen;globalThis.prior=APP.inst;ROUNDS[APP.ri].gen=()=>({...prior,seed:prior.seed+1})');
 h.get('b-next-group').click();h.get('tb-ans').click();send();assert.match(h.get('streak').textContent,/1\/2/,'相同資料換seed不能加計');
 h.run('ROUNDS[APP.ri].gen=original');h.get('b-next-group').click();assert.equal(h.get('b-send').disabled,true);h.get('tb-ans').click();send();assert.match(h.get('verdict').textContent,/過關/);
 assert.deepEqual(h.submitted,[],'教師不送成績');h.run(`APP.load(${(round+1)%4});APP.load(${round})`);assert.equal(h.get('b-send').disabled,true);assert.match(h.get('streak').textContent,/0\/2/);
});
test('第二關操作 UI：實際錯標記、選列排除、未選不排除、全部復原、指定列一直可查',()=>{
 const h=setup();h.run('APP.load(1)');const len=h.run('APP.inst.rows.length');
 h.get('format-range').value='J2:J'+(len+1);h.get('format-rule').value='blank';h.get('format-apply').click();assert.ok(h.body.querySelectorAll('#working-sheet .sheet-mark').length>0);assert.equal(h.run('APP.handle.get().excluded.length'),0);
 h.get('exclude').click();assert.equal(h.run('APP.handle.get().excluded.length'),0);
 const row=h.body.querySelector('[data-rowpick]');row.checked=true;row.onchange();h.get('exclude').click();assert.equal(h.run('APP.handle.get().excluded.length'),1);assert.match(h.get('clean-counts').textContent,/已排除 1/);
 assert.equal(h.body.querySelectorAll('#excluded-sheet tbody tr').length,1);h.get('restore-all').click();assert.equal(h.run('APP.handle.get().excluded.length'),0);assert.equal(h.body.querySelectorAll('#working-sheet tbody tr').length,len);
});
test('第三關操作 UI：全欄真結果、無欄拒絕、欄名提示、只B結果、改欄位清除結果、復原',()=>{
 const h=setup();h.run('APP.load(2)');h.get('dedup-run').click();assert.equal(h.run('APP.handle.get().result.removed.length'),0);
 h.get('columns-none').click();h.get('dedup-run').click();assert.equal(h.run('APP.handle.get().result'),null);assert.match(h.get('sheet-status').textContent,/至少選一個/);
 const b=h.body.querySelector('[data-column="1"]');b.checked=true;b.onchange();h.get('has-header').checked=false;h.get('dedup-run').click();assert.match(h.get('sheet-status').textContent,/欄名/);
 h.get('has-header').checked=true;h.get('dedup-run').click();assert.ok(h.run('APP.handle.get().result.removed.length')>=3);h.get('dedup-undo').click();assert.equal(h.run('APP.handle.get().result'),null);
});
test('第四關操作 UI：真篩選、依輸入製圖、0空圖、錯來源阻止、所有上游失效、清除完整恢復',()=>{
 const h=setup();h.run('APP.load(3)');h.get('tb-ans').click();assert.ok(h.body.querySelector('.sheet-pie'));assert.ok(h.body.querySelector('.sheet-bars'));
 h.get('stat-0').value='0';h.get('stat-0').oninput();assert.equal(h.run('APP.handle.get().chart'),null);assert.equal(h.get('percent').value,'');assert.equal(h.get('priority').value,'');
 for(let k=0;k<3;k++){h.get('stat-'+k).value='0';h.get('stat-'+k).oninput();}h.get('chart-make').click();assert.equal(h.body.querySelector('.sheet-pie'),null);assert.match(h.body.querySelector('.sheet-empty').textContent,/0 筆/);assert.doesNotMatch(h.get('chart-output').textContent,/NaN|Infinity/);
 h.get('chart-source').value='原始表單摘要';h.get('chart-source').onchange();h.get('chart-make').click();assert.equal(h.run('APP.handle.get().chart'),null);
 for(const id of ['filter-group','filter-slot','chart-source','chart-title']){h.get('tb-ans').click();h.get(id).onchange();assert.equal(h.run('APP.handle.get().chart'),null);assert.equal(h.get('b-send').disabled,true);}
 h.get('filter-clear').click();assert.equal(h.body.querySelectorAll('#filtered-sheet tbody tr').length,h.run('APP.inst.rows.length'));
});
test('D12 操作 UI：錯標題及錯篩選均不顯示圖表、圖例或錯標資料，訂正後可重新製圖',()=>{
 const h=setup();h.run('APP.load(3)');
 const title=h.run('Q.title(APP.inst)'),wrongTitles=plain(h.run('APP.inst.titleOptions.filter(t=>t!==Q.title(APP.inst))'));
 const blocked=()=>{
  h.get('chart-make').click();assert.match(h.get('sheet-status').textContent,/標題/);
  assert.equal(h.run('APP.handle.get().chart'),null);assert.equal(h.body.querySelector('#chart-output figure'),null);
  assert.equal(h.body.querySelector('.sheet-pie'),null);assert.equal(h.body.querySelector('.sheet-legend'),null);
  assert.equal(h.get('b-send').disabled,true);
  for(const id of ['percent','priority','rationale'])assert.equal(h.get(id).value,'');
 };
 for(const wrongTitle of ['',...wrongTitles]){
  h.get('tb-ans').click();assert.ok(h.body.querySelector('.sheet-pie'));assert.equal(h.get('b-send').disabled,false);
  h.get('chart-title').value=wrongTitle;h.get('chart-title').onchange();blocked();
  h.get('chart-title').value=title;h.get('chart-title').onchange();h.get('chart-make').click();
  assert.ok(h.body.querySelector('.sheet-pie'));assert.equal(h.body.querySelector('#chart-output figcaption strong').textContent,title);
  assert.deepEqual(plain(h.run('APP.handle.get().chart.counts')),plain(h.run('APP.handle.get().stats.map(Number)')));
 }
 for(const id of ['filter-group','filter-slot']){
  h.get('tb-ans').click();h.get(id).value=h.run(id==='filter-group'?'Q.groups.find(g=>g!==APP.inst.group)':'Q.slots.find(t=>t!==APP.inst.slot)');
  h.get(id).onchange();h.get('filter-apply').click();assert.equal(h.get('chart-title').value,title);blocked();
 }
 h.get('tb-ans').click();assert.equal(h.run('Q.check(APP.inst,APP.handle.get())'),true);
});
test('學生新舊本機進度隔離、每關兩組後才送既有欄位、重送不新增、重新登入還原新版',()=>{
 const key='it9:w8:999-1',old=JSON.stringify({mask:15,tries:[1,2,3,4,0,0],time:1}),stored=new Map([[key,old]]),h=setup({teacher:false,stored,enabled:true});
 h.get('in-cls').value='999';h.get('in-seat').value='1';h.get('g-go').click();assert.equal(h.body.querySelectorAll('#rounds .passed').length,0);assert.match(h.get('who').textContent,/999/);
 for(let r=0;r<4;r++){
  h.run(`APP.load(${r})`);h.run('APP.handle.fill()');h.get('b-send').onclick();assert.equal(h.submitted.length,r);h.get('b-next-group').click();h.run('APP.handle.fill()');h.get('b-send').onclick();h.get('b-send').onclick();assert.equal(h.submitted.length,r+1);
  assert.equal(h.submitted[r].activity,8);assert.equal(h.submitted[r].round,r);assert.equal(h.submitted[r].termWeek,14);assert.equal(h.submitted[r].mask,2**(r+1)-1);
 }
 assert.equal(stored.get(key),old);assert.equal(JSON.parse(stored.get(key+':sheet-v2')).mask,15);
 const next=setup({teacher:false,stored});next.get('in-cls').value='999';next.get('in-seat').value='1';next.get('g-go').click();assert.equal(next.body.querySelectorAll('#rounds .passed').length,4);
});
test('只有選用progressVersion才忽略舊雲端完成；u2-05/07原還原邏輯維持',()=>{
 for(const version of ['', 'sheet-v2']){
  const ctx=vm.createContext({});vm.runInContext(read('assets/shell.js')+`;globalThis.saved=0;globalThis.rendered=0;globalThis.s={cfg:{week:8,progressVersion:${JSON.stringify(version)}},R:[{},{},{},{}],$(){return {}},loginEnabled:()=>false,prog:{mask:0},done:new Set(),saveProg(){saved++},renderRounds(){rendered++}};shellCreateIdentity(s).restoreCloudProgress([{activity:8,round:1}]);`,ctx);
  assert.equal(vm.runInContext('s.prog.mask',ctx),version?0:2);assert.equal(vm.runInContext('saved',ctx),version?0:1);
 }
});

test('四關文案：師生任務只留兩行、共用聲明折疊、保留提示入口與操作指示',()=>{
 const now=['收件截止了，你要先保住原始回覆，再找出資料裡的問題。','你拿到原始回覆副本，要判斷哪些資料可以留下。','你拿到已清理的副本，要找出內容完全重複的回覆。','你拿到已清理並去重的副本，要找出指定組別與場次的補招缺口。'];
 const goals=['選對封存順序、找出完整的備份，再分類四個儲存格。','標記全部資料範圍的空白、排除無效回覆，再確認指定列的全部排除原因。','設定比對欄位並執行去重，再決定同代號但內容不同的回覆如何處理。','篩選指定組別與時段、統計並製圖，再比較需求提出補招初步建議。'];
 const tip='先查共用資料規格，再核對目前工具設定與表格；你可以復原訂正。';
 for(const teacher of [true,false])for(let round=0;round<4;round++){
  const h=setup({teacher});
  if(!teacher){h.get('in-cls').value='999';h.get('in-seat').value='1';h.get('g-go').click();}
  h.run(`APP.load(${round})`);
  const task=h.get('says'),lines=task.querySelectorAll('.tk');
  assert.equal(lines.length,2);assert.equal(lines[0].textContent,'現在'+now[round]);assert.equal(lines[1].textContent,'要做到'+goals[round]);assert.equal(task.querySelector('.tip'),null);
  const note=h.body.querySelector('.quest-note'),details=note.querySelector('details');
  assert.equal(note.querySelectorAll('p').length,details.querySelectorAll('p').length);assert.equal(details.getAttribute('open'),null);
  assert.equal(details.querySelector('summary').textContent,'查看共用資料規格與紀錄說明');
  assert.equal(details.querySelector('p').textContent,'全部為虛構示意資料；你在 YBS 模擬操作，不需開啟其他工具。各關提供獨立副本，並非你上一關的輸出。');
  assert.doesNotMatch(h.get('stage').textContent,/小洛委託|每關答對兩組|切關會放棄|你可以操作、復原及訂正/);
  assert.equal(h.run(`ROUNDS[${round}].tip`),tip);
  if(!teacher){
   h.run('APP.handle.fill();APP.handle.get=()=>({})');h.get('b-send').onclick();
   assert.equal(h.get('b-hint').hidden,false);h.get('b-hint').click();assert.ok(h.get('hint-content').textContent.includes(tip));
  }
 }
});
