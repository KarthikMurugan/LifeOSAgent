const {chromium}=await import(process.env.DAYGLOW_PLAYWRIGHT||'playwright');
import assert from 'node:assert/strict';
const base=process.env.DAYGLOW_TEST_URL||'http://127.0.0.1:8001';
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForFunction(()=>!document.querySelector('#plan').disabled);
 assert.equal(await page.locator('.nav-icon').count(),12);assert.equal(await page.locator('#wellness-today').count(),0);
 await page.locator('button[data-view="wellness"]').click();assert.equal(await page.locator('#wellness-view').isVisible(),true);assert.equal(await page.locator('.calendar').isVisible(),false);
 await page.locator('#sleep-hours').fill('7.25');await page.locator('[data-wellness-form="sleep"] button').click();
 await page.locator('#wellness-mood').selectOption('Good');await page.locator('#wellness-reflection').fill('PRIVATE-REFLECTION-<script>never execute</script>');await page.locator('[data-wellness-form="mind"] button').click();
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#plan').disabled);assert.equal(await page.locator('#workspace-panels').isVisible(),false);
 await page.locator('button[data-view="wellness"]').click();assert.equal(await page.locator('#sleep-hours').inputValue(),'7.25');assert.match(await page.locator('#wellness-reflection').inputValue(),/PRIVATE-REFLECTION/);
 await page.locator('#wellness-view [data-wellness="add"]').click();assert.equal(await page.locator('[data-view=all] small').textContent(),'8');
 const request=page.waitForRequest(r=>r.url().endsWith('/api/agent/plan'));const response=page.waitForResponse(r=>r.url().endsWith('/api/agent/plan'));
 await page.locator('#plan').click();const body=(await request).postDataJSON();assert.equal(body.home.length,4);assert.ok(body.home.some(t=>t.id==='wellness-walk'));assert.doesNotMatch(JSON.stringify(body),/PRIVATE-REFLECTION|7\.25|mood|sleep|reflection/);
 const result=(await (await response).json()).plan;assert.equal(result.blocks.length,8);assert.ok(result.blocks.some(b=>b.id==='wellness-walk'));
 await page.waitForFunction(()=>!document.querySelector('#plan').disabled);assert.match(await page.locator('#schedule').innerText(),/Wellness/);
 await page.locator('button[data-view="wellness"]').click();await page.locator('#wellness-view [data-wellness="done"]').click();const again=page.waitForResponse(r=>r.url().endsWith('/api/agent/plan'));await page.locator('#plan').click();const next=(await (await again).json()).plan;assert.equal(next.blocks.length,7);assert.ok(!next.blocks.some(b=>b.id==='wellness-walk'));await page.waitForFunction(()=>!document.querySelector('#plan').disabled);
 await page.locator('button[data-view="wellness"]').click();for(const area of ['Movement','Rest','Mind','Nutrition','Care','Overview'])await page.locator('[data-area="'+area+'"]').click();
 await page.screenshot({path:'/private/tmp/dayglow-wellness-desktop.png',fullPage:true,animations:'disabled'});
 for(const width of [320,390,768]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.locator('[data-wellness="clear"]').click();assert.equal(await page.locator('#sleep-hours').inputValue(),'');assert.equal(await page.locator('#wellness-reflection').inputValue(),'');assert.equal(await page.evaluate(()=>localStorage.getItem('dayglow-wellness-v1')),null);assert.deepEqual(errors,[]);
 console.log('Wellness passed: local persistence, private entries excluded from planning, walk scheduled and completed, delete data, navigation, icons and responsive layout.');
}finally{await browser.close();}
