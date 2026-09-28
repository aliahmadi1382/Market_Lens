import {load} from 'cheerio/slim';
import {clean,normalize,deduplicate,type Listing,type Seller} from './model.ts';
import {planSearch,discoveryTerms,matchesProduct,matchesSearch,yearValues} from './search.ts';
import {readPublic,PublicPageError} from './public-http.ts';

type PublicSeller=Seller&{deadline?:number};
const MAX_SEARCH_PAGES=30,MAX_PRODUCTS=200,MAX_VARIANTS=200,MAX_ROWS=2000;
function progress(source:PublicSeller) {
  return {pages:0,products:0,rejected:0,limited:false,blocked:false,errors:[] as string[],
    time(){if(source.deadline&&Date.now()>=source.deadline-500){this.limited=true;return false}return !this.blocked},
    discoveryTime(){if(source.deadline&&Date.now()>=source.deadline-30000){this.limited=true;return false}return this.time()},
    error(e:unknown){const message=e instanceof Error?e.message:'Public read failed';if(!this.errors.includes(message))this.errors.push(message);if(e instanceof PublicPageError&&e.outcome==='blocked')this.blocked=true;},
    result(rows:Listing[],terms:string[],candidates:number,extra='') {
      if(rows.length>MAX_ROWS)this.limited=true;
      return {listings:deduplicate(rows).slice(0,MAX_ROWS),blocked:this.blocked,
        partial:this.limited||this.errors.length>0||rows.some(r=>r.price===null||r.variationCoverage==='unread'||r.variationCoverage==='options_only'),
        message:`Queries: ${terms.join(', ')}. ${this.pages} public search pages; ${candidates} matching product candidates; ${this.products} product details read; ${this.rejected} unrelated or out-of-year candidates excluded. ${this.limited?'Collection limit reached; coverage is incomplete. ':''}${this.errors.length?`Read problems: ${this.errors.slice(0,3).join('; ')}. `:''}${extra} Published observations only; this is not a claim of complete market coverage.`};
    }};
}
const candidateMatches=(title:string,q:string)=>matchesProduct(title,q)&&(!yearValues(title).length||matchesSearch(title,q));
const relevant=(title:string,attributes:string,q:string)=>matchesSearch(yearValues(title).length?title:`${title} ${attributes}`,q);
function scopedUrl(raw:string,origin:string){try{const u=new URL(raw,origin);if(u.protocol==='https:'&&u.origin===origin&&!u.username&&!u.password)return u;}catch{}return null;}
export function productLinks(html:string,origin:string,kind:'shopify'|'woo') {
  const $=load(html);const selectors=kind==='shopify'?'.template-search__results, .search-page .product_c, #product-grid':'.woocommerce ul.products, ul.products';
  const selected=$(selectors).first();const root=selected.length?selected:$('main, [role="main"], #content').first();
  const products=new Map<string,{url:string;title:string}>();
  root.find('a[href]').each((_,e)=>{
    const u=scopedUrl($(e).attr('href')||'',origin);
    if(!u||!(kind==='shopify'?/\/products\/[^/]+\/?$/:/\/product\/[^/]+\/?$|\/shop\/.+\/.+/).test(u.pathname))return;
    const url=u.origin+u.pathname;const title=clean($(e).find('h2,h3,h4,h5,.woocommerce-loop-product__title').first().text()||$(e).text()||$(e).find('img').attr('alt'));
    if(!products.has(url)||title.length>products.get(url)!.title.length)products.set(url,{url,title});
  });
  const empty=/\b0 results\b|no (?:products|results) (?:were )?found|no results for|could not find any results/i.test(clean($('title').text()+' '+root.text()));
  return {products:[...products.values()],recognized:products.size>0||empty,$};
}
export function nextSearchPage(html:string,current:string) {
  const u=new URL(current),page=Number(u.searchParams.get('page')||'1'),$=load(html);
  for(const element of $('a[href]').toArray()) {
    const next=scopedUrl($(element).attr('href')||'',u.origin);
    if(next&&next.pathname===u.pathname&&next.searchParams.get('q')===u.searchParams.get('q')&&Number(next.searchParams.get('page'))===page+1){
      const target=new URL(current);target.searchParams.set('page',String(page+1));return target.toString();
    }
  }
  return null;
}
export async function shopify(source:PublicSeller,q:string) {
  const origin='https://'+source.domain,plan=planSearch(q),state=progress(source),terms=discoveryTerms(plan,'shopify');
  const read=(url:string)=>{const u=new URL(url);u.searchParams.set('currency','USD');return readPublic(u.toString(),source,{Cookie:'localization=US; cart_currency=USD'});};
  const cart=JSON.parse(await read(origin+'/cart.js'));
  if(cart.currency!=='USD')throw new Error('Storefront USD currency could not be verified; prices were not collected.');
  const candidates=new Map<string,{url:string;title:string}>();
  for(const term of terms) {
    const search=new URL('/search',origin);search.searchParams.set('q',term);search.searchParams.set('type','product');
    let url:string|null=search.toString();
    while(url&&state.discoveryTime()) {
      if(state.pages>=MAX_SEARCH_PAGES){state.limited=true;break}
      try {
        const html=await read(url);state.pages++;const parsed=productLinks(html,origin,'shopify');
        if(!parsed.recognized)throw new Error('Search page structure was not recognized; empty results are unverified');
        for(const p of parsed.products)if(!p.title||candidateMatches(p.title,q))candidates.set(p.url,p);else state.rejected++;
        url=nextSearchPage(html,url);
      }catch(e){state.error(e);break}
    }
    if(!state.time())break;
  }
  // Typeahead is a bounded fallback when a theme cannot expose normal search pages.
  if(state.errors.length&&!state.blocked&&state.time())for(const term of plan.searchTerms.slice(0,12)) {
    try{
      const search=new URL('/search/suggest.json',origin);search.searchParams.set('q',term);search.searchParams.set('resources[type]','product');search.searchParams.set('resources[limit]','10');search.searchParams.set('resources[options][unavailable_products]','show');
      const data=JSON.parse(await read(search.toString()));state.pages++;
      if(!Array.isArray(data.resources?.results?.products))throw new Error('Predictive product search unavailable');
      for(const p of data.resources.results.products){const u=scopedUrl(p.url,origin);if(u&&candidateMatches(p.title,q))candidates.set(u.origin+u.pathname,{url:u.origin+u.pathname,title:p.title});}
    }catch(e){state.error(e)}
    if(!state.time())break;
  }
  const sorted=[...candidates.values()].sort((a,b)=>Number(!plan.requestedYears.some(y=>yearValues(a.title).includes(y)))-Number(!plan.requestedYears.some(y=>yearValues(b.title).includes(y))));
  if(sorted.length>MAX_PRODUCTS)state.limited=true;
  const rows:Listing[]=[];
  for(let i=0;i<Math.min(sorted.length,MAX_PRODUCTS)&&state.time();i+=3) {
    await Promise.all(sorted.slice(i,Math.min(i+3,MAX_PRODUCTS)).map(async p=>{
      try {
        const payload=JSON.parse(await read(p.url+'.js'));state.products++;
        const tags=clean(Array.isArray(payload.tags)?payload.tags.join(' '):payload.tags);
        if(!relevant(payload.title,tags,q)){state.rejected++;return}
        if(!Array.isArray(payload.variants)||!payload.variants.length)throw new Error('Product did not expose variant records');
        if(payload.variants.length>MAX_VARIANTS)state.limited=true;
        const options=payload.options||[];
        const variationOptions=options.map((o:any)=>({name:o.name||o,values:o.values||[]}));
        for(const v of payload.variants.slice(0,MAX_VARIANTS)) {
          const variant=clean(v.public_title||v.title),attributes=options.map((o:any,k:number)=>`${o.name||o}: ${v.options?.[k]||''}`).join('; ');
          const row=normalize({id:`${source.domain}:${payload.id}:${v.id}`,title:payload.title,seller:source.name,url:p.url+'?variant='+v.id+'&currency=USD',image:payload.featured_image?new URL(payload.featured_image,origin).toString():null,price:typeof v.price==='number'?v.price/100:null,currency:'USD',priceContext:'shopify:US:USD:v1',available:typeof v.available==='boolean'?v.available:null,variant,variationCoverage:'published_variants'},[{name:'Variation data',text:attributes+' '+variant},{name:'Structured attributes',text:tags},{name:'Description content',text:clean(payload.description)}]);
          if(!row.years.length)row.years=yearValues(tags);
          rows.push({...row,parentListingId:`${source.domain}:${payload.id}`,variationCoverage:'published_variants',variationOptions});
        }
      }catch(e){state.error(e)}
    }));
    if(rows.length>=MAX_ROWS){state.limited=true;break}
  }
  if(!state.pages&&state.errors.length&&!rows.length&&!state.blocked)throw new Error(state.errors.join('; '));
  return state.result(rows,terms,candidates.size,'Item-only USD prices verified in the US storefront context. Sales unavailable.');
}
export function wooVariations(html:string,productId:string|number,url:string):any[] {
  const $=load(html),expected=new URL(url),canonical=$('link[rel="canonical"]').attr('href');
  const sameProduct=(value:string)=>{const u=scopedUrl(value,expected.origin);return !!u&&u.pathname.replace(/\/$/,'')===expected.pathname.replace(/\/$/,'');};
  if(canonical&&!sameProduct(canonical))throw new Error('Product page identity did not match the catalog item');
  // Themes can render recommendation/quick-view forms before the real product.
  const form=$('[data-product_variations]').filter((_,e)=>$(e).attr('data-product_id')===String(productId)&&(!$(e).attr('action')||sameProduct($(e).attr('action')!))).first();
  const encoded=form.attr('data-product_variations');
  if(!encoded)return [];const data=JSON.parse(encoded);return Array.isArray(data)?data:[];
}
export async function woo(source:PublicSeller,q:string) {
  const origin='https://'+source.domain,plan=planSearch(q),state=progress(source),terms=discoveryTerms(plan);
  const data=new Map<string,any>();let catalogAvailable=false;
  for(const term of terms) {
    const seen=new Set<string>();
    for(let page=1;state.discoveryTime();page++) {
      if(state.pages>=MAX_SEARCH_PAGES){state.limited=true;break}
      const url=new URL('/wp-json/wc/store/v1/products',origin);url.searchParams.set('search',term);url.searchParams.set('per_page','30');url.searchParams.set('page',String(page));
      try {
        const json=JSON.parse(await readPublic(url.toString(),source));
        if(!Array.isArray(json))throw new Error('Public catalog response is not a product list');
        state.pages++;catalogAvailable=true;
        if(json.length&&json.every(p=>seen.has(String(p.id)))){state.limited=true;state.error(new Error('Store repeated a catalog page; pagination stopped'));break}
        for(const p of json){seen.add(String(p.id));if(candidateMatches(clean(p.name),q))data.set(String(p.id),p);else state.rejected++;}
        if(json.length<30)break;
      }catch(e){state.error(e);break}
    }
    if(!state.time()||state.pages>=MAX_SEARCH_PAGES||!catalogAvailable)break;
  }
  if(!catalogAvailable&&!state.blocked)return htmlSearch(source,q,state.errors);
  const sorted=[...data.values()].sort((a,b)=>Number(!plan.requestedYears.some(y=>yearValues(clean(a.name)).includes(y)))-Number(!plan.requestedYears.some(y=>yearValues(clean(b.name)).includes(y))));
  if(sorted.length>MAX_PRODUCTS)state.limited=true;
  const rows:Listing[]=[];
  for(let i=0;i<Math.min(sorted.length,MAX_PRODUCTS)&&state.time();i+=3) {
    await Promise.all(sorted.slice(i,Math.min(i+3,MAX_PRODUCTS)).map(async p=>{
      const attributes=(p.attributes||[]).map((a:any)=>a.name+': '+(a.terms||[]).map((t:any)=>t.name).join(', ')).join('; ');
      if(!relevant(clean(p.name),attributes,q)){state.rejected++;return}
      const variable=p.type==='variable',price=Number(p.prices?.price)/10**(p.prices?.currency_minor_unit??2);
      const fields=[{name:'Item specifics',text:attributes},{name:'Description content',text:clean(p.short_description)+' '+clean(p.description)}];
      const input={title:clean(p.name),seller:source.name,url:p.permalink,image:p.images?.[0]?.src||null,currency:p.prices?.currency_code||'XXX',available:typeof p.is_in_stock==='boolean'?p.is_in_stock:null};
      const parentListingId=`${source.domain}:${p.id}`;
      const variationOptions=(p.attributes||[]).filter((a:any)=>a.has_variations).map((a:any)=>({name:a.name,values:(a.terms||[]).map((t:any)=>clean(t.name))}));
      if(variable)try {
        const variations=wooVariations(await readPublic(p.permalink,source),p.id,p.permalink);state.products++;
        if(variations.length>MAX_VARIANTS)state.limited=true;
        if(variations.length) {
          for(const v of variations.slice(0,MAX_VARIANTS)) {
            const attrs=Object.entries(v.attributes||{}).map(([k,value])=>k.replace(/^attribute_(pa_)?/,'').replace(/[-_]/g,' ')+': '+String(value).replace(/[-_]/g,' ')).join('; ');
            const url=new URL(p.permalink);for(const [key,value] of Object.entries(v.attributes||{}))url.searchParams.set(key,String(value));
            const row=normalize({...input,id:`${parentListingId}:${v.variation_id}`,url:url.toString(),image:v.image?.src||input.image,price:Number(v.display_price)>0?Number(v.display_price):null,available:typeof v.is_in_stock==='boolean'?v.is_in_stock:null,variant:attrs,variationCoverage:'published_variants'},[{name:'Variation data',text:attrs},...fields]);
            if(!row.years.length)row.years=yearValues(attributes);
            rows.push({...row,parentListingId,variationCoverage:'published_variants',variationOptions});
          }
          return;
        }
      }catch(e){state.error(e)}
      else state.products++;
      const row=normalize({...input,id:parentListingId,price:!variable&&Number.isFinite(price)&&price>0?price:null,warnings:variable?['Variable product: exact option prices were not exposed; excluded from pricing']:[]},fields);
      if(!row.years.length)row.years=yearValues(attributes);
      rows.push({...row,parentListingId,variationCoverage:variable?'options_only':'no_options_exposed',variationOptions});
    }));
    if(rows.length>=MAX_ROWS){state.limited=true;break}
  }
  return state.result(rows,terms,data.size,'Up to 200 matching products and 200 published variants per product, within 90 seconds. Shipping and sales unavailable.');
}
async function htmlSearch(source:PublicSeller,q:string,catalogErrors:string[]) {
  const origin='https://'+source.domain,state=progress(source),terms=discoveryTerms(q),candidates=new Map<string,string>();
  const rows:Listing[]=[];
  for(const term of terms.slice(0,4)) {
    if(!state.time())break;
    try {
      const search=new URL('/',origin);search.searchParams.set('s',term);search.searchParams.set('post_type','product');
      const html=await readPublic(search.toString(),source);state.pages++;const parsed=productLinks(html,origin,'woo');
      if(!parsed.recognized)throw new Error('Public search results could not be recognized');
      for(const p of parsed.products)if(!p.title||candidateMatches(p.title,q))candidates.set(p.url,p.title);else state.rejected++;
    }catch(e){state.error(e)}
  }
  for(const [url] of [...candidates].slice(0,30)) {
    if(!state.time())break;
    try {
      const html=await readPublic(url,source);state.products++;const $=load(html),products:any[]=[];
      function visit(x:any){if(!x||typeof x!=='object')return;if(x['@type']==='Product'||Array.isArray(x['@type'])&&x['@type'].includes('Product'))products.push(x);for(const v of Object.values(x))if(v&&typeof v==='object')visit(v);}
      $('script[type="application/ld+json"]').each((_,e)=>{try{visit(JSON.parse($(e).text()))}catch{}});
      for(const p of products.filter(p=>matchesSearch(clean(p.name),q))) {
        const offers=Array.isArray(p.offers)?p.offers:[p.offers],o=offers[0]||{},exact=offers.length===1&&o.price!=null&&o['@type']!=='AggregateOffer';
        rows.push(normalize({id:url,title:clean(p.name),seller:source.name,url,image:typeof p.image==='string'?p.image:p.image?.url||null,price:exact&&Number(o.price)>0?Number(o.price):null,currency:o.priceCurrency||'XXX',available:o.availability?/InStock/.test(o.availability):null,warnings:exact?[]:['No single exact price in public structured data']},[{name:'Structured attributes',text:JSON.stringify(p.additionalProperty||[])},{name:'Description content',text:clean(p.description)}]));
      }
    }catch(e){state.error(e)}
  }
  state.limited=true; // HTML fallback cannot prove exhaustive search or variation coverage.
  if(!state.pages&&!state.blocked)throw new Error([...catalogErrors,...state.errors].join('; '));
  return state.result(rows,terms.slice(0,4),candidates.size,'Catalog endpoint unavailable; public HTML fallback.');
}
