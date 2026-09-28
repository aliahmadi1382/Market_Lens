import {NextRequest,NextResponse} from 'next/server';
import initial from '@/data/initial.json';
import {marketStore,writeGuard} from '@/lib/market/server';
import {saveResearch} from '@/lib/market/service';
import {SELLERS,deduplicate,type Research,type Listing} from '@/lib/market/model';
import {planSearch} from '@/lib/market/search';
function validateRow(r:any):r is Listing{
 return r&&(!r.variationCoverage||['unread','options_only','published_variants','no_options_exposed'].includes(r.variationCoverage))&&(!r.variationOptions||Array.isArray(r.variationOptions)&&r.variationOptions.length<=100&&r.variationOptions.every((o:any)=>o&&typeof o.name==='string'&&Array.isArray(o.values)&&o.values.length<=1000&&o.values.every((v:any)=>typeof v==='string')))&&typeof r.id==='string'&&r.id.length<500&&typeof r.title==='string'&&r.title.length<2000&&typeof r.seller==='string'&&typeof r.url==='string'&&/^https:\/\//.test(r.url)&&Array.isArray(r.years)&&r.years.every((n:unknown)=>Number.isInteger(n))&&Array.isArray(r.warnings)&&['color','material','originalColor','originalMaterial','colorEvidence','materialEvidence','configuration','finish','model','variant','collectedAt','condition','currency'].every(k=>typeof r[k]==='string')&&/^[A-Z]{3}$/.test(r.currency)&&(r.price===null||typeof r.price==='number'&&Number.isFinite(r.price)&&r.price>=0);
}
export async function GET(request:NextRequest){
 try{const store=marketStore();const id=request.nextUrl.searchParams.get('id');
 if(id){const snapshot=await store.snapshot(id);return snapshot?NextResponse.json(snapshot):NextResponse.json({error:'Research not found'},{status:404});}
 const {index}=await store.read();const latest=index.runs[0];const research=latest?await store.snapshot(latest.id):initial;
 if(latest&&!research)throw new Error('Snapshot unavailable');
 return NextResponse.json({research,history:index.runs,tracks:index.tracks,notifications:index.notifications,storage:'github'});
 }catch{return NextResponse.json({research:initial,history:[],tracks:[],notifications:[],warning:'Shared research could not be loaded. Showing the bundled snapshot; do not treat it as a live refresh.'},{status:200});}
}
export async function POST(request:NextRequest){
 const denied=writeGuard(request);if(denied)return denied;
 try{const raw=await request.text();if(raw.length>20_000_000)return NextResponse.json({error:'Research exceeds the 20 MB save limit.'},{status:413});const body=JSON.parse(raw);
 const searchPlan=planSearch(body.query||'');
 if(!Array.isArray(body.listings)||body.listings.length>10000||!body.listings.every(validateRow)||!Array.isArray(body.sources)||!body.sources.length||body.sources.length>20||!body.sources.every((s:any)=>SELLERS.some(x=>x.name===s.seller)&&['success','partial','error'].includes(s.status)))return NextResponse.json({error:'Invalid research records.'},{status:400});
 const listings=deduplicate(body.listings.map((r:Listing)=>({...r,group:SELLERS.find(s=>s.name===r.seller)?.group||'unclassified'})));
 const result:Research={id:/^[a-zA-Z0-9-]{6,80}$/.test(body.id)?body.id:crypto.randomUUID(),query:body.query.trim(),createdAt:new Date().toISOString(),listings,sources:body.sources,searchPlan,kind:body.kind==='normalization'?'normalization':'analysis'};
 return NextResponse.json(await saveResearch(marketStore(),result));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Shared research could not be saved. Retry without closing your results.'},{status:503});}
}
