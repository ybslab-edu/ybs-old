import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {model,plain,oracle,fixtureRows,read,source} from './fixtures/u2-06-sheet.mjs';
const Q=model(),make=(r,n=1)=>plain(Q.generate(r,n)),sol=i=>plain(Q.solution(i));
const wrong=(i,s)=>assert.notEqual(Q.check(i,s),true);

test('D01 多種子四關：兩組等難度、案例完整、有效時間代號、有界及獨立正解',()=>{
 for(let round=0;round<4;round++)for(let seed=1;seed<=160;seed++){
  const i=make(round,seed),next=make(round,seed+1),o=oracle(i),s=sol(i);
  assert.notDeepEqual(i.rows.map(r=>r.cells),next.rows.map(r=>r.cells));
  assert.equal(i.rows.length,next.rows.length);assert.equal(Q.check(i,s),true);wrong(i,plain(Q.initial(i)));
  assert.equal(new Set(i.rows.map(r=>r.id)).size,i.rows.length);
  for(const r of i.rows){assert.match(r.cells[0],/^(?:09|10|11):[0-5]\d$/);assert.match(r.cells[1],/^V\d{2}$/);assert.ok(['上午','下午','上午、下午',''].includes(r.cells[7]));}
  assert.ok(new Set(i.rows.filter(r=>!o.invalid.includes(r.id)).map(r=>r.cells[8])).size>1);
  assert.ok(i.rows.some(r=>r.cells[9]===''));
  if(round<2){assert.equal(i.rows.length,12);assert.equal(o.invalid.length,5);assert.equal(o.clean.length,7);assert.equal(o.kept.length,6);assert.ok(i.rows.some(r=>r.cells[3]==='不同意'));assert.ok(i.rows.some(r=>r.cells[4]==='未滿18歲'&&r.cells[5]==='未取得'));}
  if(round===1)assert.equal(Q.reasons(i.rows.find(r=>r.id===i.reasonRow)).length,3);
  if(round>=2){assert.equal(o.invalid.length,0);assert.ok(i.rows.some(r=>r.cells[7]==='上午、下午')||round===2);}
  if(round===2){assert.equal(o.kept.length,8);assert.ok(o.kept.some((r,k,a)=>a.some((x,j)=>j!==k&&x.cells[1]===r.cells[1])));assert.ok(o.kept.some((r,k,a)=>a.some((x,j)=>j!==k&&x.cells[1]!==r.cells[1]&&JSON.stringify(x.cells.slice(2))===JSON.stringify(r.cells.slice(2)))));}
  if(round===3){assert.equal(o.kept.length,i.rows.length);assert.ok(o.selected.length>0&&o.selected.length<i.rows.length);assert.deepEqual(s.stats.map(Number),o.counts);const gaps=i.demand.map((v,k)=>Math.max(v-o.counts[k],0)),max=Math.max(...gaps);assert.ok(max>0);assert.equal(gaps.filter(v=>v===max).length,1);}
 }
});
test('D02 期待程度必填、整數1～5；J空白合法；所有其他必填空白皆拒絕',()=>{
 const row=plain(Q.generate(3,1).rows[0]);
 for(const v of ['',0,6,1.5,'3',null]){row.cells[8]=v;assert.ok(Q.reasons(row).length);}
 for(const v of [1,5]){row.cells[8]=v;row.cells[9]='';assert.equal(Q.reasons(row).length,0);}
 for(let k=0;k<9;k++){const r=plain(row);r.cells[k]='';assert.ok(Q.reasons(r).length);}
});
test('D03 多錯誤列僅排除一次；所有實際原因都要選，選填空白不算',()=>{
 const i=make(1),s=sol(i),r=i.rows.find(r=>r.id===i.reasonRow);
 assert.equal(Q.reasons(r).length,3);assert.equal(s.excluded.filter(id=>id===r.id).length,1);
 Q.exclude(i,s,[r.id,r.id]);assert.equal(s.excluded.filter(id=>id===r.id).length,1);
 for(const cause of Q.reasonOptions){const a=sol(i);a.reasons=a.reasons.includes(cause)?a.reasons.filter(x=>x!==cause):[...a.reasons,cause];wrong(i,a);}
});
test('D04 相同筆數但指定欄位錯誤的備份不得通過；第一關恰六項',()=>{
 const i=make(0),s=sol(i),bad=i.backups.find(b=>b.size===i.rows.length&&b.label!==s.backup);
 assert.ok(bad);s.backup=bad.label;wrong(i,s);assert.equal(2+i.examples.length,6);
 for(const key of ['flow','backup','classes']){const a=sol(i);a[key]=key==='classes'?['','','','']:'';wrong(i,a);}
});
test('D05 套用格式真標記必填與選填空白；較小範圍／數值規則結果不同，無自動排除',()=>{
 const i=make(1),s=plain(Q.initial(i)),blank=i.rows.flatMap(r=>r.cells.flatMap((v,k)=>v===''?[r.id+':'+k]:[]));
 assert.deepEqual(plain(Q.applyFormat(i,s,Q.range(i),'blank')),blank);assert.deepEqual(s.excluded,[]);
 assert.notDeepEqual(plain(Q.applyFormat(i,s,'J2:J13','blank')),blank);
 assert.notDeepEqual(plain(Q.applyFormat(i,s,Q.range(i),'over5')),blank);
 const a=sol(i);a.format=null;wrong(i,a);a.format={range:'G2:H13',rule:'blank'};wrong(i,a);
});
test('D06 同剩餘數但誤刪正常列、漏刪無效列不得過；全部／個別復原可訂正',()=>{
 const i=make(1),s=sol(i),valid=oracle(i).clean[0].id,bad=s.excluded[0];s.excluded[0]=valid;wrong(i,s);
 assert.match(Q.check(i,s),/誤刪/);Q.restore(s,valid);assert.match(Q.check(i,s),/仍有/);Q.exclude(i,s,[bad]);assert.equal(Q.check(i,s),true);
 Q.restore(s);assert.deepEqual(plain(s.excluded),[]);wrong(i,s);
});
test('D07 有效完全重複在清理關保留，誤去重不得過',()=>{
 const i=make(1),s=sol(i),o=oracle(i);assert.equal(o.clean.length-o.kept.length,1);
 const extra=o.clean.find(r=>!o.kept.some(x=>x.id===r.id));s.excluded.push(extra.id);wrong(i,s);
});
test('D08 教師回歸：全欄10、僅B 7、B～J 8；依初始原順序保留，時間不是排序依據',()=>{
 const rows=fixtureRows();assert.equal(Q.dedup(rows,[0,...Q.business]).kept.length,10);
 assert.equal(Q.dedup(rows,[1]).kept.length,7);const expected=Q.dedup(rows,Q.business);assert.equal(expected.kept.length,8);assert.deepEqual(plain(expected.removed),['fixture-8','fixture-9']);
 const r=plain(rows);r[0].cells[0]='11:59';r[8].cells[0]='08:01';assert.deepEqual(plain(Q.dedup(r,Q.business)),plain(expected));
});
test('D09 部分欄位碰巧得相同集合仍拒絕；未執行、無欄名、錯移除集合都拒絕',()=>{
 const i=make(2),s=sol(i);s.result.columns=Q.business.filter(k=>k!==9);Object.assign(s.result,plain(Q.dedup(i.rows,s.result.columns)));assert.deepEqual(s.result.kept,sol(i).result.kept);wrong(i,s);
 const a=sol(i);a.result.header=false;wrong(i,a);a.result=null;wrong(i,a);assert.equal(Q.runDedup(i,a,[],true),false);
 const b=sol(i);[b.result.kept[0],b.result.removed[0]]=[b.result.removed[0],b.result.kept[0]];wrong(i,b);
});
test('D10 組別AND集合時段；雙時段只計一次；清除不修改初始資料；相同筆數錯條件拒絕',()=>{
 const i=make(3),before=JSON.stringify(i.rows),s=plain(Q.initial(i));Q.applyFilter(i,s,i.group,i.slot);assert.deepEqual(s.filter.visible,oracle(i).selected.map(r=>r.id));
 assert.equal(new Set(s.filter.visible).size,s.filter.visible.length);assert.ok(i.rows.some(r=>s.filter.visible.includes(r.id)&&r.cells[7]==='上午、下午'));
 Q.clearFilter(s);assert.equal(s.filter,null);assert.equal(JSON.stringify(i.rows),before);
 const a=sol(i);a.filter.group=i.group==='動漫組'?'遊戲組':'動漫組';wrong(i,a);
});
test('D11 合計相同職務分配錯誤拒絕；圖表必須依學生輸入產生',()=>{
 const i=make(3),s=sol(i),sum=s.stats.reduce((a,b)=>a+Number(b),0);s.stats[0]=String(Number(s.stats[0])+1);s.stats[1]=String(Number(s.stats[1])-1);
 assert.equal(s.stats.reduce((a,b)=>a+Number(b),0),sum);Q.makeChart(i,s,Q.source,Q.title(i));assert.deepEqual(s.chart.counts,s.stats.map(Number));wrong(i,s);
});
test('D12 錯來源或標題阻止製圖；上游修改失效、直接注入過期圖表也拒絕',()=>{
 const i=make(3),s=sol(i);assert.notEqual(Q.makeChart(i,s,'原始表單摘要',Q.title(i)),true);assert.equal(s.chart,null);wrong(i,s);
 for(const selectedTitle of ['',...i.titleOptions.filter(t=>t!==Q.title(i)),'錯誤標題']){
  const a=sol(i);assert.match(Q.makeChart(i,a,Q.source,selectedTitle),/標題/);assert.equal(a.chart,null);
  assert.equal(a.percent,'');assert.equal(a.priority,'');assert.equal(a.rationale,'');wrong(i,a);
 }
 // 即使選到任務標題，也不能把其他組別或場次的實際篩選資料掛在下面。
 for(const [group,slot] of [[i.group,Q.slots.find(t=>t!==i.slot)],[Q.groups.find(g=>g!==i.group),i.slot],['',i.slot],[i.group,'']]){
  const a=sol(i);Q.applyFilter(i,a,group,slot);assert.match(Q.makeChart(i,a,Q.source,Q.title(i)),/標題/);assert.equal(a.chart,null);wrong(i,a);
 }
 const badTitle=sol(i);badTitle.chart.title='錯誤標題';wrong(i,badTitle);
 const a=sol(i),old=plain(a.chart);Q.applyFilter(i,a,i.group,i.slot);assert.equal(a.chart,null);assert.equal(a.percent,'');assert.equal(a.priority,'');assert.equal(a.rationale,'');
 a.chart=old;a.chart.filter.group='錯誤組別';wrong(i,a);
 for(const key of ['filter','stats','chart','percent','priority','rationale']){const b=sol(i);b[key]=key==='stats'?['','','']:null;wrong(i,b);}
});
test('D13 0合法、負數及非整數非法；空圖無NaN；缺口不為負；零類別可通過',()=>{
 assert.ok(Q.integers(['0','1','2']));for(const values of [['','1','2'],['-1','2','3'],['0.5','1','2'],['NaN','1','2']])assert.equal(Q.integers(values),false);
 const i=make(3),s=sol(i);s.stats=['0','0','0'];assert.equal(Q.makeChart(i,s,Q.source,Q.title(i)),true);assert.deepEqual(plain(Q.percentages(s.chart.counts)),[0,0,0]);assert.deepEqual(plain(Q.gaps([1,2,3],[5,2,1])),[0,0,2]);
 const zero=make(3);zero.rows.forEach(r=>{if(r.cells[6]==='舞台支援')r.cells[6]='入口引導';});zero.demand=[8,3,6];assert.equal(Q.check(zero,sol(zero)),true);
});
test('D14 現行第四關等價範例：原2～6列，1/2/2，20/40/40，4/1/0，入口優先',()=>{
 const i={version:Q.VERSION,round:3,rows:fixtureRows().slice(0,8),group:'動漫組',slot:'下午',demand:[5,3,2]},s=sol(i);
 assert.deepEqual(s.filter.visible,i.rows.slice(0,5).map(r=>r.id));assert.deepEqual(s.stats,['1','2','2']);assert.deepEqual(plain(Q.percentages(s.chart.counts)),[20,40,40]);assert.deepEqual(plain(Q.gaps(i.demand,s.chart.counts)),[4,1,0]);assert.equal(s.priority,'入口引導');assert.equal(Q.check(i,s),true);
});
test('只用活動資源與既有框架、固定ID版本、空白為空值、CSS限作用域且無新色碼',()=>{
 const html=read('115-g9/u2-06/index.html'),js=source(),css=read('115-g9/u2-06/activity.css');
 assert.match(js,/week:8/);assert.match(js,/progressVersion:Q.VERSION/);assert.match(html,/const SheetModel/);
 assert.doesNotMatch(html+js,/備用素材|國中組|高中組|Google API|fetch\(/);assert.doesNotMatch(css,/#[0-9a-f]{3,8}\b/i);
 assert.doesNotMatch(css,/^body|^:root/m);assert.match(js,/虛構示意資料/);
});
test('u2-06 關卡提示：多種子含任務資料、不更動資料、不讀取隱藏解答',()=>{
 const c=vm.createContext({SHELL:cfg=>cfg});vm.runInContext(source()+';globalThis.rounds=ROUNDS;',c);
 for(const [index,r] of c.rounds.entries())for(let seed=1;seed<=30;seed++){
  let state=seed,calls=0;const rnd=()=>{if(++calls>1000)throw Error('產題超過上限');state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
  const i=r.gen(rnd),before=JSON.stringify(i),text=r.steps(i);assert.equal(JSON.stringify(i),before);assert.ok(text.length>35);assert.ok(text.includes(String(i.rows.length)));if(index===3){assert.ok(text.includes(i.group));assert.ok(text.includes(i.slot));}
  assert.doesNotMatch(text,/undefined|NaN|答案是|正解是/);
  const guarded=new Proxy(i,{get(target,key){if(['examples','backups','demand','reasonRow'].includes(key))throw Error('讀取隱藏答案 '+key);return target[key];}});assert.equal(r.steps(guarded),text);
 }
});
