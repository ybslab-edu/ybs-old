import {previewOrigin, previewPath, readPreview} from './fixtures/preview-site.mjs';
// 真實 HTML/CSS 全關卡驗收；所有請求由記憶體路由回覆，僅使用合成班座。
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),origin=previewOrigin;
const shots=process.env.FONTSIZE_SHOTS_DIR||'/tmp/ybs-fontsize-shots';
const activities=readdirSync(resolve(root,'115-g9')).filter(dir=>/^u\d+-\d+$/.test(dir))
 .filter(dir=>readFileSync(resolve(root,'115-g9',dir,'index.html'),'utf8').includes('assets/shell.js'));
const examples=['u2-04','u2-05','u2-06','u2-07'];
let browser;
before(async()=>{mkdirSync(shots,{recursive:true});browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
async function session(width){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'}),outside=[],errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(origin).origin){outside.push(url.href);return route.abort()}
  if(['/assets/login.js','/assets/lock.js','/assets/fullrev-config.js'].includes(previewPath(url.pathname)))return route.fulfill({contentType:'text/javascript',body:'// offline'});
  if(previewPath(url.pathname)==='/assets/teacher.js')return route.fulfill({contentType:'text/javascript',body:'window.TEACHER={remembered:()=>false,remember(){}}'});
  try{
   const path=resolve(root,'.'+previewPath(url.pathname)+(previewPath(url.pathname).endsWith('/')?'index.html':''));assert.ok(path.startsWith(resolve(root)+sep));
   const ext=extname(path);let body=await readPreview(route,path);
   if(ext==='.html')body=Buffer.from(body.toString().replace(/<link[^>]+href=["']https?:\/\/[^>]+>/g,''));
   if(ext==='.css')body=Buffer.from(body.toString().replace(/^@import.*$/gm,''));
   return route.fulfill({contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[ext]||'application/octet-stream',body});
  }catch{return route.fulfill({status:404,body:''})}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
 return {context,page,outside,errors};
}
async function audit(page,label,taskVisible=true){
 const result=await page.evaluate(()=>{
  const small=[],clipped=[];
  for(const el of document.body.querySelectorAll('*')){
   if(!el.checkVisibility({checkVisibilityCSS:true})||el.closest('.shell-sr-only'))continue;
   const text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
   if(!text&&!el.matches('input:not([type=checkbox]):not([type=radio]),select,textarea'))continue;
   if(el.matches('script,style,option'))continue;
   const s=getComputedStyle(el);
   if(parseFloat(s.fontSize)<17)small.push([el.tagName,el.id,el.className,s.fontSize,text.slice(0,35)]);
   if(el.matches('button')){
    const box=el.getBoundingClientRect(),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
     const node=walker.currentNode;if(!node.textContent.trim()||node.parentElement.closest('.shell-sr-only'))continue;
     const range=document.createRange();range.selectNodeContents(node);
     if([...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1))clipped.push(el.textContent);
    }
   }
  }
  const rounds=document.querySelector('#rounds'),order=document.querySelector('#task-instructions');
  const roundsVisible=rounds.checkVisibility({checkVisibilityCSS:true}),taskVisible=order.checkVisibility({checkVisibilityCSS:true});
  const a=rounds.getBoundingClientRect(),b=order.getBoundingClientRect();
  // 入口的任務在 [hidden] #main 內，矩形為全零；只有兩者可見才有重疊可言。
  return {small,clipped,roundsVisible,taskVisible,overflow:document.documentElement.scrollWidth>innerWidth,
   overlap:roundsVisible&&taskVisible&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top};
 });
 assert.deepEqual(result,{small:[],clipped:[],roundsVisible:true,taskVisible,overflow:false,overlap:false},label+'：17px 下限、頁面寬度、按鈕與任務說明');
}
for(const width of [360,560,1280])test(`全站字級與全部關卡版面 ${width}px`,{timeout:180000},async()=>{
 const {context,page,outside,errors}=await session(width);let rounds=0;
 try{
  for(const dir of activities){
   await page.goto(`${origin}/115-g9/${dir}/`);
   await audit(page,dir+' 入口',false);
   await page.locator('#in-cls').fill('999');await page.locator('#in-seat').fill('1');
   await page.locator('#g-next').click();await page.locator('#g-go').click();
   const n=await page.locator('#rounds button').count();
   for(let i=0;i<n;i++){
    await page.evaluate(i=>APP.load(i),i);await page.mouse.move(0,0);
    await audit(page,`${dir} 第 ${i+1} 關`);
    if(dir==='u5-08'&&i===3&&width===360){
     const table=await page.locator('#stage .tblwrap').evaluate(el=>{
      el.scrollLeft=el.scrollWidth;
      return {width:el.clientWidth,content:el.scrollWidth,scrolled:el.scrollLeft};
     });
     assert.ok(table.content>table.width&&table.scrolled>0,'u5-08 七欄表格必須能在自身容器橫向捲動');
     console.log(`u5-08 360px 第 4 關表格：${JSON.stringify(table)}`);
    }
    if(i===0&&examples.includes(dir)&&width!==560){
     await page.evaluate(()=>scrollTo(0,0));
     await page.screenshot({path:resolve(shots,`${dir}-${width}-first-screen.png`)});
     await page.screenshot({path:resolve(shots,`${dir}-${width}-round-1.png`),fullPage:true});
    }
    // 展開表格與輔助資訊，補驗非預設可見的小字及容器捲動。
    await page.locator('#stage details').evaluateAll(els=>els.forEach(el=>el.open=true));
    await audit(page,`${dir} 第 ${i+1} 關展開`);rounds++;
   }
  }
  assert.equal(activities.length,30);assert.equal(rounds,121);assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
  console.log(`${width}px：30 活動／121 關，文字 ≥17px、無頁面溢出、按鈕完整、關卡列與任務不重疊`);
 }finally{await context.close()}
});
