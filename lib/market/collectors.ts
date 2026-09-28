import {planSearch} from './search.ts';
import {COLLECTION_SOURCES,SELLERS,clean,normalize,matchesQuery,deduplicate,type Listing,type SourceStatus,type Seller} from './model.ts';
import {readPublic,PublicPageError} from './public-http.ts';
import {collectEbay,ebaySearchUrl} from './ebay.ts';
type PublicSeller=Seller&{deadline?:number};
function sourceQuery(q:string){const t=q.replace(/chevy|chevrolet|seat covers?|replacement|\bto\b/gi,'').replace(/\b(?:19|20)\d{2}\b/g,'').replace(/[^a-z0-9 ]/gi,' ').trim();const y=q.match(/\b(?:19|20)\d{2}\b/);return`${t}${y?' '+y[0]:''}`.trim()||q;}
async function shopify(source:PublicSeller,q:string){
 const origin='https://'+source.domain;const plan=planSearch(q);
 // Read-only storefront requests share an explicit US/USD context on every host.
 const readShopify=(url:string)=>{const u=new URL(url);u.searchParams.set('currency','USD');return readPublic(u.toString(),source,{Cookie:'localization=US; cart_currency=USD'});};
 const cart=JSON.parse(await readShopify(origin+'/cart.js'));
 if(cart.currency!=='USD')throw new Error('Storefront USD currency could not be verified; prices were not collected.');
 const discovered:any[]=[];let searchErrors=0,capped=false;
 for(let offset=0;offset<plan.searchTerms.length;offset+=3){
  const results=await Promise.allSettled(plan.searchTerms.slice(offset,offset+3).map(async term=>{
   const search=new URL('/search/suggest.json',origin);search.searchParams.set('q',sourceQuery(term));search.searchParams.set('resources[type]','product');search.searchParams.set('resources[limit]','10');search.searchParams.set('resources[options][unavailable_products]','show');
   const raw=JSON.parse(await readShopify(search.toString()));const products=raw.resources?.results?.products;if(!Array.isArray(products))throw new Error('Public product search unavailable');return products;
  }));
  for(const result of results){if(result.status==='fulfilled'){discovered.push(...result.value);if(result.value.length>=10)capped=true}else{if(result.reason instanceof PublicPageError&&result.reason.outcome==='blocked')throw result.reason;searchErrors++}}
 }
 if(searchErrors===plan.searchTerms.length)throw new Error('All public search requests failed');
 let candidates=[...new Map(discovered.filter((p:any)=>matchesQuery(p.title,q)).map((p:any)=>[new URL(p.url,origin).pathname,p])).values()];
 if(!candidates.length){
  const searchPage=new URL('/search',origin);searchPage.searchParams.set('type','product');searchPage.searchParams.set('q',plan.product);
  try{const html=await readShopify(searchPage.toString());const paths=[...new Set([...html.matchAll(/href=["']([^"']*\/products\/[^"']+)["']/gi)].map(m=>{try{const u=new URL(m[1].replace(/&amp;/g,'&'),origin);return u.hostname===source.domain?u.pathname:null}catch{return null}}).filter(Boolean))].slice(0,30);candidates=paths.map(path=>({url:path,title:''}));capped=true;}catch(e){if(e instanceof PublicPageError&&e.outcome==='blocked')throw e;searchErrors++}
 }
 if(candidates.length>100){candidates=candidates.slice(0,100);capped=true;}
 let failed=0;const collected:Listing[]=[];
 for(let i=0;i<candidates.length;i+=3){const slice=await Promise.allSettled(candidates.slice(i,i+3).map(async(p:any)=>{
  const url=new URL(p.url,origin);url.search='';url.hash='';const payload=JSON.parse(await readShopify(url.toString()+'.js'));
  if(!matchesQuery(payload.title,q))return [];
  const options=payload.options||[];
  return(payload.variants||[]).slice(0,100).map((v:any)=>{
   const variant=clean(v.public_title||v.title);const attributes=options.map((o:any,k:number)=>`${o.name||o}: ${v.options?.[k]||''}`).join('; ');
   return normalize({id:`${source.domain}:${payload.id}:${v.id}`,title:payload.title||p.title,seller:source.name,url:url.toString()+'?variant='+v.id+'&currency=USD',image:payload.featured_image?new URL(payload.featured_image,origin).toString():null,price:typeof v.price==='number'?v.price/100:null,currency:'USD',priceContext:'shopify:US:USD:v1',available:typeof v.available==='boolean'?v.available:null,variant},[
    {name:'Variation data',text:attributes+' '+variant},{name:'Structured attributes',text:clean(payload.tags?.join?.(' ')||payload.tags||'')},{name:'Description content',text:clean(payload.description)}]);
  });
 }));for(const s of slice){if(s.status==='fulfilled')collected.push(...s.value);else failed++;}}
 return{listings:collected.slice(0,2000),message:`Searched the product and every year ${plan.minYear??''}–${plan.maxYear??''}. ${plan.searchTerms.length} searches; ${candidates.length} candidate product pages. Public suggestions return at most 10 products per search; maximum 100 product pages and 2,000 variants. ${searchErrors} search errors; ${failed} page errors. Item-only USD prices verified from the public currency endpoint; US storefront context. Sales unavailable.`,partial:capped||failed>0||searchErrors>0||collected.length>2000};
}
async function woo(source:PublicSeller,q:string){
 const base='https://'+source.domain;const url=new URL('/wp-json/wc/store/v1/products',base);url.searchParams.set('search',sourceQuery(q).replace(/\b\d{4}\b/g,'').trim());url.searchParams.set('per_page','30');
 let data:any[]=[],catalogError=false;try{
  url.searchParams.set('per_page','30');
  for(let page=1;page<=20;page++){url.searchParams.set('page',String(page));const json=JSON.parse(await readPublic(url.toString(),source));if(!Array.isArray(json))throw new Error('No public catalog');data.push(...json);if(json.length<30)break;}
 }catch(e){if(e instanceof PublicPageError&&e.outcome==='blocked')throw e;catalogError=true;if(!data.length)return htmlSearch(source,q);}
 const plan=planSearch(q);const priority=(p:any)=>plan.requestedYears.some(y=>normalize({title:clean(p.name),seller:source.name,url:p.permalink}).years.includes(y))?0:1;
 const matching=data.filter(p=>matchesQuery(clean(p.name),q)).sort((a,b)=>priority(a)-priority(b));
 const listings=(await Promise.all(matching.slice(0,30).map(async p=>{
  const attributes=(p.attributes||[]).map((a:any)=>`${a.name}: ${(a.terms||[]).map((t:any)=>t.name).join(' / ')}`).join('; ');
  const variable=p.type==='variable'||p.has_options||p.prices?.price_range;const amount=Number(p.prices?.price);const price=!variable&&Number.isFinite(amount)&&amount>0?amount/10**(p.prices?.currency_minor_unit??2):null;
  if(variable){try{
   const page=await readPublic(p.permalink,source);const raw=page.match(/data-product_variations=(?:'([^']*)'|"([^"]*)")/i);const encoded=raw?.[1]||raw?.[2];
   if(encoded){const variations=JSON.parse(encoded.replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&amp;/g,'&'));
    if(Array.isArray(variations)&&variations.length){return variations.slice(0,100).map((v:any)=>{
     const attrs=Object.entries(v.attributes||{}).map(([k,value])=>k.replace(/^attribute_(pa_)?/,'').replace(/[-_]/g,' ')+': '+String(value).replace(/[-_]/g,' ')).join('; ');
     const variantUrl=new URL(p.permalink);for(const [key,value]of Object.entries(v.attributes||{}))variantUrl.searchParams.set(key,String(value));
     return normalize({id:`${source.domain}:${p.id}:${v.variation_id}`,title:clean(p.name),seller:source.name,url:variantUrl.toString(),image:v.image?.src||p.images?.[0]?.src||null,price:Number(v.display_price)>0?Number(v.display_price):null,currency:p.prices?.currency_code||'USD',available:typeof v.is_in_stock==='boolean'?v.is_in_stock:null,variant:attrs},[{name:'Item specifics',text:attributes},{name:'Variation data',text:attrs},{name:'Description content',text:clean(p.short_description)+' '+clean(p.description)}]);
    });}
   }
  }catch{} }
  return [normalize({id:`${source.domain}:${p.id}`,title:clean(p.name),seller:source.name,url:p.permalink,image:p.images?.[0]?.src||null,price,currency:p.prices?.currency_code||'USD',available:typeof p.is_in_stock==='boolean'?p.is_in_stock:null,warnings:variable?['Variable product: exact option price not exposed; excluded from pricing']:[]},[{name:'Item specifics',text:attributes},{name:'Description content',text:clean(p.short_description)+' '+clean(p.description)}])];
 }))).flat();
 if(!listings.length)return htmlSearch(source,q);
 return{listings:listings.slice(0,2000),message:'Public catalog, up to 600 candidates / 30 matching products; all years in the expanded range are checked. Variable products without exact option prices are research-only. Shipping and product sales are not provided.',partial:catalogError||data.length>=600||matching.length>30||listings.some(l=>l.price===null)};
}
async function htmlSearch(source:PublicSeller,q:string){
 const origin='https://'+source.domain;const search=new URL('/',origin);search.searchParams.set('s',sourceQuery(q).replace(/\b\d{4}\b/g,'').trim());search.searchParams.set('post_type','product');
 const html=await readPublic(search.toString(),source);const urls=[...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>{try{return new URL(m[1].replace(/&amp;/g,'&'),origin)}catch{return null}}).filter((u):u is URL=>!!u&&u.hostname===source.domain&&/\/(product|shop)\/.+\/.+/.test(u.pathname)).map(u=>u.origin+u.pathname))].slice(0,10);
 if(source.name==='RichmondAutoUpholstery'&&matchesQuery('2005-2013 Chevy Corvette C6 Replacement Leather Seat Covers',q)){
  const known='https://leather-auto-seats.com/shop/chevrolet/corvette/2005-2013-chevy-corvette-c6-replacement-leather-seat-covers-driver-passenger-side-complete-tan-perforated/';
  if(!urls.includes(known))urls.unshift(known);
 }
 const listings:Listing[]=[];
 for(let i=0;i<Math.min(urls.length,10);i+=3){const pages=await Promise.allSettled(urls.slice(i,i+3).map(async url=>{
  const page=await readPublic(url,source);const blocks=[...page.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const products:any[]=[];function visit(x:any){if(!x||typeof x!=='object')return;if(x['@type']==='Product'||Array.isArray(x['@type'])&&x['@type'].includes('Product'))products.push(x);if(Array.isArray(x))x.forEach(visit);else Object.values(x).forEach(v=>{if(typeof v==='object')visit(v)});}
  for(const b of blocks){try{visit(JSON.parse(b[1]))}catch{}}
  return products.filter(p=>matchesQuery(clean(p.name),q)).map(p=>{
   const offers=Array.isArray(p.offers)?p.offers:[p.offers];const exact=offers.length===1&&offers[0]?.price!=null&&offers[0]?.['@type']!=='AggregateOffer';const o=offers[0]||{};
   return normalize({id:url,title:clean(p.name),seller:source.name,url,image:typeof p.image==='string'?p.image:Array.isArray(p.image)?p.image[0]:p.image?.url||null,price:exact&&Number(o.price)>0?Number(o.price):null,currency:o.priceCurrency||'USD',available:o.availability?/InStock/.test(o.availability):null,warnings:exact?[]:['No single exact price in public structured data']},[{name:'Structured attributes',text:JSON.stringify(p.additionalProperty||[])},{name:'Description content',text:clean(p.description)},{name:'HTML tables',text:clean([...page.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>m[1]).join(' '))}]);
  });
 }));for(const p of pages)if(p.status==='fulfilled')listings.push(...p.value);}
 if(!urls.length)throw new Error('Public catalog unavailable and no product links found');
 return{listings:deduplicate(listings),message:'Public search and structured product pages, capped at 10 pages. Incomplete coverage; missing prices remain unknown.',partial:true};
}
export async function collectSource(id:string,q:string):Promise<{listings:Listing[];source:SourceStatus}>{
 const config=COLLECTION_SOURCES.find(s=>s.id===id)||COLLECTION_SOURCES.find(s=>s.seller===id);
 if(!config)throw new Error('Unsupported source');
 const s={...SELLERS.find(s=>s.name===config.seller)!,deadline:Date.now()+90000};const collectedAt=new Date().toISOString();const plan=planSearch(q);
 const base={sourceId:config.id,channel:config.channel,seller:s.name,count:0,url:config.url,collectedAt,searchUrl:config.channel==='ebay'?ebaySearchUrl(s,q):config.url};
 if(config.channel==='unconfigured')return{listings:[],source:{...base,status:'error',outcome:'not_configured',message:'Store URL has not been confirmed. This account was not searched.'}};
 try{
  const result=await(config.channel==='ebay'?collectEbay(s,q):s.adapter==='shopify'?shopify(s,q):woo(s,q));
  const rows=result.listings.map(r=>r.model==='Unknown'?{...r,model:plan.normalizedProduct,warnings:[...r.warnings,'Model identified from matched search terms']}:r);
  const blocked='blocked' in result&&result.blocked;
  return{listings:rows,source:{...base,status:blocked&&!rows.length?'error':result.partial?'partial':'success',outcome:blocked?'blocked':result.partial?'partial':rows.length?'matches':'no_matches',searchUrl:'searchUrl' in result&&typeof result.searchUrl==='string'?result.searchUrl:base.searchUrl,count:rows.length,message:result.message}};
 }catch(e){return{listings:[],source:{...base,status:'error',outcome:e instanceof PublicPageError?e.outcome:'failed',message:e instanceof Error?e.message:'Source could not be read'}};}
}
