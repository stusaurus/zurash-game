import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '@playwright/test';
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const p=path.join(root,req.url==='/'?'index.html':req.url);
 try{res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':p.endsWith('.jpeg')?'image/jpeg':'text/html');res.end(fs.readFileSync(p));}catch{res.statusCode=404;res.end();}
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const results=[];
try{
 for(const version of ['baseline','candidate'])for(const fault of ['postMessage','invalid','reset','cancel']){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  if(version==='baseline')for(const file of ['src/app.js','index.html','style.css']){
   const content=execFileSync('git',['show',`main:${file}`],{encoding:'utf8'});
   await page.route('**/'+(file==='index.html'?'':file),route=>route.fulfill({body:content,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}));
  }
  if(fault!=='cancel')await page.addInitScript(fault=>{
   window.terminated=0;
   window.Worker=class{
    postMessage(data){
     if(fault==='postMessage')throw Error('fixture send failure');
     if(fault==='invalid')setTimeout(()=>this.onmessage?.({data:{id:data.id,action:{wall:{wall:99,to:-1},dir:9}}}),20);
    }
    terminate(){window.terminated++;}
   };
  },fault);
  await page.goto(url);
  if(fault==='cancel'){
   await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('search');await page.locator('#setupDialog .close').click();
   await page.locator('#skip').click();
   results.push({version,fault,activeDifficulty:await page.locator('#scores').innerText(),errors});
  }else{
   await page.locator('#skip').click();await page.locator('#directions button:not([disabled])').first().click();
   await page.waitForTimeout(350);
   if(fault==='reset'){await page.locator('#settings').click();await page.locator('#start').click();}
   await page.waitForTimeout(1400);
   results.push({version,fault,turn:await page.locator('#turnCount').innerText(),terminated:await page.evaluate(()=>window.terminated),errors});
  }
  await page.close();
 }
 fs.writeFileSync('reports/recovery-comparison.json',JSON.stringify({notes:'Real Chromium with injected Worker faults. 1.75 seconds after human move; baseline postMessage watchdog may recover after 6 seconds, invalid action clears watchdog and stalls. Baseline assets loaded from main commit, candidate from worktree.',results},null,2)+'\n');console.log(results);
}finally{await browser.close();server.close();}
