import {GitHubMarketStore} from '../lib/market/store.ts';
import {claimTrack,saveResearch,releaseFailure} from '../lib/market/service.ts';
import {isDue} from '../lib/market/tracking.ts';
import {COLLECTION_SOURCES,deduplicate,type Research} from '../lib/market/model.ts';
import {collectSource} from '../lib/market/collectors.ts';
const repo=process.env.MARKETLENS_DATA_REPO||process.env.GITHUB_REPOSITORY||'aliahmadi1382/Market_Lens';
const token=process.env.MARKETLENS_GITHUB_TOKEN||process.env.GITHUB_TOKEN;
if(!token)throw new Error('Repository write token is required.');
const store=new GitHubMarketStore(repo,token);const force=process.argv.includes('--force');
const target=process.argv.find(x=>x.startsWith('--track-id='))?.slice('--track-id='.length);
const {index}=await store.read();const due=index.tracks.filter(t=>t.enabled&&(!target||t.id===target)&&(force||isDue(t)));
console.log(`${due.length} tracked searches due; ${index.tracks.length} total.`);
let failures=0;
for(const item of due){
 const track=await claimTrack(store,item.id,force);if(!track)continue;
 try{
  console.log(`Refreshing ${track.name}; ${track.plan.minYear??'all'}–${track.plan.maxYear??'years'}`);
  const sources=COLLECTION_SOURCES;const results=[];
  for(let i=0;i<sources.length;i+=2)results.push(...await Promise.all(sources.slice(i,i+2).map(s=>collectSource(s.id,track.query,track.knownItems||[]))));
  const research:Research={id:crypto.randomUUID(),query:track.query,createdAt:new Date().toISOString(),listings:deduplicate(results.flatMap(r=>r.listings)),sources:results.map(r=>r.source),kind:'refresh',searchPlan:track.plan};
  const saved=await saveResearch(store,research);
  console.log(`Saved ${saved.listings.length} variants; ${saved.events.length} price notifications; ${saved.sources.filter(s=>s.status==='error').length} source errors.`);
  if(saved.sources.every(s=>s.status==='error'))failures++;
 }catch(error){failures++;await releaseFailure(store,track);console.error(`Refresh failed for ${track.name}: ${error instanceof Error?error.message:'unknown error'}`)}
}
if(failures)process.exitCode=1;
