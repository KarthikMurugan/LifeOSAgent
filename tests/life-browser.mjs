const {chromium}=await import(process.env.DAYGLOW_PLAYWRIGHT||'playwright');
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.DAYGLOW_TEST_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>!document.querySelector('#plan').disabled);
 for(const view of ['goals','notes','habits','journal','finance','home']){
  await page.locator(`button[data-view="${view}"]`).click();assert.equal(await page.locator('#life-view').isVisible(),true);
  await page.locator('#life-title').fill('PRIVATE '+view+' <b>entry</b>');
  if(['notes','journal'].includes(view))await page.locator('#life-body').fill('Private text <script>bad()</script>');
  if(view==='finance'){await page.locator('[name=amount]').fill('12.50');await page.locator('[name=direction]').selectOption('-1');}
  await page.locator('#life-form button').click();assert.equal(await page.locator('.life-entry').count(),1);
  if(['goals','habits'].includes(view))await page.locator('[data-check]').check();
  if(view==='finance')assert.match(await page.locator('.finance-total').textContent(),/-12.50/);
  if(view==='home')assert.equal(await page.locator('#home-tasks').isVisible(),true);
 }
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan').disabled);
 assert.equal(await page.locator('#life-view').isVisible(),false);
 await page.locator('button[data-view=habits]').click();assert.equal(await page.locator('[data-check]').isChecked(),true);
 await page.locator('button[data-view=entertainment]').click();assert.equal(await page.locator('.leisure-card').count(),4);
 for(const filter of ['Watch','Listen','Read','Go out']){await page.locator(`[data-filter="${filter}"]`).click();assert.equal(await page.locator('.leisure-card').count(),1);}
 await page.locator('[data-filter=All]').click();await page.locator('[data-save=listen]').click();
 await page.locator('[data-leisure-plan=watch]').click();assert.equal(await page.locator('button[data-view=all] small').textContent(),'8');
 const pending=page.waitForResponse(r=>r.url().endsWith('/api/agent/plan'));const req=page.waitForRequest(r=>r.url().endsWith('/api/agent/plan'));await page.locator('#plan').click();
 const body=(await req).postDataJSON();assert.equal(body.day_end,1320);assert.doesNotMatch(JSON.stringify(body),/PRIVATE|Private/);
 const plan=(await (await pending).json()).plan;assert.ok(plan.blocks.some(x=>x.id==='leisure-watch'&&x.start>=1080));
 await page.waitForFunction(()=>!document.querySelector('#plan').disabled);assert.match(await page.locator('#schedule').innerText(),/Entertainment/);
 await page.locator('button[data-view=entertainment]').click();await page.locator('[data-leisure-plan=watch]').click();assert.equal(await page.locator('button[data-view=all] small').textContent(),'7');
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan').disabled);await page.locator('button[data-view=entertainment]').click();assert.equal(await page.locator('[data-save=listen]').getAttribute('aria-pressed'),'true');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});for(const view of ['entertainment','finance','notes','home']){await page.locator(`button[data-view=${view}]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${view} at ${width}`);}}
 await page.locator('button[data-view=notes]').click();await page.locator('[data-remove]').click();assert.equal(await page.locator('.life-entry').count(),0);
 assert.deepEqual(errors,[]);console.log('Life sections passed: entries, persistence, private data isolation, filters, saves, evening scheduling, removal and responsive layouts.');
}finally{await browser.close();}
