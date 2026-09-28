import {NextRequest} from 'next/server';
import {workbook} from '@/lib/market/xlsx';
import {SELLERS,segments,type Listing} from '@/lib/market/model';
export async function POST(request:NextRequest){
 try{const text=await request.text();if(text.length>20_000_000)return new Response('Export exceeds limit',{status:413});const body=JSON.parse(text);if(!Array.isArray(body.listings)||body.listings.length>10000)return new Response('Invalid export',{status:400});
 const rows:Listing[]=body.listings.map((r:Listing)=>({...r,group:SELLERS.find(s=>s.name===r.seller)?.group||'unclassified'}));
 const headers=['Title','Seller','Group','Item price','Published price text','Currency','Shipping','Available','Original color','Normalized color','Original material','Normalized material','Configuration','Finish','Model','Years','Variant','Source URL','Collected at','Color evidence','Material evidence','Variation coverage','Published options','Parent listing','Warnings'];
 const map=(r:Listing)=>[r.title,r.seller,r.group,r.price,r.displayedPrice||'',r.currency,r.shipping,r.available,r.originalColor,r.color,r.originalMaterial,r.material,r.configuration,r.finish,r.model,r.years.join(', '),r.variant,r.url,r.collectedAt,r.colorEvidence,r.materialEvidence,r.variationCoverage||'Not recorded',(r.variationOptions||[]).map(o=>o.name+': '+o.values.join(' / ')).join('; '),r.parentListingId||'',r.warnings.join('; ')];
 const seg=segments(rows);const sh=['Segment','Configuration','Finish','Model','Years','Currency','Primary listings','Primary sellers','Our variants','Observed market variants','Lowest','Average','Median','Highest','Aggressive','Balanced','Premium','Coverage'];
 const sr=seg.map(s=>[s.label,s.sample.configuration,s.sample.finish,s.sample.model,s.sample.years.join(', '),s.sample.currency,s.count,s.sellers,s.own,s.market,s.min,s.mean,s.median,s.max,s.aggressive,s.balanced,s.premium,s.gap?'Not observed in collected own listings':'Observed or unresolved']);
 const bytes=workbook([
 {name:'Read me',rows:[['MarketLens public-page research'],['Query',body.query],['Export scope','Current filtered listing set'],['Pricing basis','Item-only prices; primary competitors only; no FX conversion.'],['Coverage','Bounded public-page sample. Unobserved does not prove absent.'],['Recommendations','Heuristics only; require at least 3 comparable listings from 2 primary sellers. Aggressive: minimum × 0.99; balanced: median × 0.98; premium: 75th percentile. Costs and margin are not modeled.'],['Demand','Sales data unavailable; listing counts are not demand.'],['Sheet naming','Excel limits sheet names to 31 characters; reference and segment names are shortened.']]},
 {name:'Our Listings',rows:[headers,...rows.filter(r=>r.group==='own').map(map)]},
 {name:'Primary Competitors',rows:[headers,...rows.filter(r=>r.group==='primary').map(map)]},
 {name:'Color Material References',rows:[headers,...rows.filter(r=>r.group==='reference').map(map)]},
 {name:'Color-Material Market Segments',rows:[sh,...sr]},
 {name:'Color-Material Pricing Analysis',rows:[sh,...sr]},
 {name:'Segment-Level Insights',rows:[['Segment','Insight','Basis'],...seg.map(s=>[s.label,s.gap?'Option not observed in collected own listings. Verify full catalog before adding.':s.count?'Compare within this exact fitment and configuration.':'Pricing evidence insufficient.','Rule-based; not AI-generated. Sales demand not established.'])]},
 {name:'Sources',rows:[['Seller','Channel','Status','Outcome','Observations','Collected at','URL','Search URL','Limitations'],...(body.sources||[]).map((s:any)=>[s.seller,s.channel||'website',s.status,s.outcome||s.status,s.count,s.collectedAt,s.url,s.searchUrl||s.url,s.message])]},
 ]);
 return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="marketlens-research.xlsx"'}});
 }catch{return new Response('Export failed. Please retry.',{status:400});}
}
