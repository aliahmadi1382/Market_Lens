import test from 'node:test';
import assert from 'node:assert/strict';
import {planSearch,matchesSearch,discoveryTerms} from '../lib/market/search.ts';
import {normalize,segmentKey,eligible} from '../lib/market/model.ts';
import {collectSource} from '../lib/market/collectors.ts';
import {productLinks,nextSearchPage,wooVariations} from '../lib/market/websites.ts';
import {readPublic} from '../lib/market/public-http.ts';

const query='Mercedes-Benz C-Class 2015–2021';
const title='2015-2021 Mercedes Benz C250 C300 C350 Coupe Driver Bottom Leather Seat Cover Gray';
test('C-Class search recognizes published submodels, punctuation and adjacent years',()=>{
  for(const t of [title,'2014 Mercedes C 300 Sedan Leather Seat Cover','2022 Mercedes Benz W205 C-Class Seat Cover','2017 Mercedes Benz C350e Seat Cover'])assert(matchesSearch(t,query),t);
  for(const t of ['2015 Mercedes Benz GLC Class C250 C300 C350 Seat Cover','2018 Mercedes GLK350 cover','2016 Mercedes E300 cover','2013 Mercedes C300 cover','2018 Toyota C300 cover','2018 Mercedes C3000 cover'])assert(!matchesSearch(t,query),t);
  assert.deepEqual(planSearch(query).years,[2014,2015,2016,2017,2018,2019,2020,2021,2022]);
  assert(discoveryTerms(query).includes('C300'));
  assert.deepEqual(discoveryTerms('Toyota Tacoma 2005-2015'),['tacoma','toyota tacoma']);
});
test('family matches retain body and submodel evidence for price segmentation',()=>{
  const make=(t:string)=>normalize({title:t,seller:'Texan Auto Seat Cover',url:'https://example.com',price:100});
  const coupe=make(title),sedan=make(title.replace('Coupe','Sedan')),unknown=make(title.replace('Coupe',''));
  assert.notEqual(segmentKey(coupe),segmentKey(sedan));assert(eligible(coupe));assert(!eligible(unknown));assert(unknown.fitmentReview);
});
test('product link parser scopes results, accepts single Woo slug and excludes navigation',()=>{
  const page='<nav><a href="/product/recommendation/">Other</a></nav><main><ul class="products"><li><a href="/product/seat/">'+title+'</a><a href="https://evil.example/product/seat">bad</a></li></ul></main>';
  assert.deepEqual(productLinks(page,'https://example.com','woo').products,[{title,url:'https://example.com/product/seat/'}]);
  assert.equal(productLinks('<main>No products were found matching your selection.</main>','https://example.com','woo').recognized,true);
  assert.equal(productLinks('<main>Something went wrong.</main>','https://example.com','woo').recognized,false);
  assert.equal(productLinks('<main><div class="template-search__results"></div></main>','https://example.com','shopify').recognized,false);
});
test('pagination retains search context and refuses foreign, loop and changed query links',()=>{
  const url='https://example.com/search?q=Mercedes&type=product&currency=USD';
  assert.equal(nextSearchPage('<a href="/search?page=2&q=Mercedes">Next</a>',url),url+'&page=2');
  for(const href of ['https://evil.example/search?page=2&q=Mercedes','/search?page=2&q=Toyota','/search?page=1&q=Mercedes'])assert.equal(nextSearchPage(`<a href="${href}">Next</a>`,url),null);
});
const form=(id:number,variants:unknown,action='https://usautoseatnation.com/product/seat/')=>`<form data-product_id="${id}" action="${action}" data-product_variations='${JSON.stringify(variants)}'></form>`;
test('Woo variations belong to the requested product, not an earlier recommendation form',()=>{
  const correct=[{variation_id:12,display_price:144.99}],wrong=[{variation_id:99,display_price:999}];
  assert.deepEqual(wooVariations(form(2,wrong)+form(1,correct),1,'https://usautoseatnation.com/product/seat/'),correct);
  assert.deepEqual(wooVariations(form(2,wrong),1,'https://usautoseatnation.com/product/seat/'),[]);
  assert.throws(()=>wooVariations('<link rel="canonical" href="https://usautoseatnation.com/product/wrong/">'+form(1,correct),1,'https://usautoseatnation.com/product/seat/'),/identity/);
});
test('published material and color choices override the generic parent title',()=>{
  const r=normalize({title,seller:'US Auto Nation',url:'https://example.com',variationCoverage:'published_variants'},[{name:'Variation data',text:'material: synthetic leather; color: Black'}]);
  assert.equal(r.material,'Synthetic Leather');assert.equal(r.color,'Black');assert.equal(r.materialEvidence,'Variation data');
});
test('Shopify follows full result pagination beyond the ten autocomplete suggestions',async()=>{
  const original=globalThis.fetch;const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const u=new URL(String(input));calls.push(u.toString());assert.equal(u.searchParams.get('currency'),'USD');assert.equal(new Headers(init?.headers).get('Cookie'),'localization=US; cart_currency=USD');
    if(u.pathname==='/cart.js')return Response.json({currency:'USD'});
    if(u.pathname==='/search')return new Response(`<main><div class="template-search__results">${u.searchParams.has('page')?`<a href="/products/coupe">${title}</a>`:'<a href="/products/glk">2016 Mercedes GLK350 cover</a>'}</div>${u.searchParams.has('page')?'':'<a href="/search?q=Mercedes&page=2">Next</a>'}</main>`);
    assert.equal(u.pathname,'/products/coupe.js');return Response.json({id:1,title,options:[{name:'Side',values:['Driver','Passenger']}],variants:[{id:11,title:'Driver Bottom',options:['Driver Bottom'],price:14499,available:true},{id:12,title:'Passenger Bottom',options:['Passenger Bottom'],price:15499,available:false}]});
  };
  try{const r=await collectSource('website:AutoSeatReplacement',query);assert.equal(r.listings.length,2);assert.equal(r.listings[0].price,144.99);assert.equal(r.listings[1].available,false);assert.equal(r.listings[0].variationCoverage,'published_variants');assert.equal(r.source.outcome,'matches');assert(calls.some(u=>u.includes('page=2')));assert(!calls.some(u=>u.includes('suggest.json')));}finally{globalThis.fetch=original}
});
test('Woo accepts C300 catalog results, selects matching variation form, and deduplicates alias discoveries',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async input=>String(input).includes('/wp-json/')?Response.json([{id:1,name:title,permalink:'https://usautoseatnation.com/product/seat/',type:'variable',prices:{currency_code:'USD'},attributes:[]}]):new Response(form(99,[{variation_id:1,display_price:999}])+form(1,[{variation_id:2,attributes:{attribute_side:'Driver Bottom'},display_price:144.99,is_in_stock:true},{variation_id:3,attributes:{attribute_side:'Passenger Bottom'},display_price:159.99,is_in_stock:true}]));
  try{const r=await collectSource('website:US Auto Nation',query);assert.equal(r.listings.length,2);assert.deepEqual(r.listings.map(x=>x.price),[144.99,159.99]);assert.equal(r.source.outcome,'matches');}finally{globalThis.fetch=original}
});
test('valid empty Woo search stays no_matches rather than inventing a failed source',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>Response.json([]);
  try{const r=await collectSource('website:US Auto Nation',query);assert.equal(r.source.outcome,'no_matches');assert.equal(r.listings.length,0);}finally{globalThis.fetch=original}
});
test('blocking a later Woo product preserves verified rows and stops later batches',async()=>{
  const original=globalThis.fetch;let details=0;
  globalThis.fetch=async input=>{
    const u=new URL(String(input));if(u.pathname.includes('/wp-json/'))return Response.json(Array.from({length:6},(_,i)=>({id:i+1,name:title,type:'variable',permalink:`https://usautoseatnation.com/product/${i+1}/`,attributes:[],prices:{currency_code:'USD'}})));
    details++;if(u.pathname==='/product/1/')return new Response(form(1,[{variation_id:11,display_price:144.99}],u.toString()));return new Response('Denied',{status:403});
  };
  try{const r=await collectSource('website:US Auto Nation',query);assert.equal(r.source.outcome,'blocked');assert(r.listings.some(x=>x.price===144.99));assert(details<=3);}finally{globalThis.fetch=original}
});
test('public reader follows safe canonical redirects, retries only transient server failures',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return calls===1?new Response(null,{status:301,headers:{Location:'/product/seat/'}}):calls===2?new Response(null,{status:503}):new Response('product');};
  try{assert.equal(await readPublic('https://example.com/product/seat',{domain:'example.com'}),'product');assert.equal(calls,3);}finally{globalThis.fetch=original}
});
test('public reader never retries blocks or follows cross-host redirects',async()=>{
  const original=globalThis.fetch;
  try{for(const response of [()=>new Response('Denied',{status:403}),()=>new Response(null,{status:302,headers:{Location:'https://evil.example/'}})]){let calls=0;globalThis.fetch=async()=>{calls++;return response();};await assert.rejects(()=>readPublic('https://example.com/',{domain:'example.com'}));assert.equal(calls,1);}}finally{globalThis.fetch=original}
});
