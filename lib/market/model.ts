import {matchesSearch,yearValues} from './search.ts';
export type Group = 'own' | 'primary' | 'reference' | 'unclassified';
export type Seller = {name:string; group:Group; domain?:string; adapter?:'shopify'|'woo'; ebay?:{url:string;sellerId?:string}};
export const SELLERS:Seller[] = [
  {name:'US Auto Nation',group:'own',domain:'usautoseatnation.com',adapter:'woo',ebay:{url:'https://www.ebay.com/str/usautonation',sellerId:'usautonation'}},
  {name:'u.s.autoseatcover',group:'own',ebay:{url:'https://www.ebay.com/str/usautoseatcover',sellerId:'u.s.autoseatcover'}},
  {name:'DIY Auto Upholstery',group:'own',ebay:{url:'https://www.ebay.com/str/diyautoupholstery'}},
  {name:'Master Auto Upholstery',group:'own',ebay:{url:'https://www.ebay.com/str/masterautoupholstery'}},
  {name:'US Auto Seat Factory',group:'own',ebay:{url:'https://www.ebay.com/str/usautoseatfactory'}},
  {name:'Premium Auto Seat Covers',group:'own',ebay:{url:'https://www.ebay.com/str/premiumautoseatcovers'}},
  {name:'DSA Seat Factory',group:'own',ebay:{url:'https://www.ebay.co.uk/str/autoseatfactory'}},
  {name:'Texan Auto Seat Cover',group:'primary',domain:'texanautoseatcover.com',adapter:'shopify'},
  {name:'AutoSeatReplacement',group:'primary',domain:'autoseatreplacement.com',adapter:'shopify'},
  {name:'theseatshop',group:'primary',domain:'www.theseatshop.com',adapter:'shopify'},
  ...[['Lone Star Seat Covers','lonestarseatcovers'],['seatcoverreplacement','seatcoverreplacement'],['US Leather Car Seats','usleathercarseats'],['US OEM Discovery','usoemdiscovery'],['Seat Pro','seatpro']].map(([name,sellerId])=>({name,group:'primary' as Group,ebay:{url:`https://www.ebay.com/sch/i.html?_ssn=${sellerId}&store_name=${sellerId}&_oac=1`,sellerId}})),
  {name:'usautoupholstery',group:'primary',ebay:{url:'https://www.ebay.com/sch/i.html?_ssn=usautoupholstery2014&store_name=usautoupholstery&_oac=1',sellerId:'usautoupholstery2014'}},
  {name:'AutoChampOfTexas',group:'reference',ebay:{url:'https://www.ebay.com/str/autochampoftexas'}},
  {name:'RichmondAutoUpholstery',group:'reference',domain:'leather-auto-seats.com',adapter:'woo'},
];
export type CollectionSource={id:string;seller:string;channel:'website'|'ebay'|'unconfigured';url:string};
export const COLLECTION_SOURCES:CollectionSource[]=SELLERS.flatMap(s=>{
 const sources:CollectionSource[]=[];
 if(s.adapter&&s.domain)sources.push({id:`website:${s.name}`,seller:s.name,channel:'website',url:'https://'+s.domain});
 if(s.ebay)sources.push({id:`ebay:${s.name}`,seller:s.name,channel:'ebay',url:s.ebay.url});
 if(!sources.length)sources.push({id:`unconfigured:${s.name}`,seller:s.name,channel:'unconfigured',url:''});
 return sources;
});
export const GROUP_NAMES:Record<Group,string> = {own:'Our Listings',primary:'Primary Competitors',reference:'Color & Material References',unclassified:'Unclassified'};
export type Listing = {
 displayedPrice?:string; priceContext?:string; unverifiedPrice?:number; unverifiedCurrency?:string; id:string; title:string; seller:string; group:Group; url:string; image:string|null; price:number|null; currency:string; shipping:number|null;
 available:boolean|null; originalColor:string; color:string; originalMaterial:string; material:string; colorEvidence:string; materialEvidence:string;
 configuration:string; finish:string; years:number[]; model:string; variant:string; collectedAt:string; condition:string; sold:number|null;
 warnings:string[];
};
export type SourceOutcome='matches'|'no_matches'|'partial'|'blocked'|'failed'|'not_configured';
export type SourceStatus={sourceId?:string;channel?:CollectionSource['channel'];outcome?:SourceOutcome;searchUrl?:string;seller:string;status:'success'|'partial'|'error';count:number;message:string;url:string;collectedAt:string};
export type Research={id:string;query:string;createdAt:string;listings:Listing[];sources:SourceStatus[];trackId?:string;kind?:'analysis'|'refresh'|'normalization';searchPlan?:import('./search.ts').SearchPlan};
export type Evidence={name:string;text:string};
export const clean=(v:unknown)=>String(v??'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/\s+/g,' ').trim();
export const COLOR_RULES:Record<string,string>={'jet black':'Black',ebony:'Black','charcoal black':'Black',black:'Black','light oak':'Tan',cashmere:'Tan',beige:'Tan',tan:'Tan','dark gray':'Gray','light gray':'Gray',grey:'Gray',gray:'Gray',graphite:'Gray',shale:'Shale',neutral:'Neutral',red:'Red',blue:'Blue',brown:'Brown',white:'White'};
export const MATERIAL_RULES:Record<string,string>={'synthetic leather':'Synthetic Leather','syn. leather':'Synthetic Leather',leatherette:'Synthetic Leather','faux leather':'Synthetic Leather','pu leather':'Synthetic Leather',vinyl:'Vinyl',leather:'Leather',cloth:'Cloth',fabric:'Cloth',suede:'Suede','alcantara':'Suede'};
function detect(text:string,rules:Record<string,string>){
 let remaining=clean(text).toLowerCase();const hits:{original:string;normalized:string}[]=[];
 for(const [key,value] of Object.entries(rules).sort((a,b)=>b[0].length-a[0].length)){
  const pattern=new RegExp('\\b'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','gi');
  const match=remaining.match(pattern); if(match){hits.push({original:match[0],normalized:value});remaining=remaining.replace(pattern,' ');}
 }
 return hits;
}
export function attribute(fields:Evidence[],rules:Record<string,string>){
 for(const f of fields){const hits=detect(f.text,rules);const unique=[...new Set(hits.map(x=>x.normalized))];if(unique.length>1&&/two[- ]tone|2[- ]tone/i.test(f.text)&&rules===COLOR_RULES)return{original:hits.map(x=>x.original).join(' / '),normalized:unique.sort().join(' / '),evidence:f.name};if(unique.length===1)return{original:hits.map(x=>x.original).join(' / '),normalized:unique[0],evidence:f.name};}
 return{original:'Unknown',normalized:'Unknown',evidence:'Not resolved from available fields'};
}
export const extractYears=yearValues;
export function modelName(text:string){
 const t=' '+text.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ';const models=['corvette','silverado','suburban','tahoe','avalanche','camaro','sierra','yukon','escalade','mustang','f150','f250','f350','f450','f550','excursion','expedition','explorer','tundra','tacoma','highlander','wrangler','grand cherokee','ram','accord','civic'];
 const found=models.filter(m=>t.replace(/f[- ](?=\d)/g,'f').includes(' '+m+' '));return found.length?found.join(' / '):'Unknown';
}
export function configuration(text:string){
 const t=text.toLowerCase();if(/console/.test(t)&&/shift|brake|boot/.test(t))return 'Console + boot set';if(/console/.test(t))return 'Console cover';if(/armrest/.test(t))return 'Armrest cover';
 const driver=/driver|left/.test(t),passenger=/passenger|right/.test(t),bottom=/bottom|lower|cushion/.test(t),top=/top|back|upper/.test(t);
 if(/\bor\b/.test(t)&&driver&&passenger)return 'Unknown';
 if(driver&&passenger&&(/complete|full|set/.test(t)||bottom&&top))return 'Front pair · complete';
 if(driver&&passenger&&bottom&&!top)return 'Front pair · bottom';
 if(driver&&passenger&&top&&!bottom)return 'Front pair · back';
 if(driver&&!passenger&&bottom&&top)return 'Driver · complete';
 if(passenger&&!driver&&bottom&&top)return 'Passenger · complete';
 if(driver&&!passenger&&bottom)return 'Driver · bottom';if(driver&&!passenger&&top)return 'Driver · back';
 if(passenger&&!driver&&bottom)return 'Passenger · bottom';if(passenger&&!driver&&top)return 'Passenger · back';
 return 'Unknown';
}
export function normalize(input:Partial<Listing>&{title:string;seller:string;url:string},extra:Evidence[]=[]):Listing{
 const fields=[{name:'Listing title',text:input.title},...extra];
 const c=attribute(fields,COLOR_RULES),m=attribute(fields,MATERIAL_RULES);
 const canonical=SELLERS.find(s=>s.name.replace(/[^a-z0-9]/gi,'').toLowerCase()===input.seller.replace(/[^a-z0-9]/gi,'').toLowerCase());
 const variantConfig=configuration(input.variant||'');const inferredConfig=configuration((input.variant||'')+' '+input.title.replace(/driver|passenger|left|right/gi,''));const cfg=variantConfig!=='Unknown'?variantConfig:inferredConfig!=='Unknown'?inferredConfig:configuration(input.title);
 const finish=/non[- ]?perforated|unperforated|solid leather/i.test(input.title)?'Solid':/perforat/i.test(input.title)?'Perforated':'Unspecified';
 const row:Listing={...(input.priceContext?{priceContext:input.priceContext}:{}),id:input.id||input.url,title:clean(input.title),seller:canonical?.name||input.seller,group:canonical?.group||'unclassified',url:input.url,image:input.image||null,price:input.price??null,currency:input.currency||'USD',shipping:input.shipping??null,available:input.available??null,originalColor:c.original,color:c.normalized,originalMaterial:m.original,material:m.normalized,colorEvidence:c.evidence,materialEvidence:m.evidence,configuration:cfg,finish,years:extractYears(input.title),model:modelName(input.title),variant:input.variant||'',collectedAt:input.collectedAt||new Date().toISOString(),condition:input.condition||'New',sold:input.sold??null,warnings:[...(input.warnings||[])]};
 const variantMaterial=attribute(extra.filter(f=>f.name==='Variation data'),MATERIAL_RULES);if(variantMaterial.normalized!=='Unknown'&&variantMaterial.normalized!==m.normalized){row.material='Unknown';row.warnings.push('Title and variant material conflict; excluded from pricing');}
 if(row.configuration==='Unknown')row.warnings.push('Seat configuration needs review');
 if(row.color==='Unknown'||row.material==='Unknown')row.warnings.push('Unresolved color or material');
 if(row.shipping===null)row.warnings.push('Shipping not published; item price only');
 return row;
}
export const matchesQuery=matchesSearch;
export function segmentKey(r:Listing){return [r.color,r.material,r.configuration,r.finish,r.model,r.years.join(','),r.currency,r.condition].join('|');}
export const eligible=(r:Listing)=>r.group==='primary'&&r.available!==false&&r.price!==null&&r.price>0&&r.color!=='Unknown'&&r.material!=='Unknown'&&r.configuration!=='Unknown'&&r.model!=='Unknown'&&r.condition!=='Unknown'&&r.currency!=='XXX'&&r.years.length>0;
export function quantile(a:number[],p:number){if(!a.length)return null;const sorted=[...a].sort((a,b)=>a-b),k=(sorted.length-1)*p,l=Math.floor(k);return sorted[l]+(sorted[Math.ceil(k)]-sorted[l])*(k-l);}
export function stats(rows:Listing[]){const r=rows.filter(eligible),p=r.map(x=>x.price as number);return{count:p.length,sellers:new Set(r.map(x=>x.seller)).size,min:p.length?Math.min(...p):null,max:p.length?Math.max(...p):null,mean:p.length?p.reduce((a,b)=>a+b,0)/p.length:null,median:quantile(p,.5)};}
export function segments(rows:Listing[]){
 const groups=new Map<string,Listing[]>();for(const r of rows){const k=segmentKey(r);groups.set(k,[...(groups.get(k)||[]),r]);}
 return [...groups].map(([key,r])=>{const sample=r[0],s=stats(r),own=r.filter(x=>x.group==='own'&&x.available!==false),market=r.filter(x=>x.group==='primary'||x.group==='reference'),n=market.length;const verified=sample.color!=='Unknown'&&sample.material!=='Unknown'&&sample.configuration!=='Unknown'&&sample.model!=='Unknown'&&sample.years.length>0;const recommend=s.count>=3&&s.sellers>=2;
 return{key,label:`${sample.color} · ${sample.material}`,sample,rows:r,...s,own:own.length,market:n,gap:verified&&n>0&&own.length===0,aggressive:recommend?Math.round(s.min!*.99*100)/100:null,balanced:recommend?Math.round(s.median!*.98*100)/100:null,premium:recommend?quantile(r.filter(eligible).map(x=>x.price!),.75):null};}).sort((a,b)=>Number(b.gap)-Number(a.gap)||b.count-a.count||a.label.localeCompare(b.label));
}
export function deduplicate(rows:Listing[]){return [...new Map(rows.map(r=>[r.id,r])).values()];}
export const money=(n:number|null,c='USD')=>n===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:c,maximumFractionDigits:2}).format(n);
