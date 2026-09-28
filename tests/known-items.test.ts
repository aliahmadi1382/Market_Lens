import test from 'node:test';
import assert from 'node:assert/strict';
import {addKnownItems,ebayItemUrl,rememberItems,queuedItems} from '../lib/market/known-items.ts';
import {normalize,SELLERS} from '../lib/market/model.ts';
import {parseEbayItem} from '../lib/market/ebay-detail.ts';
import {collectSource} from '../lib/market/collectors.ts';
import {applySnapshot,makeTrack,emptyIndex} from '../lib/market/tracking.ts';
const seller='DIY Auto Upholstery',source=SELLERS.find(s=>s.name===seller)!;
const url='https://www.ebay.com/itm/389580615317';
const title='2005-2015 Fits Toyota Tacoma Cloth Front Replacement Seat Covers Gray';
function page({name=title,store='diyautoupholstery',canonical=url,options='',schema={},specifics='Material Cloth; Color Gray; Years Fitted 2005-2015'}={}){
 return `<link rel="canonical" href="${canonical}"><h1 class="x-item-title__mainTitle">${name}</h1><div class="x-sellercard"><a href="https://www.ebay.com/str/${store}">Seller</a></div><div class="x-price-primary">US $579.95</div><div class="x-item-condition-text">New</div><div class="ux-labels-values">${specifics}</div>${options}<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}
test('clean links deduplicate tracking parameters while retaining selected variation IDs',()=>{
 const list=addKnownItems([],seller,[url+'?hash=irrelevant',url+'?itmmeta=tracking',url+'?var=123456789012&hash=tracking']);
 assert.equal(list.length,2);assert.equal(list[0].url,url);assert.equal(list[1].url,url+'?var=123456789012');
 for(const bad of ['http://www.ebay.com/itm/389580615317','https://evil.example/itm/389580615317','https://www.ebay.com@evil.example/itm/389580615317','https://www.ebay.com:444/itm/389580615317','https://www.ebay.com/str/diyautoupholstery'])assert.throws(()=>ebayItemUrl(bad,seller));
 assert.throws(()=>addKnownItems([],seller,[]));
});
test('published item fields verify the supplied Tacoma example, including every fitted year',()=>{
 const [row]=parseEbayItem(page(),source,'Toyota Tacoma 2005–2015',url);
 assert.equal(row.id,'ebay:389580615317');assert.equal(row.seller,seller);assert.equal(row.color,'Gray');assert.equal(row.material,'Cloth');assert.equal(row.price,579.95);
 assert.equal(row.years.length,11);assert.equal(row.variationCoverage,'no_options_exposed');
 assert.equal(parseEbayItem(page(),source,'Cadillac CTS 2003-2007',url).length,0);
 const fitment=parseEbayItem(page({name:'Toyota Tacoma Cloth Replacement Seat Covers'}),source,'Toyota Tacoma 2005-2015',url);assert.equal(fitment.length,1);assert.equal(fitment[0].years.length,11);
});
test('item identity, seller identity and security challenges cannot become verified rows',()=>{
 assert.throws(()=>parseEbayItem(page({store:'other-seller'}),source,'Toyota Tacoma 2005',url));
 assert.throws(()=>parseEbayItem(page({canonical:'https://www.ebay.com/itm/999999999999'}),source,'Toyota Tacoma 2005',url));
 assert.throws(()=>parseEbayItem('<title>Security Measure | eBay</title>',source,'Toyota Tacoma 2005',url));
});
test('independent option menus are evidence, never fabricated combinations or exact prices',()=>{
 const options='<div class="x-msku"><select aria-label="Color"><option value="-1">Select</option><option value="1">Gray</option><option value="2">Black</option></select><select aria-label="Position"><option value="1">Driver</option><option value="2">Passenger</option></select></div>';
 const rows=parseEbayItem(page({options}),source,'Toyota Tacoma 2005-2015',url);
 assert.equal(rows.length,1);assert.equal(rows[0].price,null);assert.equal(rows[0].variationCoverage,'options_only');assert.equal(rows[0].variationOptions?.length,2);
});
test('an unverified selected variation never borrows the parent item price',()=>{
 const rows=parseEbayItem(page(),source,'Toyota Tacoma 2005-2015',url+'?var=111111111111');
 assert.equal(rows[0].price,null);assert.equal(rows[0].variationCoverage,'options_only');
});
test('only published same-item variant offers create separate stable observations',()=>{
 const variant=(id:string,color:string,price:number)=>({'@type':'Product',url:url+'?var='+id,color,material:'Cloth',offers:{'@type':'Offer',price,priceCurrency:'USD',availability:'https://schema.org/InStock'}});
 const schema={'@type':'ProductGroup',url,hasVariant:[variant('111111111111','Gray',579.95),variant('222222222222','Black',590),{...variant('333333333333','Red',600),url:'https://www.ebay.com/itm/999999999999?var=333333333333'}]};
 const rows=parseEbayItem(page({schema}),source,'Toyota Tacoma 2005-2015',url);
 assert.equal(rows.length,2);assert.equal(rows[1].id,'ebay:389580615317:222222222222');assert.equal(rows[1].price,590);assert.equal(rows[1].color,'Black');assert.equal(rows[1].parentListingId,'ebay:389580615317');
});
test('saved URLs and item outcomes survive partial snapshots and discovered variants share a parent queue entry',()=>{
 const known=addKnownItems([],seller,[url]);const row=normalize({seller,title,url:url+'?var=111111111111',id:'ebay:389580615317:111111111111'});
 const check={seller,url,lastCheckedAt:'2026-09-28T10:00:00Z',outcome:'blocked' as const,message:'HTTP 403'};
 assert.equal(rememberItems(known,[row]).length,1);
 const track={...makeTrack('Toyota Tacoma 2005-2015'),knownItems:known};
 const saved=applySnapshot(emptyIndex(),track,{id:'saved-test',query:track.query,createdAt:'2026-09-28T10:00:00Z',listings:[],sources:[{seller,status:'error',count:0,url,message:'blocked',collectedAt:'2026-09-28T10:00:00Z',itemChecks:[check]}]},null);
 assert.equal(saved.index.tracks[0].knownItems?.[0].outcome,'blocked');assert.equal(saved.snapshot.listings.length,0);
 const two=addKnownItems(saved.index.tracks[0].knownItems!,seller,['https://www.ebay.com/itm/389580705847']);assert.match(queuedItems(two,seller)[0].url,/389580705847/);
});
test('daily collector reads saved pages before discovery and stops after an access block',async()=>{
 const source=SELLERS.find(s=>s.name==='Seat Pro')!,itemUrl='https://www.ebay.com/itm/389580615317';
 const known=addKnownItems([],source.name,[itemUrl,itemUrl.replace('389580615317','389580705847')]);let calls:string[]=[];const original=globalThis.fetch;
 globalThis.fetch=async(input)=>{calls.push(String(input));return new Response('',{status:403})};
 try{const result=await collectSource('ebay:Seat Pro','Toyota Tacoma 2005-2015',known);assert.deepEqual(calls,[itemUrl]);assert.equal(result.source.outcome,'blocked');assert.equal(result.source.itemChecks?.[0].outcome,'blocked');assert.match(result.source.message,/1 saved links still pending/);assert.equal(result.listings.length,0)}finally{globalThis.fetch=original}
});
