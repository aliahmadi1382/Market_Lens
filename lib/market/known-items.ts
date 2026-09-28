import {SELLERS,type Listing} from './model.ts';

export type KnownItem = {seller:string;url:string;addedAt:string;origin:'manual'|'discovered';lastCheckedAt?:string;outcome?:'matched'|'not_matched'|'blocked'|'failed';message?:string};
export type ItemCheck = Pick<KnownItem,'seller'|'url'|'outcome'|'message'> & {lastCheckedAt:string};
export function ebayItemUrl(value:string,seller:string,keepVariation=true){
 const account=SELLERS.find(s=>s.name===seller);if(!account?.ebay)throw new Error('Choose a configured eBay account.');
 let url:URL;try{url=new URL(value)}catch{throw new Error('Enter a valid eBay item URL.');}
 const host=new URL(account.ebay.url).hostname;
 if(url.protocol!=='https:'||url.hostname!==host||url.port||url.username||url.password)throw new Error(`Use an HTTPS item link on ${host}.`);
 const id=url.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d{9,15})\/?$/)?.[1];
 if(!id)throw new Error('Use an item link such as https://www.ebay.com/itm/389580615317.');
 const variation=url.searchParams.get('var');
 return `https://${host}/itm/${id}`+(keepVariation&&variation&&/^\d{9,15}$/.test(variation)?`?var=${variation}`:'');
}
export function addKnownItems(existing:KnownItem[],seller:string,urls:string[],now=new Date().toISOString()):KnownItem[]{
 if(!Array.isArray(urls)||!urls.length||urls.length>100||urls.some(u=>typeof u!=='string'||u.length>3000))throw new Error('Add between 1 and 100 item links at a time.');
 const added=urls.map(url=>({seller,url:ebayItemUrl(url,seller),addedAt:now,origin:'manual' as const}));
 const map=new Map(existing.map(k=>[k.seller+'|'+k.url,k]));
 for(const item of added){const key=item.seller+'|'+item.url;map.set(key,{...map.get(key),...item});}
 if(map.size>10000)throw new Error('This tracked search has reached its 10,000 saved item limit.');
 return [...map.values()];
}
export function rememberItems(existing:KnownItem[],rows:Listing[],checks:ItemCheck[]=[]){
 const map=new Map(existing.map(k=>[k.seller+'|'+k.url,{...k}]));
 for(const row of rows){if(!row.id.startsWith('ebay:'))continue;
  try{const url=ebayItemUrl(row.url,row.seller,false),key=row.seller+'|'+url;
   if(!map.has(key)&&map.size<10000)map.set(key,{seller:row.seller,url,addedAt:row.collectedAt,origin:'discovered'});
  }catch{/* Only configured item pages may enter the refresh queue. */}
 }
 for(const check of checks){const key=check.seller+'|'+check.url;const item=map.get(key);if(item)map.set(key,{...item,...check});}
 return [...map.values()];
}
export function queuedItems(items:KnownItem[],seller:string){
 return items.filter(k=>k.seller===seller).sort((a,b)=>{
  // New explicit links first; then oldest check first so bounded runs rotate the queue.
  const priority=(k:KnownItem)=>k.origin==='manual'&&!k.lastCheckedAt?0:1;
  return priority(a)-priority(b)||(a.lastCheckedAt||'').localeCompare(b.lastCheckedAt||'')||a.addedAt.localeCompare(b.addedAt);
 });
}
