const {chromium}=require('playwright');
const fs=require('fs');
(async()=>{
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
fs.mkdirSync('tmp/browser-check', {recursive:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8317/network.html');
await page.waitForFunction(()=>window.graphSnapshot?.().simulation>=240);
let s=await page.evaluate(()=>graphSnapshot());
if(s.nodes!==269||s.edges!==345||s.visible!==269)throw Error('incomplete graph '+JSON.stringify(s));
console.log('All 269 nodes, 345 relationships loaded');
for(const q of ['amount','change','breakdown','owner']){
 await page.selectOption('#question',q);await page.click('#all-path');
 s=await page.evaluate(()=>graphSnapshot());
 if(s.visible!==269||!s.highlightedEdges)throw Error('question '+q+' '+JSON.stringify(s));
 console.log(q+': '+s.highlightedNodes+' nodes / '+s.highlightedEdges+' edges');
}
await page.selectOption('#question','');
await page.fill('#search','서울 청년수당');await page.locator('#search-results button').first().click();
s=await page.evaluate(()=>graphSnapshot());if(s.selected!=='서울 청년수당')throw Error('search selection');
await page.click('#local');s=await page.evaluate(()=>graphSnapshot());if(s.visible>=269||s.visible<2)throw Error('local filter');
await page.click('#show-all');
await page.locator('[data-type="LineItem"]').uncheck();s=await page.evaluate(()=>graphSnapshot());if(s.visible!==162)throw Error('type filter '+s.visible);
await page.click('#show-all');await page.click('#close-detail');await page.fill('#search','');
await page.screenshot({path:'tmp/browser-check/desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.click('#fit');await page.screenshot({path:'tmp/browser-check/mobile.png',fullPage:true});
await page.click('#panel-toggle');await page.fill('#search','마음건강');await page.locator('#search-results button').first().click();
if(!await page.locator('#detail').isVisible())throw Error('mobile detail');
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
if(errors.length)throw Error(errors.join('\n'));
await browser.close();console.log('Search, neighbors, filters, questions, desktop/mobile: PASS');
})().catch(e=>{console.error(e);process.exit(1)});
