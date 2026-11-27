import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {Element} from './activity-dom.mjs';
export const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
export const plain=x=>JSON.parse(JSON.stringify(x));
export const source=()=>[...read('115-g9/u2-06/index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
export function setup({teacher=true,stored=new Map(),enabled=false}={}){
 const body=new Element('body'),submitted=[];
 const c=vm.createContext({document:{body,getElementById:id=>body.querySelector('#'+id)},window:{},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},sessionStorage:{setItem(){}},TEACHER:{remembered:()=>teacher,remember(){}},YBS:{enabled:()=>enabled,profile:()=>null,guest(){},button(){},flush(){},status(){},submit:x=>submitted.push(x)}});
 const run=s=>vm.runInContext(s,c,{timeout:5000});
 run(read('assets/shell.js')+'\n'+source());
 return {run,body,stored,submitted,get:id=>body.querySelector('#'+id),generate:(r,n)=>plain(run(`Q.generate(${r},${n})`))};
}
export function model(){const c=vm.createContext({SHELL:cfg=>cfg});vm.runInContext(source()+';globalThis.model=SheetModel',c);return c.model;}
// 與頁面模型分開的驗算，不使用 solution/check/reasons/dedup/filter。
export function oracle(i){
 const bad=r=>r.cells[3]!=='同意'||r.cells[4]==='未滿18歲'&&r.cells[5]!=='已取得'||r.cells.slice(0,9).some(v=>v==='')||!Number.isInteger(r.cells[8])||r.cells[8]<1||r.cells[8]>5;
 const clean=i.rows.filter(r=>!bad(r)),seen=new Set(),kept=clean.filter(r=>{const key=JSON.stringify(r.cells.slice(1));if(seen.has(key))return false;seen.add(key);return true});
 const selected=i.rows.filter(r=>r.cells[2]===i.group&&r.cells[7].split('、').includes(i.slot));
 const counts=['入口引導','遊戲體驗','舞台支援'].map(j=>selected.filter(r=>r.cells[6]===j).length);
 return {invalid:i.rows.filter(bad).map(r=>r.id),clean,kept,selected,counts};
}
export const fixtureRows=()=>{
 const base=(code,job='入口引導',slot='下午',group='動漫組')=>['09:00',code,group,'同意','已滿18歲','不適用',job,slot,3,''];
 const a=base('V01'),b=base('V02','遊戲體驗'),c=base('V03','遊戲體驗'),d=base('V04','舞台支援'),e=base('V05','舞台支援');
 const cells=[a,b,c,d,e,base('V01','入口引導','上午'),base('V06','遊戲體驗','上午'),base('V07','舞台支援','上午'),[...a],[...b]];
 return cells.map((c,k)=>({id:'fixture-'+k,origin:k+2,cells:c.map((v,j)=>j===0?'09:'+String(k).padStart(2,'0'):v)}));
};
