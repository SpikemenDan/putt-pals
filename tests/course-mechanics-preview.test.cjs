// Explicit development-server check; production builds exclude fixture previews.
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
(async()=>{
  const base=process.env.PP_PREVIEW_URL || 'http://127.0.0.1:5175';
  const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base+'/tests/fixtures/course-mechanics/preview.html');
    await page.locator('#controls input').first().waitFor();
    for(const kind of ['wedge','bouncer','fan','vortex','portal']) {
      await page.selectOption('#kind',kind);await page.click('#launch');
      await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Active ball sunk'),{},{timeout:30000});
      assert.match(await page.locator('#status').textContent(),/Stripped ball: play/);
      console.log('PASS Chromium mechanic proof: '+kind);
    }
    await page.selectOption('#kind','vortex');await page.click('#core');
    await page.click('#export');const saved=await page.inputValue('#overrides');
    assert.equal(Object.keys(JSON.parse(saved).courseMechanics).length,14);
    await page.fill('#overrides','{"courseMechanics":{"fanAcceleration":-1}}');await page.click('#import');
    assert.match(await page.locator('#status').textContent(),/Import rejected/);
    await page.fill('#overrides',saved);await page.click('#import');
    assert.match(await page.locator('#status').textContent(),/Validated overrides imported/);
    await page.click('#defaults');await page.selectOption('#kind','wedge');
    await page.evaluate(()=>window.scrollTo(0,0));
    if(process.env.PP_PREVIEW_SCREENSHOT)await page.screenshot({path:process.env.PP_PREVIEW_SCREENSHOT,fullPage:true});
    assert.deepEqual(errors,[],'preview must have no browser errors');
    console.log('PASS Chromium 3D preview: all five shared-physics shots, core placement, import/export/reset and browser errors.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
