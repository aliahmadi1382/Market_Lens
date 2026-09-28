import type {KnownItem,ItemCheck} from './known-items.ts';
import {planSearch} from './search.ts';
import {COLLECTION_SOURCES,SELLERS,type Listing,type SourceStatus} from './model.ts';
import {PublicPageError} from './public-http.ts';
import {collectEbay,ebaySearchUrl} from './ebay.ts';
import {shopify,woo} from './websites.ts';
export async function collectSource(id:string,q:string,knownItems:KnownItem[]=[]):Promise<{listings:Listing[];source:SourceStatus}>{
 const config=COLLECTION_SOURCES.find(s=>s.id===id)||COLLECTION_SOURCES.find(s=>s.seller===id);
 if(!config)throw new Error('Unsupported source');
 const s={...SELLERS.find(s=>s.name===config.seller)!,deadline:Date.now()+90000};const collectedAt=new Date().toISOString();const plan=planSearch(q);
 const base={sourceId:config.id,channel:config.channel,seller:s.name,count:0,url:config.url,collectedAt,searchUrl:config.channel==='ebay'?ebaySearchUrl(s,q):config.url};
 if(config.channel==='unconfigured')return{listings:[],source:{...base,status:'error',outcome:'not_configured',message:'Store URL has not been confirmed. This account was not searched.'}};
 try{
  const result=await(config.channel==='ebay'?collectEbay(s,q,knownItems):s.adapter==='shopify'?shopify(s,q):woo(s,q));
  const rows=result.listings.map(r=>r.model==='Unknown'?{...r,model:plan.normalizedProduct,warnings:[...r.warnings,'Model identified from matched search terms']}:r);
  const blocked='blocked' in result&&result.blocked;
  return{listings:rows,source:{...base,status:blocked&&!rows.length?'error':result.partial?'partial':'success',outcome:blocked?'blocked':result.partial?'partial':rows.length?'matches':'no_matches',searchUrl:'searchUrl' in result&&typeof result.searchUrl==='string'?result.searchUrl:base.searchUrl,count:rows.length,productCount:new Set(rows.map(r=>r.parentListingId||r.url.split('?')[0])).size,...('itemChecks' in result?{itemChecks:result.itemChecks as ItemCheck[]}:{}),message:result.message}};
 }catch(e){return{listings:[],source:{...base,status:'error',outcome:e instanceof PublicPageError?e.outcome:'failed',message:e instanceof Error?e.message:'Source could not be read'}};}
}
