// Regression setup follows the real arrival flow, then explicitly travels to
// Town Square so older scenario tests retain their intended starting context.
module.exports=async function completeArrival(page,{square=true,start='scratch',preset=null}={}){
 await page.locator('#setup-form button[type=submit]').click();
 await page.locator('#arrival-interview-next').click();if(preset){await page.locator('#arrival-preset').locator('xpath=ancestor::details').locator('summary').click();await page.locator('#arrival-preset').selectOption(preset);}await page.locator('#arrival-lens-next').click();
 await page.locator('[name=arrival-start][value='+start+']').check();await page.locator('#arrival-create').click();
 await page.waitForFunction(()=>!document.querySelector('#arrival-create')?.closest('.access-overlay:not([hidden])')&&document.querySelector('#sheet')?.hidden);
 if(!square)return;
 if(await page.evaluate(()=>!!window.__atlasPage)){
  await page.locator('[data-arrival-place=square]').click();for(let i=0;i<8&&await page.locator('[data-enter]').count();i++)await page.locator('[data-enter]').click();
 }else{
  await page.evaluate(()=>__atlas.go('square'));for(let i=0;i<8&&await page.locator('[data-preview]').count();i++){await page.locator('[data-preview]').first().click();await page.locator('[data-confirm]').click();}
  await page.locator('#travel-go').click();await page.waitForFunction(()=>!__atlas.travel.active);await page.evaluate(()=>{atlasHud.queue=[];atlasHud.present();});
 }
};
