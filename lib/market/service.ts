import {applySnapshot,makeTrack,isDue,type MarketIndex,type TrackedProduct,type Snapshot} from './tracking.ts';
import {planSearch} from './search.ts';
import type {Research} from './model.ts';
import type {MarketStore} from './store.ts';
export async function mutateIndex<T>(store:MarketStore,update:(index:MarketIndex)=>{index:MarketIndex;result:T}){
 for(let attempt=0;attempt<5;attempt++){
  const {revision,index}=await store.read();const value=update(structuredClone(index));
  if(await store.commit(revision,value.index))return value.result;
 }
 throw new Error('Another team update is in progress. Please retry.');
}
export async function registerTrack(store:MarketStore,query:string){
 const plan=planSearch(query);const created=makeTrack(query);
 return mutateIndex(store,index=>{let track=index.tracks.find(t=>t.key===plan.key);if(!track){track=created;index.tracks.push(track)}return{index,result:track}});
}
export async function saveResearch(store:MarketStore,input:Research){
 const plan=planSearch(input.query);const newTrack=makeTrack(input.query,input.createdAt);
 for(let attempt=0;attempt<5;attempt++){
  const {revision,index}=await store.read();const track=index.tracks.find(t=>t.key===plan.key)||newTrack;
  const existing=index.runs.find(r=>r.id===input.id);if(existing){const snapshot=await store.snapshot(existing.id);if(snapshot)return snapshot;throw new Error('Saved snapshot is unavailable');}
  const previous=track.latestRunId?await store.snapshot(track.latestRunId):null;
  if(track.latestRunId&&!previous)throw new Error('Previous snapshot could not be loaded; comparison was not discarded.');
  const result=applySnapshot(index,track,input,previous);
  if(await store.commit(revision,result.index,result.snapshot))return result.snapshot;
 }
 throw new Error('Another team update was saved first. Retry to merge your results.');
}
export async function acknowledge(store:MarketStore,ids:string[]){
 return mutateIndex(store,index=>{const now=new Date().toISOString();for(const n of index.notifications)if(ids.includes(n.id))n.readAt=now;for(const t of index.tracks)t.unread=index.notifications.filter(n=>n.trackId===t.id&&!n.readAt).length;return{index,result:true}});
}
export async function claimTrack(store:MarketStore,id:string,force=false){
 return mutateIndex(store,index=>{const track=index.tracks.find(t=>t.id===id);if(!track||(!force&&!isDue(track))||track.leaseUntil&&Date.parse(track.leaseUntil)>Date.now())return{index,result:null as TrackedProduct|null};
  track.leaseId=crypto.randomUUID();track.leaseUntil=new Date(Date.now()+30*60*1000).toISOString();track.status='refreshing';return{index,result:track};});
}
export async function releaseFailure(store:MarketStore,track:TrackedProduct){
 return mutateIndex(store,index=>{const current=index.tracks.find(t=>t.id===track.id);if(current&&current.leaseId===track.leaseId){current.leaseUntil=null;current.leaseId=null;current.status='error';current.lastAttemptAt=new Date().toISOString();current.nextRefreshAt=new Date(Date.now()+60*60*1000).toISOString()}return{index,result:true}});
}
