import {previewOrigin, previewPath, readPreview} from './preview-site.mjs';
// 真實靜態資源搭配合成登入／attempts；不開伺服器，所有請求由記憶體回覆。
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../../',import.meta.url));
export const origin=previewOrigin;
export const taskRoot='/home/teacher/projects/console/tasks/ybs-u206-sheet-20261127';
export async function headerSession(browser,width,state='none'){
 const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
 const errors=[],outside=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==new URL(origin).origin){outside.push(url.href);return route.abort()}
  if(['/assets/lock.js','/assets/fullrev-config.js'].includes(previewPath(url.pathname)))return route.fulfill({contentType:'text/javascript',body:'// offline preview'});
  if(previewPath(url.pathname)==='/assets/teacher.js')return route.fulfill({contentType:'text/javascript',body:`window.TEACHER={remembered:()=>${state==='teacher'},remember(){}};`});
  if(previewPath(url.pathname)==='/assets/login.js')return route.fulfill({contentType:'text/javascript',body:`
   let mockProfile=null,mockStatus=()=>{};
   window.mockEvents=[];
   window.YBS={enabled:()=>true,profile:()=>mockProfile,
    button(el,callback){el.innerHTML='<button class="btn" id="mock-signin" type="button">登入合成帳號</button>';el.querySelector('button').onclick=()=>{mockProfile={uid:'synthetic-header',email:'header@example.invalid'};callback(mockProfile)}},
    whoami:async()=>({ok:true,student:{cls:999,seat:1}}),
    status(fn){mockStatus=fn},flush(){mockStatus('ok')},guest(){mockStatus('guest-pending')},
    logout(){mockEvents.push('logout');mockProfile=null},leaveGuest(){mockEvents.push('leaveGuest')},
    retry(){mockEvents.push('retry');mockStatus('ok')},submit(){throw Error('預覽不得上傳作答')},
    firebaseSession:async()=>({auth:{currentUser:mockProfile},db:{collection(path){
     if(path!=='ybsCourses/115-g9/attempts')throw Error('unexpected collection');
     return {where(field,op,uid){if(field!=='uid'||op!=='=='||uid!==mockProfile.uid)throw Error('unexpected query');
      return {get:async()=>({metadata:{fromCache:false},docs:[]})}}}
    }}})};
   window.mockSync=state=>mockStatus(state);`});
  try{
   const path=previewPath(url.pathname)==='/header-mock.html'?resolve(taskRoot,'header/mock.html'):resolve(root,'.'+previewPath(url.pathname)+(previewPath(url.pathname).endsWith('/')?'index.html':''));
   assert.ok(path===resolve(taskRoot,'header/mock.html')||path.startsWith(resolve(root)+sep));
   const ext=extname(path);let body=previewPath(url.pathname)==='/header-mock.html'?readFileSync(path):await readPreview(route,path);
   if(ext==='.html')body=Buffer.from(body.toString().replace(/<link[^>]+href=["']https?:\/\/[^>]+>/g,''));
   if(ext==='.css')body=Buffer.from(body.toString().replace(/^@import.*$/gm,''));
   return route.fulfill({contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'})[ext]||'application/octet-stream',body});
  }catch(error){errors.push(error.message);return route.fulfill({status:404,body:''})}
 });
 await context.addInitScript(()=>{
  for(let week=0;week<=30;week++)for(const suffix of ['',':sheet-v2'])localStorage.setItem(`it9:w${week}:999-1${suffix}`,JSON.stringify({mask:2,tries:Array(6).fill(0),time:1}));
 });
 const page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 return {context,page,errors,outside};
}
export async function enterHeaderState(page,dir,state){
 await page.goto(`${origin}/115-g9/${dir}/`);
 if(state==='student'){await page.click('#mock-signin');await page.click('#g-isme');await page.waitForFunction(()=>document.querySelector('#xp-total').textContent==='0 XP')}
 if(state==='guest'){await page.click('#g-manual');await page.fill('#in-cls','999');await page.fill('#in-seat','1');await page.click('#g-next');await page.click('#g-go')}
 await page.locator('#activity-header').waitFor({state:'visible'});
 if(state!=='none')await page.evaluate(()=>APP.load(0));
 await page.evaluate(()=>scrollTo(0,0));
 await page.mouse.move(0,0);
}
export async function auditHeader(page,label){
 const result=await page.evaluate(()=>{
  const clipped=[],small=[],outlines=[];
  for(const el of document.querySelectorAll('#activity-header *')){
   if(!el.checkVisibility({checkVisibilityCSS:true}))continue;
   const box=el.getBoundingClientRect(),style=getComputedStyle(el);
   const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
   if([...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&parseFloat(style.fontSize)<17)small.push(el.id||el.tagName);
   if(el.matches('button,summary'))while(walker.nextNode()){
    const node=walker.currentNode;if(!node.textContent.trim()||!node.parentElement.checkVisibility({checkVisibilityCSS:true}))continue;
    const range=document.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(r=>r.left<box.left-1||r.right>box.right+1||r.top<box.top-1||r.bottom>box.bottom+1))clipped.push(el.id||el.textContent);
   }
   if(el.matches(':focus-visible')&&parseFloat(style.outlineOffset)>=0)outlines.push(el.id||el.tagName);
  }
  const menu=document.querySelector('#account-menu'),r=menu.getBoundingClientRect();
  const menuFits=!document.querySelector('#account').open||(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&menu.scrollWidth<=menu.clientWidth&&menu.scrollHeight<=menu.clientHeight);
  return {overflow:document.documentElement.scrollWidth>innerWidth,clipped,small,outlines,menuFits,clip:getComputedStyle(document.querySelector('#activity-header')).clipPath};
 });
 assert.deepEqual(result,{overflow:false,clipped:[],small:[],outlines:[],menuFits:true,clip:'none'},label);
}
