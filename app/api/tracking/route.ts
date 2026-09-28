import {NextRequest,NextResponse} from 'next/server';
import {marketStore,settings,writeGuard} from '@/lib/market/server';
import {registerTrack,acknowledge,claimTrack,mutateIndex} from '@/lib/market/service';
import {addKnownItems,ebayItemUrl} from '@/lib/market/known-items';
export async function GET(request:NextRequest){
 try{const store=marketStore();const {index}=await store.read();const trackId=request.nextUrl.searchParams.get('trackId');const listingId=request.nextUrl.searchParams.get('listingId');
 if(trackId&&listingId){const runs=index.runs.filter(r=>r.trackId===trackId).slice(0,60);const series=[];
  for(let i=0;i<runs.length;i+=5){const batch=await Promise.all(runs.slice(i,i+5).map(async r=>{const snap=await store.snapshot(r.id);if(!snap)throw new Error('Historical snapshot unavailable');const row=snap.listings.find(x=>x.id===listingId);return{runId:r.id,at:r.createdAt,price:row?.price??null,currency:row?.currency||null,observed:!!row,available:row?.available??null}}));series.push(...batch)}
  return NextResponse.json({series:series.reverse(),totalRuns:index.runs.filter(r=>r.trackId===trackId).length});
 }
 return NextResponse.json({...index,repo:settings().repo,storage:'github',canWrite:!!settings().token});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Tracking data unavailable'},{status:503});}
}
export async function POST(request:NextRequest){
 const denied=writeGuard(request);if(denied)return denied;
 try{const raw=await request.text();if(raw.length>50000)return NextResponse.json({error:'Request too large'},{status:413});const body=JSON.parse(raw);const store=marketStore();
 if(body.action==='acknowledge'&&Array.isArray(body.ids)&&body.ids.every((id:any)=>typeof id==='string')){await acknowledge(store,body.ids);return NextResponse.json({ok:true})}
 if(body.action==='addItems'&&typeof body.query==='string'&&typeof body.seller==='string'){
  // Validate before creating a tracked search or writing any data.
  addKnownItems([],body.seller,body.urls);
  const track=await registerTrack(store,body.query);
  const items=await mutateIndex(store,index=>{const t=index.tracks.find(x=>x.id===track.id)!;t.knownItems=addKnownItems(t.knownItems||[],body.seller,body.urls);return{index,result:t.knownItems}});
  return NextResponse.json({ok:true,items});
 }
 if(body.action==='removeItem'&&typeof body.id==='string'&&typeof body.seller==='string'&&typeof body.url==='string'){
  const url=ebayItemUrl(body.url,body.seller);
  await mutateIndex(store,index=>{const t=index.tracks.find(x=>x.id===body.id);if(!t)throw new Error('Tracked model not found');t.knownItems=(t.knownItems||[]).filter(k=>k.url!==url||k.seller!==body.seller);return{index,result:true}});
  return NextResponse.json({ok:true});
 }
 if(body.action==='toggle'&&typeof body.id==='string'&&typeof body.enabled==='boolean'){await mutateIndex(store,index=>{const t=index.tracks.find(x=>x.id===body.id);if(!t)throw new Error('Tracked model not found');t.enabled=body.enabled;return{index,result:true}});return NextResponse.json({ok:true})}
 if(body.action==='track'&&typeof body.query==='string'){const track=await registerTrack(store,body.query);const claimed=await claimTrack(store,track.id,true);if(!claimed)return NextResponse.json({error:'This model is already being refreshed. Try again when the current scan finishes.'},{status:409});return NextResponse.json(claimed)}
 return NextResponse.json({error:'Invalid tracking operation'},{status:400});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Tracking update failed'},{status:503});}
}
