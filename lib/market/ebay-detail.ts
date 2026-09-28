import {load} from 'cheerio/slim';
import {clean,normalize,attribute,COLOR_RULES,MATERIAL_RULES,type Listing,type Seller} from './model.ts';
import {matchesSearch,yearValues} from './search.ts';
import {PublicPageError,isChallenge} from './public-http.ts';
import {ebayItemUrl} from './known-items.ts';

const itemId=(url:string)=>url.match(/\/itm\/(?:[^/?]+\/)?(\d{9,15})(?:[/?]|$)/)?.[1];
const hasType=(value:any,type:string)=>value?.['@type']===type||Array.isArray(value?.['@type'])&&value['@type'].includes(type);
function schemas(html:string){
 const $=load(html),out:any[]=[];
 $('script[type="application/ld+json"]').each((_,el)=>{try{const root=JSON.parse($(el).text());out.push(...(Array.isArray(root)?root:root['@graph']||[root]));}catch{}});
 return out;
}
function exactOffer(product:any){
 const offers=Array.isArray(product?.offers)?product.offers:[product?.offers];const offer=offers.length===1?offers[0]:null;
 const currency=typeof offer?.priceCurrency==='string'&&/^[A-Z]{3}$/.test(offer.priceCurrency)?offer.priceCurrency:'XXX';
 const amount=Number(offer?.price);return{price:offer&&!hasType(offer,'AggregateOffer')&&currency!=='XXX'&&Number.isFinite(amount)&&amount>0?amount:null,currency,
  available:typeof offer?.availability==='string'?/\/InStock$/.test(offer.availability)?true:/\/(OutOfStock|SoldOut|Discontinued)$/.test(offer.availability)?false:null:null};
}
export function parseEbayItem(html:string,source:Seller,query:string,requestedUrl:string):Listing[]{
 if(isChallenge(html))throw new PublicPageError('eBay requires a security check. Item collection stopped.','blocked');
 const url=ebayItemUrl(requestedUrl,source.name),id=itemId(url)!,$=load(html);
 const canonical=$('link[rel="canonical"]').attr('href')||'';let validCanonical=false;
 try{validCanonical=ebayItemUrl(canonical,source.name,false)===ebayItemUrl(url,source.name,false)}catch{}
 const title=clean($('.x-item-title__mainTitle').first().text());
 if(!validCanonical||!title)throw new PublicPageError('Item identity could not be verified.');
 // Verify the selling account in the seller section, never in recommendation cards.
 const sellerLinks=$('.x-sellercard a[href], .x-sellercard-atf a[href], .x-sellercard-btf a[href], [data-testid="x-sellercard"] a[href]');
 const storeUrl=new URL(source.ebay!.url),storeSlug=storeUrl.pathname.startsWith('/str/')?storeUrl.pathname.split('/').at(-1):storeUrl.searchParams.get('store_name');
 let sellerVerified=false;
 sellerLinks.each((_,el)=>{try{const link=new URL($(el).attr('href')!,url);if(link.hostname!==storeUrl.hostname||link.protocol!=='https:')return;
  const handle=link.pathname.match(/^\/usr\/([^/]+)\/?$/)?.[1]||link.searchParams.get('_ssn');
  if(storeSlug&&link.pathname.replace(/\/$/,'').toLowerCase()===`/str/${storeSlug}`.toLowerCase()||handle&&source.ebay!.sellerId&&handle.toLowerCase()===source.ebay!.sellerId.toLowerCase())sellerVerified=true;
 }catch{}});
 if(!sellerVerified)throw new PublicPageError('Item seller did not match the configured account; item excluded.');
 const specifics=$('.ux-labels-values').map((_,e)=>clean($(e).text())).get().join('; ');
 if(!matchesSearch(title+' '+specifics,query))return [];
 const options:{name:string;values:string[]}[]=[];
 // Read published choices only. Independent menus do not establish valid combinations.
 $('.x-msku select, .x-msku__select-box select, select[name^="msku"], select[id^="msku"]').each((_,el)=>{
  const select=$(el),selectId=select.attr('id');
  const label=select.attr('aria-label')||(selectId?$('label').filter((_,e)=>$(e).attr('for')===selectId).first().text():'');
  const values=select.find('option').map((_,opt)=>{const value=$(opt).attr('value'),text=clean($(opt).text());return !value||value==='-1'||/^(?:-|select|choose)/i.test(text)?null:text;}).get();
  if(values.length)options.push({name:clean(label)||'Published option',values:[...new Set(values)]});
 });
 const objects=schemas(html);
 const product=objects.find(p=>(hasType(p,'Product')||hasType(p,'ProductGroup'))&&(itemId(String(p.url||''))===id||String(p.sku||'')===id));
 const condition=clean($('.x-item-condition-text').first().text()||$('.x-item-condition-value').first().text());
 const published=clean($('.x-price-primary').first().text());
 const ended=!!$('.x-ended-listing, .vi-ended-listing').length;
 const schemaPrice=exactOffer(product);
 const priceMatch=published.match(/^(?:US\s*\$|USD\s*)([\d,]+(?:\.\d{1,2})?)(?:\s|$)/);
 const simpleUsd=priceMatch&&!/\bto\b|\bfrom\b|[–—]|\s-\s/i.test(published)?Number(priceMatch[1].replace(/,/g,'')):null;
 const fields=[{name:'Item specifics',text:specifics}];
 const base={...normalize({id:`ebay:${id}`,title,seller:source.name,url:canonical,image:$('meta[property="og:image"]').attr('content')||null,
  price:options.length?null:schemaPrice.price??simpleUsd,currency:schemaPrice.price!==null?schemaPrice.currency:simpleUsd!==null?'USD':'XXX',
  available:ended?false:schemaPrice.available,condition:/^(Brand )?New\b/i.test(condition)?'New':condition||'Unknown',
  priceContext:`ebay:${storeUrl.hostname}:published:v1`,warnings:['Public item page; catalog completeness is not established.']},fields),
  years:yearValues(title+' '+specifics),displayedPrice:published,variationOptions:options,
  variationCoverage:options.length?'options_only' as const:'no_options_exposed' as const};
 const variants:Listing[]=[];const publishedVariants=Array.isArray(product?.hasVariant)?product.hasVariant:[];
 if(publishedVariants.length>1000)base.warnings.push('Published variation limit reached; additional combinations remain unread.');
 for(const variant of publishedVariants.slice(0,1000)){
  let variantUrl:string;try{variantUrl=ebayItemUrl(variant.url,source.name)}catch{continue;}
  const variationId=new URL(variantUrl).searchParams.get('var');if(itemId(variantUrl)!==id||!variationId)continue;
  const attributes=[['Color',variant.color],['Material',variant.material],['Size',variant.size],...(Array.isArray(variant.additionalProperty)?variant.additionalProperty.map((p:any)=>[p.name,p.value]):[])].filter(([k,v])=>typeof k==='string'&&typeof v==='string');
  const description=attributes.map(([k,v])=>`${k}: ${v}`).join('; ');if(!description)continue;
  const offer=exactOffer(variant),fields=[{name:'Variation data',text:description}];
  const row=normalize({...base,id:`ebay:${id}:${variationId}`,title,url:variantUrl,variant:description,...offer},fields);
  const c=attribute(fields,COLOR_RULES),m=attribute(fields,MATERIAL_RULES);
  variants.push({...row,years:base.years,available:ended?false:offer.available,
   ...(c.normalized!=='Unknown'?{color:c.normalized,originalColor:c.original,colorEvidence:c.evidence}:{}),
   ...(m.normalized!=='Unknown'?{material:m.normalized,originalMaterial:m.original,materialEvidence:m.evidence}:{}),
   warnings:[...base.warnings,...(offer.price===null?['Exact variant price was not published.']:[])],parentListingId:base.id,variationOptions:options,variationCoverage:'published_variants'});
 }
 if(variants.length)return variants;
 if(new URL(url).searchParams.has('var')){
  base.price=null;base.variationCoverage='options_only';
  base.warnings.push('Requested variation ID could not be verified in the published page; exact price excluded.');
 }
 if(options.length)base.warnings.push('Option choices were read, but valid combinations and their prices were not published.');
 return [base];
}
