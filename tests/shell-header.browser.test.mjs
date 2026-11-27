import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {headerSession,enterHeaderState,auditHeader,origin} from './fixtures/header-browser.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const shots=process.env.HEADER_SHOTS_DIR||'/tmp/ybs-header-shots';
const dirs=['u2-04','u2-05','u2-06','u2-07'],states=['none','student','guest','teacher'];
let browser;
before(async()=>{mkdirSync(shots,{recursive:true});browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
async function shot(page,name,open=false){
 const header=await page.locator('#activity-header').boundingBox();
 const menu=open?await page.locator('#account-menu').boundingBox():null;
 await page.screenshot({path:resolve(shots,name+'.png'),clip:{x:0,y:0,width:page.viewportSize().width,height:Math.ceil(Math.max(header.y+header.height+16,menu?menu.y+menu.height+16:0))}});
}
for(const width of [360,1280])test(`教師核准樣本 ${width}px`,async()=>{
 const {context,page,errors,outside}=await headerSession(browser,width);
 try{await page.goto(origin+'/header-mock.html');assert.equal(await page.locator('.top').count(),4);await page.screenshot({path:resolve(shots,`approved-mock-${width}.png`),fullPage:true});assert.deepEqual(errors,[]);assert.deepEqual(outside,[])}finally{await context.close()}
});
for(const width of [360,412,768,1280])for(const state of states)test(`頁首 ${width}px ${state}：四活動、選單與鍵盤`,{timeout:120000},async()=>{
 const {context,page,errors,outside}=await headerSession(browser,width,state);
 try{
  for(const dir of dirs){
   await enterHeaderState(page,dir,state);
   const label=`${dir}-${width}-${state}`;
   await auditHeader(page,label+' closed');
   assert.doesNotMatch(await page.locator('#activity-header h1').textContent(),/^第 \d+ 週/);
   assert.match(await page.locator('.activity-week').textContent(),/^第 \d+ 週$/);
   const buttons=page.locator('#rounds button');
   assert.deepEqual(await buttons.allTextContents(),['第 1 關','第 2 關','第 3 關','第 4 關']);
   if(width<=520){
    const boxes=await buttons.evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {y:r.y,width:r.width}}));
    assert.ok(boxes.every(b=>Math.abs(b.y-boxes[0].y)<1&&Math.abs(b.width-boxes[0].width)<1),'手機四顆同列等寬');
    assert.equal(await page.locator('.account-name').isVisible(),false);
    assert.equal(await page.locator('.xp-wide').isVisible(),false);
   }
   await shot(page,label+'-header');
   if(state==='none'){
    assert.equal(await page.locator('#account').isVisible(),false);
    assert.equal(await buttons.first().isDisabled(),true);
    await page.click('#b-header-login');assert.equal(await page.locator('#mock-signin').evaluate(el=>el===document.activeElement),true);
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:resolve(shots,label+'-login-entry.png')});
    continue; // 核准樣本的未登入狀態只有登入按鈕，沒有帳號選單。
   }
   assert.equal(await page.locator('#account').isVisible(),true);
   assert.equal(await page.locator('#account-growth').getAttribute('href'),'../me/');
   for(let i=0;i<4;i++){
    await buttons.nth(i).click();
    assert.equal(await page.locator('#current-round-number').textContent(),`第 ${i+1} 關`);
    assert.equal(await page.locator('#current-round-name').textContent(),await page.evaluate(i=>APP.rounds[i].name,i));
    const full=await buttons.nth(i).getAttribute('title');
    assert.equal(await buttons.nth(i).getAttribute('aria-label'),full);
    assert.ok(full.includes(await page.locator('#current-round-name').textContent()));
   }
   if(state!=='teacher'){
    assert.match(await buttons.nth(1).getAttribute('aria-label'),/（已過關）/);
    assert.equal(await buttons.nth(1).evaluate(el=>getComputedStyle(el,'::after').content),'"✓"');
    assert.doesNotMatch(await buttons.nth(1).textContent(),/✓/);
   }
   await page.evaluate(()=>APP.load(0));
   const toggle=page.locator('#account-toggle');await toggle.focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#account').evaluate(el=>el.open),true);
   await auditHeader(page,label+' open');
   if(state==='guest'){assert.match(await page.locator('#account-info').textContent(),/老師審核/);assert.equal(await page.locator('#xp-header').isVisible(),false)}
   if(state==='student'){assert.equal(await page.locator('#xp-link').isVisible(),true);assert.match(await page.locator('#xp-level').textContent(),/^Lv \d+$/);assert.equal(await page.locator('#xp-progress').isVisible(),true)}
   if(state==='teacher'){assert.equal(await page.locator('#b-swap').textContent(),'登出教師模式');assert.equal(await page.locator('#tbar').isVisible(),true);assert.equal(await page.locator('#account-growth').isVisible(),false)}
   await shot(page,label+'-menu',true);
   await page.keyboard.press('Tab');assert.equal(await toggle.evaluate(el=>el===document.activeElement),false);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#account').evaluate(el=>el.open),false);assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
   await page.keyboard.press('Space');assert.equal(await page.locator('#account').evaluate(el=>el.open),true);
   // 窄螢幕選單會覆蓋 h1；用下方工作標題實際點擊選單外，不強制穿透遮擋。
   const outsideHeading=page.locator('#original-work .work-heading h2');
   // 置中避開教師模式窄螢幕的底部工具列。
   await outsideHeading.evaluate(el=>el.scrollIntoView({block:'center'}));
   assert.equal(await outsideHeading.evaluate(el=>{
    const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return !!hit&&el.contains(hit)&&!hit.closest('#account');
   }),true,label+' 點擊位置確實在選單外');
   await outsideHeading.click();assert.equal(await page.locator('#account').evaluate(el=>el.open),false);
   await toggle.click();await buttons.first().focus();await page.keyboard.press('Escape');
   assert.equal(await page.locator('#account').evaluate(el=>el.open),false);assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
   await toggle.click();await page.locator('html').dispatchEvent('click');assert.equal(await page.locator('#account').evaluate(el=>el.open),false);
   if(state!=='teacher'){
    for(const status of ['pending','guest-pending','guest-storage']){
     await page.evaluate(st=>mockSync(st),status);assert.equal(await page.locator('#b-retry').isVisible(),true);await auditHeader(page,label+' retry '+status);
    }
    await page.click('#b-retry');assert.equal(await page.locator('#b-retry').isVisible(),false);assert.match(await page.locator('#sync').textContent(),/已上傳/);
    await page.click('#account-toggle');await page.click('#b-logout');
    assert.equal(await page.locator('#gate').isVisible(),true);assert.equal(await page.locator('#b-header-login').isVisible(),true);
    assert.equal(await page.evaluate(()=>mockEvents.at(-1)),state==='student'?'logout':'leaveGuest');
   }else{await page.click('#account-toggle');await page.click('#b-swap');assert.equal(await page.locator('#tbar').isVisible(),false);assert.equal(await page.locator('#b-header-login').isVisible(),true)}
  }
  assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 }finally{await context.close()}
});
