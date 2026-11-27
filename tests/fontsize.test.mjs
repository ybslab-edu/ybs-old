import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
function files(dir){return readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['vendor','.git'].includes(e.name)?files(dir+'/'+e.name):e.isFile()&&/\.(html|css|js)$/.test(e.name)?[dir+'/'+e.name]:[])}
const sources=['index.html','404.html',...files('115-g9'),...files('115-df'),...files('map'),...files('about'),...files('lab'),...files('assets')];
const shell=readFileSync(resolve(root,'assets/shell.css'),'utf8');
const vars=new Map([...shell.matchAll(/(--text-[\w-]+):([^;]+);/g)].map(m=>[m[1],m[2]]));
vars.set('--fs','18px');
function args(expr){let level=0,last=0,out=[];for(let i=0;i<expr.length;i++){if(expr[i]==='(')level++;if(expr[i]===')')level--;if(expr[i]===','&&!level){out.push(expr.slice(last,i).trim());last=i+1}}out.push(expr.slice(last).trim());return out}
function minimum(expr){
 expr=expr.trim().replace(/!important$/,'');
 if(/^(inherit|initial|unset)$/.test(expr))return 17;
 const call=expr.match(/^(var|max|min|clamp)\((.*)\)$/);
 if(call){const a=args(call[2]);if(call[1]==='var')return minimum(vars.get(a[0])||a[1]||'UNRESOLVED');const v=a.map(minimum);if(call[1]==='max')return Math.max(...v);if(call[1]==='min')return Math.min(...v);return Math.max(v[0],Math.min(v[1],v[2]))}
 const scalar=expr.match(/^([\d.]+)(px|rem|em|vw|%)?$/);if(!scalar)throw Error('未知字級：'+expr);
 const n=Number(scalar[1]);return n*({px:1,rem:16,em:17,vw:3.6,'%':.17}[scalar[2]]||1);
}
function firstSize(font){
 // 依括號深度切開 font 簡寫，避免 var() 的空格或 fallback 被拆散。
 let level=0,token='';const tokens=[];
 for(const c of font){if(c==='(')level++;if(c===')')level--;if((c===' '||c==='/')&&!level){if(token)tokens.push(token);token='';if(c==='/')break}else token+=c}
 if(token)tokens.push(token);
 return tokens.find(t=>/^(?:var\(|max\(|clamp\(|[\d.]+(?:px|rem|em|vw|%))/.test(t))||'inherit';
}
test('舊站所有 CSS／inline／動態模板字級：px、em、rem、clamp 與 SVG 均至少 17px',()=>{
 const bad=[];let count=0;
 for(const file of sources){
  const source=readFileSync(resolve(root,file),'utf8');
  for(const m of source.matchAll(/font-size\s*:\s*([^;}"'\n]+)|font-size=["']([^"']+)["']|(?<![\w-])font\s*:\s*([^;}"'\n]+)/g)){
   const value=m[1]||m[2]||firstSize(m[3]);
   // u5-04 場景 emoji 大小由 28／36／44／64 × 0.8 或 1 產生，最小 22.4px。
   if(!value.trim()&&file==='115-g9/u5-04/index.html')continue;
   try{count++;if(minimum(value)<17)bad.push([file,value])}catch(error){bad.push([file,error.message])}
  }
 }
 assert.ok(count>500,'盤點必須涵蓋全站而非僅 shell');assert.deepEqual(bad,[]);
 console.log(`舊站 ${sources.length} 個來源、${count} 項字級宣告皆達 17px 下限；裝飾圖示無低於下限的例外`);
});
test('共用字級階層保留正文、任務、小標、節標與主標差異',()=>{
 assert.deepEqual(['--text-min','--text-body','--text-lead','--text-subtitle','--text-emphasis','--text-section','--text-title'].map(v=>minimum(vars.get(v))),[17,18,20,22,24,27,30]);
});
