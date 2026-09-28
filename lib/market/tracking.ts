import {eligible,segmentKey,deduplicate,type Listing,type Research} from './model.ts';
import {planSearch,type SearchPlan} from './search.ts';
export const DAY=24*60*60*1000;
export type PriceEvent={id:string;trackId:string;runId:string;listingId:string;seller:string;title:string;url:string;kind:'price_down'|'price_up'|'undercut';oldPrice:number;newPrice:number;currency:string;ownPrice:number|null;observedAt:string;readAt:string|null};
export type RunSummary={id:string;trackId:string;query:string;createdAt:string;listingCount:number;sourceErrors:number;sourcePartial:number;eventCount:number;kind:string};
export type TrackedProduct={id:string;key:string;name:string;query:string;plan:SearchPlan;createdAt:string;updatedAt:string;lastAttemptAt:string|null;lastSuccessAt:string|null;nextRefreshAt:string;latestRunId:string|null;enabled:boolean;leaseUntil:string|null;leaseId:string|null;listingCount:number;status:'ready'|'partial'|'error'|'refreshing';unread:number};
export type MarketIndex={version:1;tracks:TrackedProduct[];runs:RunSummary[];notifications:PriceEvent[];updatedAt:string};
export type Snapshot=Research&{trackId:string;events:PriceEvent[];baseline:Listing[]};
export const emptyIndex=():MarketIndex=>({version:1,tracks:[],runs:[],notifications:[],updatedAt:new Date().toISOString()});
export function comparableOwnPrice(row:Listing,own:Listing[],observedAt:string){
 if(!eligible(row))return null;
 const threshold=Date.parse(observedAt)-36*60*60*1000;
 const prices=own.filter(r=>r.group==='own'&&r.available===true&&r.price!==null&&Number.isFinite(r.price)&&r.price>0&&segmentKey(r)===segmentKey(row)&&Date.parse(r.collectedAt)>=threshold).map(r=>r.price!);
 return prices.length?Math.min(...prices):null;
}
export function detectPriceEvents(previous:Listing[],current:Listing[],trackId:string,runId:string,observedAt:string):PriceEvent[]{
 const before=new Map(previous.map(r=>[r.id,r]));const own=current.filter(r=>r.group==='own');const events:PriceEvent[]=[];
 for(const row of deduplicate(current)){
  if(row.group!=='primary'||row.price===null||!Number.isFinite(row.price)||row.price<=0)continue;
  const old=before.get(row.id);if(!old||old.group!=='primary'||old.price===null||old.price<=0||old.currency!==row.currency||old.priceContext!==row.priceContext||segmentKey(old)!==segmentKey(row))continue;
  if(Math.round(old.price*100)===Math.round(row.price*100))continue;
  const ownPrice=comparableOwnPrice(row,own,observedAt);
  const undercut=ownPrice!==null&&row.available===true&&row.price<ownPrice;
  events.push({id:`${runId}:${row.id}`,trackId,runId,listingId:row.id,seller:row.seller,title:row.title,url:row.url,kind:undercut?'undercut':row.price<old.price?'price_down':'price_up',oldPrice:old.price,newPrice:row.price,currency:row.currency,ownPrice,observedAt,readAt:null});
 }
 return events;
}
export function mergeBaseline(previous:Listing[],current:Listing[]){
 const map=new Map(previous.map(r=>[r.id,r]));
 for(const r of current){const old=map.get(r.id);if(r.price===null&&old?.price!==null&&old?.currency===r.currency)continue;map.set(r.id,r);}
 return [...map.values()];
}
export function makeTrack(query:string,now=new Date().toISOString()):TrackedProduct{
 const plan=planSearch(query);
 return{id:crypto.randomUUID(),key:plan.key,name:plan.normalizedProduct.replace(/\b\w/g,c=>c.toUpperCase()),query,plan,createdAt:now,updatedAt:now,lastAttemptAt:null,lastSuccessAt:null,nextRefreshAt:now,latestRunId:null,enabled:true,leaseUntil:null,leaseId:null,listingCount:0,status:'ready',unread:0};
}
export function isDue(track:TrackedProduct,now=Date.now()){
 return track.enabled&&Date.parse(track.nextRefreshAt)<=now&&(!track.leaseUntil||Date.parse(track.leaseUntil)<=now);
}
export function applySnapshot(index:MarketIndex,track:TrackedProduct,input:Research,previous:Snapshot|null):{index:MarketIndex;snapshot:Snapshot}{
 const data=structuredClone(index);const now=input.createdAt;const stale=previous&&Date.parse(previous.createdAt)>Date.parse(now);
 if(stale)throw new Error('A newer scan was already saved. Reload the latest research.');
 const rows=deduplicate(input.listings);const events=input.kind==='normalization'?[]:detectPriceEvents(previous?.baseline||previous?.listings||[],rows,track.id,input.id,now);
 const snapshot:Snapshot={...input,trackId:track.id,searchPlan:track.plan,listings:rows,events,baseline:mergeBaseline(previous?.baseline||previous?.listings||[],rows)};
 const errors=input.sources.filter(s=>s.status==='error').length;
 const partial=input.sources.some(s=>s.status!=='success');
 const updated:TrackedProduct={...track,latestRunId:input.id,updatedAt:now,lastAttemptAt:now,lastSuccessAt:errors===input.sources.length?track.lastSuccessAt:now,nextRefreshAt:new Date(Date.parse(now)+(errors===input.sources.length?60*60*1000:DAY)).toISOString(),listingCount:rows.length,status:errors===input.sources.length?'error':partial?'partial':'ready',leaseUntil:null,leaseId:null};
 if(input.kind==='normalization'){updated.lastAttemptAt=track.lastAttemptAt;updated.lastSuccessAt=track.lastSuccessAt;updated.nextRefreshAt=track.nextRefreshAt;updated.status=track.status;updated.leaseId=track.leaseId;updated.leaseUntil=track.leaseUntil;}
 data.tracks=data.tracks.filter(t=>t.id!==track.id);data.tracks.push(updated);
 data.runs.unshift({id:input.id,trackId:track.id,query:input.query,createdAt:now,listingCount:rows.length,sourceErrors:errors,sourcePartial:input.sources.filter(s=>s.status==='partial').length,eventCount:events.length,kind:input.kind||'analysis'});
 data.notifications=[...events,...data.notifications];data.updatedAt=now;
 for(const t of data.tracks)t.unread=data.notifications.filter(n=>n.trackId===t.id&&!n.readAt).length;
 return{index:data,snapshot};
}
