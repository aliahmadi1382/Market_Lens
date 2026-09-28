import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEbaySearch,ebaySearchUrl,enrichEbayListing,resolveEbaySeller} from '../lib/market/ebay.ts';
import {readPublic,PublicPageError,isChallenge} from '../lib/market/public-http.ts';
import {collectSource} from '../lib/market/collectors.ts';
import {SELLERS,COLLECTION_SOURCES,eligible} from '../lib/market/model.ts';
const source=SELLERS.find(s=>s.name==='u.s.autoseatcover')!;
const title='2003-2007 Cadillac CTS Driver Bottom Black Leather Seat Cover';
const item=(id:string,text=title,priceText='$120.00',currency='USD',seller='u.s.autoseatcover')=>({id,text,priceText,currency,seller});
function fixture(items=[item('123456789012')],next=false,store=true){
 const models=items.map(r=>({listingId:r.id,title:{textSpans:[{text:r.text}]},displayPrice:{value:{value:120,currency:r.currency},textSpans:[{text:r.priceText}]},__search:{sellerInfo:{text:{textSpans:[{text:r.seller+' (300) 99%'}]}},normalizedCondition:{text:'Brand New'}}}));
 const cards=items.map(r=>`<${store?'article':'li'} class="${store?'':'s-item'}" data-testid="ig-${r.id}"><a href="https://www.ebay.com/itm/${r.id}"><span class="${store?'str-item-card__property-title':'s-item__title'}">${r.text}</span></a><span class="${store?'str-item-card__property-displayPrice':'s-item__price'}">${r.priceText}</span></${store?'article':'li'}>`).join('');
 return `<title>Search</title><script>window.data=[].concat(${JSON.stringify({storeName:'usautoseatcover',searchAction:{URL:'https://www.ebay.com/sch/i.html?_ssn=u.s.autoseatcover&store_name=usautoseatcover'},models})});</script><section ${store?'class="str-items-grid__container"':'id="srp-river-results"'}>${cards}</section>${next?'<a class="pagination__next" href="?page=2">Next</a>':''}`;
}
test('every classified account has a source; US Auto Nation has website and eBay',()=>{
 assert.equal(SELLERS.length,18);assert.equal(COLLECTION_SOURCES.length,19);
 for(const s of SELLERS)assert(COLLECTION_SOURCES.some(x=>x.seller===s.name&&x.channel!=='unconfigured'));
 assert.deepEqual(COLLECTION_SOURCES.filter(s=>s.seller==='US Auto Nation').map(s=>s.channel),['website','ebay']);
 assert.equal(SELLERS.find(s=>s.name==='AutoChampOfTexas')!.group,'reference');
});
test('eBay broad discovery covers all expanded years without requiring literal range endpoints',()=>{
 const url=new URL(ebaySearchUrl(source,'Cadillac CTS 2003–2007'));assert.equal(url.searchParams.get('_nkw'),'Cadillac CTS');
 const html=fixture([item('123456789012'),item('123456789013','2008 Cadillac CTS Driver Bottom Black Leather Seat Cover'),item('123456789014','2009 Cadillac CTS Driver Bottom Black Leather Seat Cover')]);
 const r=parseEbaySearch(html,source,'Cadillac CTS 2003–2007',source.ebay!.url);assert.equal(r.listings.length,2);assert.equal(r.listings[0].price,120);assert.equal(r.listings[0].group,'own');
});
test('price ranges stay visible as research evidence without entering exact pricing',()=>{
 const r=parseEbaySearch(fixture([item('123456789012',title,'$120.00 to $490.00')]),source,'Cadillac CTS 2003-2007',source.ebay!.url).listings[0];assert.equal(r.price,null);assert.match(r.displayedPrice!,/490/);assert.equal(eligible({...r,group:'primary'}),false);
});
test('eBay currency comes from listing data, not the host country',()=>{
 const r=parseEbaySearch(fixture([item('123456789012',title,'DKK 120.00','DKK')]),source,'Cadillac CTS 2003-2007',source.ebay!.url).listings[0];assert.equal(r.currency,'DKK');assert.equal(r.price,120);
});
test('seller search cannot misclassify other sellers recommended by eBay',()=>{
 const s={...source,ebay:{url:'https://www.ebay.com/sch/i.html?_ssn=u.s.autoseatcover',sellerId:'u.s.autoseatcover'}};
 const r=parseEbaySearch(fixture([item('123456789012'),item('123456789013',title,'$120.00','USD','other-seller')],false,false),s,'Cadillac CTS 2003-2007',s.ebay.url);assert.equal(r.listings.length,1);assert.equal(r.unverified,1);
});
test('unrecognized HTML and security checks never become zero-result successes',()=>{
 assert.throws(()=>parseEbaySearch('<title>Security Measure | eBay</title>',source,'Cadillac CTS 2003',source.ebay!.url),PublicPageError);
 assert.throws(()=>parseEbaySearch('<title>Something went wrong</title>',source,'Cadillac CTS 2003',source.ebay!.url));
});
test('public HTTP uses an edge-compatible redirect mode and does not follow challenges',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_,init)=>{calls++;assert.equal(init?.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://www.ebay.com/splashui/captcha'}})};
 try{await assert.rejects(()=>readPublic(source.ebay!.url,{domain:'www.ebay.com'}),(e:any)=>e.outcome==='blocked');assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('eBay collector reports blocked rather than no matches and makes no fallback requests',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;return new Response('',{status:403})};
 try{const r=await collectSource('ebay:US Auto Nation','Cadillac CTS 2003-2007');assert.equal(r.source.outcome,'blocked');assert.equal(r.source.status,'error');assert.equal(r.source.channel,'ebay');assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('later page failure preserves observed listings but marks coverage incomplete',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>++calls===1?new Response(fixture([item('123456789012')],true)):new Response('',{status:403});
 try{const r=await collectSource('ebay:u.s.autoseatcover','Cadillac CTS 2003-2007');assert.equal(r.listings.length,1);assert.equal(r.source.status,'partial');assert.equal(r.source.outcome,'blocked');assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('detail enrichment is restricted to the same canonical listing',()=>{
 const row=parseEbaySearch(fixture(),source,'Cadillac CTS 2003',source.ebay!.url).listings[0];const html='<link rel="canonical" href="https://www.ebay.com/itm/999999999999"><h1 class="x-item-title__mainTitle">Different item</h1>';
 assert.equal(enrichEbayListing(html,row),row);
});

test('store slugs resolve to verified seller search instead of an ignored storefront keyword',()=>{
 const seller=resolveEbaySeller(fixture(),source);const url=new URL(ebaySearchUrl(seller,'Cadillac CTS 2003-2007'));
 assert.equal(url.pathname,'/sch/i.html');assert.equal(url.searchParams.get('_ssn'),'u.s.autoseatcover');assert.equal(url.searchParams.get('_nkw'),'Cadillac CTS');
});

test('embedded anti-spam scripts do not mark a readable store page as blocked',()=>{
 assert.equal(isChallenge('<title>Search products</title><script>const message="Verify you are human";</script><article>Cadillac CTS leather cover</article>'),false);
 assert.equal(isChallenge('<title>Security Measure | eBay</title><p>Continue</p>'),true);
});
