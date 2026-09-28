import {load} from 'cheerio/slim';
import {clean,deduplicate,normalize,type Listing,type Seller} from './model.ts';
import {planSearch,matchesSearch,discoveryTerms} from './search.ts';
import {readPublic,PublicPageError,isChallenge} from './public-http.ts';
import {parseEbayItem} from './ebay-detail.ts';
import {queuedItems,type KnownItem,type ItemCheck} from './known-items.ts';
import {ebaySellerUrl} from './ebay-urls.ts';
type EbaySeller=Seller&{deadline?:number};
const idFromUrl=(url:string)=>url.match(/\/itm\/(?:[^/?]+\/)?(\d{9,15})(?:[/?]|$)/)?.[1];
const spans=(value:any):string=>typeof value==='string'?value:Array.isArray(value?.textSpans)?value.textSpans.map((x:any)=>x.text||'').join(' '):'';
export function ebaySearchUrl(source:Seller,query:string,page=1,term?:string){
 if(!source.ebay)throw new Error('eBay store is not configured');
 const url=new URL(ebaySellerUrl(source));const plan=planSearch(query);
 // Broad product discovery avoids losing listings that publish only a range's endpoints.
 // Every year in the expanded window is checked locally against each listing's fitment.
 if(url.pathname.startsWith('/str/'))return url.toString();
 url.searchParams.set('_nkw',term||plan.product);
 url.searchParams.set('_pgn',String(page));url.searchParams.set('_ipg','48');return url.toString();
}
// Parse JSON hydration data already present in public HTML; never execute page scripts.
export function publicJsonObjects(html:string):any[]{
 const objects:any[]=[];
 for(const m of html.matchAll(/\.concat\(\s*(?=\{)/g)){
  const start=m.index!+m[0].length;let depth=0,quoted=false,escaped=false;
  for(let i=start;i<html.length;i++){
   const c=html[i];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}if(c==='{')depth++;if(c==='}'&&--depth===0){try{objects.push(JSON.parse(html.slice(start,i+1)))}catch{}break;}
  }
 }
 return objects;
}
export function resolveEbaySeller(html:string,source:Seller):Seller{
 const host=new URL(source.ebay!.url).hostname,slug=new URL(source.ebay!.url).pathname.split('/').at(-1)!;
 const stack=publicJsonObjects(html);
 while(stack.length){const value=stack.pop();if(!value||typeof value!=='object')continue;
  if(typeof value.URL==='string'){try{const url=new URL(value.URL);const sellerId=url.searchParams.get('_ssn');
   if(url.protocol==='https:'&&url.hostname===host&&url.pathname==='/sch/i.html'&&url.searchParams.get('store_name')?.toLowerCase()===slug.toLowerCase()&&sellerId&&(!source.ebay!.sellerId||source.ebay!.sellerId.toLowerCase()===sellerId.toLowerCase())){
    return{...source,ebay:{url:`https://${host}/sch/i.html?_ssn=${encodeURIComponent(sellerId)}&store_name=${encodeURIComponent(slug)}&_oac=1`,sellerId}};
   }
  }catch{}}
  stack.push(...Object.values(value).filter(x=>x&&typeof x==='object'));
 }
 throw new PublicPageError('eBay store search identity could not be resolved; storefront observations are only a sample.');
}
function listingModels(objects:any[]){
 const found=new Map<string,any>(),stack=[...objects];
 while(stack.length){const value=stack.pop();if(!value||typeof value!=='object')continue;
  if(value.listingId&&value.displayPrice)found.set(String(value.listingId),value);
  stack.push(...Object.values(value).filter(x=>x&&typeof x==='object'));
 }
 return found;
}
export function parseEbaySearch(html:string,source:Seller,query:string,url:string){
 if(isChallenge(html))throw new PublicPageError('eBay requires a security check. Search stopped.','blocked');
 const $=load(html),models=listingModels(publicJsonObjects(html));const isStore=new URL(url).pathname.startsWith('/str/');
 const expectedStore=new URL(source.ebay!.url).pathname.split('/').at(-1)!;
 const observedStore=[...html.matchAll(/"storeName"\s*:\s*"([^"]+)"/g)].map(x=>x[1].toLowerCase());
 if(isStore&&!observedStore.includes(expectedStore.toLowerCase()))throw new PublicPageError('eBay store identity could not be verified; results were excluded.');
 const cards=isStore?$('.str-items-grid__container article[data-testid^="ig-"]'):$('#srp-river-results li.s-item, #srp-river-results li.s-card');
 const rows:Listing[]=[];let unverified=0,inspected=0;
 cards.each((_,element)=>{
  const card=$(element);const href=card.find('a[href*="/itm/"]').first().attr('href')||'';const id=idFromUrl(href);if(!id)return;
  let itemUrl:URL;try{itemUrl=new URL(href,url)}catch{return;}
  if(itemUrl.hostname!==new URL(url).hostname||itemUrl.protocol!=='https:')return;
  const model=models.get(id);const seller=spans(model?.__search?.sellerInfo?.text).toLowerCase();
  const sellerText=clean(card.find('.s-item__seller-info, .s-card__seller').text()).toLowerCase();
  if(!isStore&&(!source.ebay?.sellerId||![seller,sellerText].some(t=>t.startsWith(source.ebay!.sellerId!.toLowerCase()+' ')||t===source.ebay!.sellerId!.toLowerCase()))){unverified++;return;}
  inspected++;
  const title=clean(card.find('.str-item-card__property-title, .s-item__title, .s-card__title').first().text()||spans(model?.title));
  if(!matchesSearch(title,planSearch(query).product))return;
  const priceText=clean(card.find('.str-item-card__property-displayPrice, .s-item__price, .s-card__price').first().text()||spans(model?.displayPrice));
  const amount=model?.displayPrice?.value;const range=/\bto\b|\bfrom\b|[–—]|\s-\s/i.test(priceText);
  const currency=typeof amount?.currency==='string'&&/^[A-Z]{3}$/.test(amount.currency)?amount.currency:/\bUS\s*\$/.test(priceText)?'USD':/£|\bGBP\b/.test(priceText)?'GBP':/€|\bEUR\b/.test(priceText)?'EUR':'XXX';
  const numeric=typeof amount?.value==='number'?amount.value:Number(priceText.replace(/[^\d.,]/g,'').replace(/,/g,''));
  const price=!range&&currency!=='XXX'&&Number.isFinite(numeric)&&numeric>0?numeric:null;
  const condition=clean(model?.__search?.normalizedCondition?.text||card.find('.s-item__subtitle, .s-card__subtitle').first().text());
  itemUrl.search='';itemUrl.hash='';
  rows.push({...normalize({id:`ebay:${id}`,title,seller:source.name,url:itemUrl.toString(),image:card.find('img').first().attr('src')||null,price,currency,priceContext:`ebay:${itemUrl.hostname}:published:v1`,available:null,condition:/^(Brand )?New\b/i.test(condition)?'New':condition||'Unknown',warnings:['Public eBay listing; exact selectable variations may not be exposed.',...(range?['Published price is a range; excluded from exact-price analysis.']:currency==='XXX'?['Published currency could not be verified; price excluded.']:[])]}),displayedPrice:priceText,variationCoverage:'unread'});
 });
 const noMatches=/0 results|no (?:matching )?(?:results|items|listings)|couldn.t find any results/i.test($('.str-items-grid, .srp-controls, .srp-save-null-search, .srp-river-answer').text());
 if(!cards.length&&!noMatches)throw new PublicPageError('eBay returned no recognizable search results. This is not evidence of an empty catalog.');
 const next=$('a.pagination__next').attr('href');
 return{listings:deduplicate(rows.filter(r=>matchesSearch(r.title,query))),candidates:rows.filter(r=>!r.years.length),hasNext:!!next,inspected,unverified,noMatches};
}
export function enrichEbayListing(html:string,row:Listing){
 const $=load(html);const title=clean($('.x-item-title__mainTitle').first().text());
 // Avoid enrichment from recommendation cards or a different item page.
 const canonical=$('link[rel="canonical"]').attr('href')||'';
 if(!title||idFromUrl(canonical)!==row.id.slice(5))return row;
 const specs=$('.ux-labels-values').map((_,e)=>clean($(e).text())).get().join('; ');
 const fields=[{name:'Item specifics',text:specs}];
 const normalized=normalize({...row,title},fields);
 return{...normalized,displayedPrice:row.displayedPrice,available:$('.x-ended-listing, .vi-ended-listing').length?false:row.available,years:row.years};
}
export async function collectEbay(source:EbaySeller,query:string,knownItems:KnownItem[]=[]){
 const reader={domain:new URL(source.ebay!.url).hostname,deadline:source.deadline};
 const listings:Listing[]=[],candidates:Listing[]=[],itemChecks:ItemCheck[]=[];
 const saved=queuedItems(knownItems,source.name),checked=new Set<string>();
 let pages=0,storefront=0,inspected=0,unverified=0,capped=false,detailErrors=0,details=0,blocked=false,problem='';let scoped:Seller=source;
 const readItem=async(url:string)=>{
  details++;checked.add(url);const check={seller:source.name,url,lastCheckedAt:new Date().toISOString()};
  try{const rows=parseEbayItem(await readPublic(url,reader),source,query,url);itemChecks.push({...check,outcome:rows.length?'matched':'not_matched',message:rows.length?`${rows.length} published observations`:'Published title and specifics did not match this search.'});
   // Replace a search card with its item/variant observations, never count both.
   const id=idFromUrl(url);for(let i=listings.length-1;i>=0;i--)if(idFromUrl(listings[i].url)===id)listings.splice(i,1);
   listings.push(...rows);
  }catch(e){detailErrors++;const message=e instanceof Error?e.message:'Item read failed';const denied=e instanceof PublicPageError&&e.outcome==='blocked';itemChecks.push({...check,outcome:denied?'blocked':'failed',message});if(denied){blocked=true;problem=message;}}
 };
 // Retain a readable storefront sample, then prioritize saved pages before discovery.
 if(new URL(source.ebay!.url).pathname.startsWith('/str/')){
  try{const html=await readPublic(source.ebay!.url,reader);const sample=parseEbaySearch(html,source,query,source.ebay!.url);
   listings.push(...sample.listings);candidates.push(...sample.candidates);storefront=sample.inspected;
   if(!source.ebay!.sellerId)try{scoped=resolveEbaySeller(html,source);}catch(e){problem=e instanceof Error?e.message:'Seller identity unavailable';}
  }catch(e){blocked=e instanceof PublicPageError&&e.outcome==='blocked';problem=e instanceof Error?e.message:'Storefront unavailable';}
 }
 if(!blocked)for(const item of saved.slice(0,100)){await readItem(item.url);if(blocked||source.deadline&&Date.now()>=source.deadline)break;}
 const terms=discoveryTerms(query,'ebay');let queries=0;
 if(!problem&&!blocked)for(const term of terms){
  if(blocked||problem)break;
  if(pages>=20||source.deadline&&Date.now()>=source.deadline){capped=true;break;}
  queries++;
  for(let page=1;page<=20;page++){
   if(pages>=20){capped=true;break;}
   try{const url=ebaySearchUrl(scoped,query,page,term);const result=parseEbaySearch(await readPublic(url,reader),scoped,query,url);pages++;listings.push(...result.listings);candidates.push(...result.candidates);inspected+=result.inspected;unverified+=result.unverified;
    if(!result.hasNext)break;if(page===20)capped=true;
   }catch(e){blocked=e instanceof PublicPageError&&e.outcome==='blocked';problem=e instanceof Error?e.message:'Search failed';break;}
  }
 }
 if(!blocked)for(const row of deduplicate([...listings,...candidates]).filter(r=>!checked.has(r.url))){
  if(details>=100||source.deadline&&Date.now()>=source.deadline){capped=true;break;}await readItem(row.url);if(blocked)break;
 }
 // Search cards added after a saved variant read must not duplicate that parent.
 const detailedIds=new Set(listings.filter(r=>r.variationCoverage&&r.variationCoverage!=='unread').map(r=>idFromUrl(r.url)));
 const unique=deduplicate(listings.filter(r=>r.variationCoverage!=='unread'||!detailedIds.has(idFromUrl(r.url))));
 if(unique.length>2000)capped=true;const rows=unique.slice(0,2000);
 const pending=saved.filter(k=>!checked.has(k.url)).length,unread=rows.filter(r=>r.variationCoverage==='unread').length;
 const plan=planSearch(query);
 return{listings:rows,itemChecks,partial:capped||unverified>0||detailErrors>0||pending>0||unread>0||!!problem||rows.some(r=>r.price===null||r.variationCoverage==='options_only'||r.warnings.some(w=>w.includes('variation limit reached'))),blocked,searchUrl:ebaySearchUrl(scoped,query),message:`eBay: ${queries}/${terms.length} planned keyword queries; ${pages} keyword-search pages (${inspected} verified seller listings), plus ${storefront} storefront sample listings checked against ${plan.minYear??'all'}–${plan.maxYear??'years'}; ${rows.length} observations. ${details} item pages attempted; ${pending} saved links still pending; ${unread} observations have unread variations. ${unverified} seller identity exclusions; ${detailErrors} detail errors. Up to 20 search pages, 100 detail pages and 2,000 observations within 90 seconds; coverage may be incomplete. ${capped?'Collection limit reached. ':''}${problem}`};
}
