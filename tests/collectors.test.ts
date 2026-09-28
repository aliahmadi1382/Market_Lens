import test from 'node:test';
import assert from 'node:assert/strict';
import {collectSource} from '../lib/market/collectors.ts';
import {normalize} from '../lib/market/model.ts';
import {detectPriceEvents} from '../lib/market/tracking.ts';
const title='2005-2013 Chevy Corvette Driver Bottom Black Leather Seat Cover';
test('Shopify checks currency and uses the same explicit market context on all requests',async()=>{
 const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{const url=new URL(String(input));calls.push(url.pathname);assert.equal(url.searchParams.get('currency'),'USD');assert.equal(new Headers(init?.headers).get('Cookie'),'localization=US; cart_currency=USD');
  const data=url.pathname==='/cart.js'?{currency:'USD'}:url.pathname==='/search/suggest.json'?{resources:{results:{products:[{title,url:'/products/seat'}]}}}:{id:1,title,options:[],variants:[{id:2,title:'Driver Bottom',price:18000,available:true}]};
  return Response.json(data);
 };
 try{const result=await collectSource('AutoSeatReplacement','Chevy Corvette 2005');assert.equal(result.listings[0].price,180);assert.equal(result.listings[0].currency,'USD');assert.equal(result.listings[0].priceContext,'shopify:US:USD:v1');assert.equal(calls[0],'/cart.js');assert.equal(calls.filter(x=>x==='/search/suggest.json').length,4);}finally{globalThis.fetch=original;}
});
test('Shopify refuses unverified currency instead of labeling it USD',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({currency:'EUR'});
 try{const result=await collectSource('AutoSeatReplacement','Chevy Corvette 2005');assert.equal(result.source.status,'error');assert.equal(result.listings.length,0);assert.match(result.source.message,/currency could not be verified/);}finally{globalThis.fetch=original;}
});
test('changing collection market context cannot generate a price alert',()=>{
 const old=normalize({id:'one',title,seller:'AutoSeatReplacement',price:160.95,url:'https://example.com',available:true});
 const current={...old,price:180,priceContext:'shopify:US:USD:v1'};
 assert.equal(detectPriceEvents([old],[current],'track','run',new Date().toISOString()).length,0);
});

test('bounded catalog discovery prioritizes requested years before adjacent generations',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init)=>{
  assert.equal(init?.redirect,'manual');const page=Number(new URL(String(input)).searchParams.get('page'));
  const data=page>9?[]:Array.from({length:30},(_,i)=>({id:page*100+i,name:`${page===1?'2008-2013':'2003-2007'} Cadillac CTS Driver Bottom Black Leather Seat Cover`,permalink:`https://usautoseatnation.com/product/seat-${page}-${i}`,prices:{price:'12000',currency_minor_unit:2,currency_code:'USD'},is_in_stock:true}));
  return Response.json(data);
 };
 try{const r=await collectSource('US Auto Nation','Cadillac CTS 2003-2007');assert.equal(r.listings.length,200);assert(r.listings.every(x=>x.years.includes(2003)));assert.equal(r.source.outcome,'partial');}finally{globalThis.fetch=original;}
});
