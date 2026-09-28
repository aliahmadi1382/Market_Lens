import {GitHubMarketStore} from '../lib/market/store.ts';
import {SELLERS,type Listing} from '../lib/market/model.ts';
const token=process.env.MARKETLENS_GITHUB_TOKEN||process.env.GITHUB_TOKEN;
if(!token)throw new Error('Repository write token required');
const store=new GitHubMarketStore(process.env.MARKETLENS_DATA_REPO||'aliahmadi1382/Market_Lens',token);
const names=new Set(SELLERS.filter(s=>s.adapter==='shopify').map(s=>s.name));
const note='Currency correction: the original Shopify price currency was not verified. Raw amount retained for audit; excluded from price analysis.';
const fix=(row:Listing):Listing=>names.has(row.seller)&&!row.priceContext&&row.price!==null?{...row,unverifiedPrice:row.price,unverifiedCurrency:row.currency,price:null,currency:'XXX',warnings:[...row.warnings,note]}:row;
const start=await store.read();
for(const run of start.index.runs){
 for(let attempt=0;attempt<5;attempt++){
  const {revision,index}=await store.read();const snapshot=await store.snapshot(run.id);if(!snapshot)throw new Error('Missing snapshot');
  if(!snapshot.listings.some(r=>names.has(r.seller)&&!r.priceContext&&r.price!==null))break;
  const invalidIds=new Set(snapshot.listings.filter(r=>names.has(r.seller)&&!r.priceContext).map(r=>r.id));
  const corrected={...snapshot,listings:snapshot.listings.map(fix),baseline:snapshot.baseline.map(fix),events:snapshot.events.filter(e=>!invalidIds.has(e.listingId)),dataQualityNotes:[note],sources:snapshot.sources.map(s=>names.has(s.seller)?{...s,status:'partial' as const,message:s.message+' '+note}:s)};
  index.notifications=index.notifications.filter(e=>e.runId!==run.id||!invalidIds.has(e.listingId));
  const summary=index.runs.find(r=>r.id===run.id)!;summary.eventCount=corrected.events.length;summary.sourcePartial=corrected.sources.filter(s=>s.status==='partial').length;
  for(const t of index.tracks)t.unread=index.notifications.filter(n=>n.trackId===t.id&&!n.readAt).length;
  if(await store.commit(revision,index,corrected)){console.log('Corrected unverified currency in '+run.id);break;}
  if(attempt===4)throw new Error('Concurrent correction failed');
 }
}
