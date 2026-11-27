// 真實 shell、合成身分與 DOM；驗證選單沿用待送阻擋、登出、進度及關卡同步。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element} from './fixtures/activity-dom.mjs';
const source=readFileSync(new URL('../assets/shell.js',import.meta.url),'utf8');
function setup(){
 const body=new Element('body'),stored=new Map(),events=[];
 let profile=null,pending=false,remembered=false;
 const context=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},
  localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},sessionStorage:{setItem(){}},
  TEACHER:{remembered:()=>remembered,remember:v=>{remembered=v}},ybsLogoutPending:()=>pending,
  YBS:{enabled:()=>true,profile:()=>profile,button(){},status(){},guest(){},flush(){},logout(){events.push('logout');profile=null},leaveGuest(){events.push('leaveGuest')},submit(){events.push('submit')}}});
 vm.runInContext(source.replace('  shellCreateInterface(s);','  globalThis.state=s;\n  shellCreateInterface(s);')+`
 let draw=0;
 const APP=SHELL({week:8,termWeek:14,title:'合成活動 <測試>',course:'115-g9',rounds:[0,1,2,3].map(i=>({name:'合成關卡 '+i+' <完整名稱>',lv:1,gen:()=>({n:++draw}),view:()=>({get:()=>true}),check:()=>true}))});`,context);
 const get=id=>body.querySelector('#'+id),s=context.state;
 return {get,s,body,stored,events,remembered:()=>remembered,pending:v=>{pending=v},start(student=false){profile=student?{uid:'synthetic-header',email:'header@example.invalid'}:null;s.start({cls:999,seat:1})}};
}
test('未登入仍可見頁首；登入後回到 #main 內並保留唯一 ID，週次與活動名分列',()=>{
 const h=setup();
 assert.equal(h.get('activity-header').parentElement,h.get('shell-header-home'));
 assert.equal(h.get('b-header-login').hidden,false);assert.equal(h.get('account').hidden,true);
 assert.ok(h.get('rounds').querySelectorAll('button').every(b=>b.disabled));
 h.start(true);
 assert.equal(h.get('activity-header').parentElement,h.get('main'));
 assert.equal(h.body.querySelector('.activity-week').textContent,'第 14 週');
 assert.equal(h.body.querySelector('#activity-header h1').textContent,'合成活動 <測試>');
 for(const id of ['who','b-swap','sync','b-retry','xp-header','xp-level','xp-total','xp-progress','xp-next','xp-link','xp-login-hint','rounds','tbar'])assert.equal(h.body.querySelectorAll('#'+id).length,1,id);
 h.get('b-logout').click();assert.equal(h.get('activity-header').parentElement,h.get('shell-header-home'));
});
test('學生／訪客／教師帳號選單資訊、成長頁與原離開流程',()=>{
 for(const student of [false,true]){
  const h=setup();h.start(student);
  assert.equal(h.get('account-avatar').textContent,student?'生':'訪');
  assert.equal(h.get('account-name').textContent,'999 班 1 號'+(student?'':'（待審）'));
  assert.match(h.get('account-info').textContent,student?/已登入：學號登入/:/作答送出後需老師審核/);
  assert.equal(h.get('account-growth').getAttribute('href'),'../me/');
  assert.equal(h.get('xp-link').hidden,!student);
  assert.equal(h.get('xp-login-hint').hidden,student);
  assert.equal(h.get('b-logout').hidden,false);
  h.get('b-logout').click();assert.deepEqual(h.events,[student?'logout':'leaveGuest']);
  assert.equal(h.s.ident,null);assert.equal(h.get('account').hidden,true);
 }
 const h=setup();h.s.enterTeacher();
 assert.equal(h.get('account-name').textContent,'教師模式');assert.equal(h.get('account-avatar').textContent,'師');
 assert.equal(h.get('account-growth').hidden,true);assert.equal(h.get('b-logout').hidden,true);
 assert.equal(h.get('b-swap').textContent,'登出教師模式');assert.equal(h.get('tbar').hidden,false);
 h.get('b-swap').click();assert.deepEqual(h.events,['logout']);assert.equal(h.remembered(),false);assert.equal(h.get('tbar').hidden,true);
});
test('換人和登出共用待送阻擋；沒有略過原有登入／資料隔離',()=>{
 for(const id of ['b-swap','b-logout']){
  const h=setup();h.start(true);h.pending(true);h.get('account').open=true;h.get(id).click();
  assert.deepEqual(h.events,[]);assert.ok(h.s.ident);assert.equal(h.get('account').open,true);
  h.pending(false);h.get(id).click();assert.deepEqual(h.events,['logout']);assert.equal(h.s.ident,null);assert.equal(h.get('account').open,false);
 }
});
test('Esc 關閉回復焦點、外側點擊關閉、選單內點擊保留',()=>{
 const h=setup();h.start();const account=h.get('account'),toggle=h.get('account-toggle');let focused=false,prevented=false;
 toggle.focus=()=>{focused=true};account.open=true;
 h.body.listeners.keydown[0]({key:'Escape',preventDefault(){prevented=true}});
 assert.equal(account.open,false);assert.equal(focused,true);assert.equal(prevented,true);
 account.open=true;h.body.listeners.click[0]({target:toggle});assert.equal(account.open,true);
 h.body.listeners.click[0]({target:h.body.querySelector('#activity-header h1')});assert.equal(account.open,false);
});
test('load、過關與還原都保留固定按鈕文字，同步目前關卡及完整輔助標籤',()=>{
 const h=setup();h.start();
 for(let i=0;i<4;i++){
  h.s.load(i);assert.equal(h.get('current-round-number').textContent,'第 '+(i+1)+' 關');
  assert.equal(h.get('current-round-name').textContent,'合成關卡 '+i+' <完整名稱>');
  h.s.submit();h.get('b-next-group').click();h.s.submit();
  const b=h.get('rounds').querySelectorAll('button')[i];
  assert.equal(b.textContent,'第 '+(i+1)+' 關');
  assert.equal(b.getAttribute('aria-label'),'第 '+(i+1)+' 關：合成關卡 '+i+' <完整名稱>（已過關）');
  assert.equal(b.getAttribute('title'),b.getAttribute('aria-label'));assert.doesNotMatch(b.textContent,/✓/);
 }
 h.start();assert.equal(h.get('rounds').querySelectorAll('.passed').length,4);
});
test('關卡按鈕的觸控回饋在放開、取消及失焦後清除，取消不切關',()=>{
 const h=setup(),down={pointerId:7,isPrimary:true,button:0};
 const locked=h.get('rounds').querySelectorAll('button')[2];
 locked.onpointerdown(down);assert.equal(locked.matches('.is-pressing'),false);
 h.start();const b=h.get('rounds').querySelectorAll('button')[2];
 for(const end of ['onpointerup','onpointercancel','onpointerleave','onlostpointercapture','onblur']){
  b.onpointerdown({...down,isPrimary:false});assert.equal(b.matches('.is-pressing'),false);
  b.onpointerdown(down);assert.equal(b.matches('.is-pressing'),true);
  b.onpointerup({pointerId:8});assert.equal(b.matches('.is-pressing'),true,'其他手指不能解除目前按下狀態');
  b[end](down);assert.equal(b.matches('.is-pressing'),false);assert.equal(h.s.ri,0);
 }
 b.click();assert.equal(h.s.ri,2,'原生點擊仍可切關');
});
