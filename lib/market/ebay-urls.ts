import type {Seller} from './model.ts';

export function ebaySellerUrl(source:Seller){
 if(!source.ebay)throw new Error('eBay store is not configured');
 const configured=new URL(source.ebay.url);
 const sellerId=source.ebay.sellerId||configured.searchParams.get('_ssn');
 if(!sellerId)return configured.toString();
 // Keep seller identity and store context; discard item references and tracking filters.
 const url=new URL('/sch/i.html',configured.origin);
 const store=configured.pathname.startsWith('/str/')?configured.pathname.split('/').filter(Boolean).at(-1):configured.searchParams.get('store_name');
 url.searchParams.set('_ssn',sellerId);
 if(store)url.searchParams.set('store_name',store);
 url.searchParams.set('_oac','1');
 return url.toString();
}
