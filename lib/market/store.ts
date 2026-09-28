import {emptyIndex,type MarketIndex,type Snapshot} from './tracking.ts';
export type ReadState={revision:string|null;index:MarketIndex};
export interface MarketStore{
 kind:string;
 read():Promise<ReadState>;
 snapshot(id:string):Promise<Snapshot|null>;
 commit(revision:string|null,index:MarketIndex,snapshot?:Snapshot):Promise<boolean>;
}
export class GitHubMarketStore implements MarketStore{
 kind='github';
 private repo:string;private token:string;private branch:string;
 constructor(repo:string,token:string,branch='market-data'){
  if(!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new Error('Invalid data repository');
  this.repo=repo;this.token=token;this.branch=branch;
 }
 private async api(path:string,method='GET',body?:unknown,raw=false):Promise<any>{
  const response=await fetch(`https://api.github.com/repos/${this.repo}/${path}`,{method,headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json',...(this.token?{Authorization:`Bearer ${this.token}`} : {}),'X-GitHub-Api-Version':'2022-11-28','User-Agent':'MarketLens','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),cache:'no-store'});
  if(response.status===404&&method==='GET')return null;
  if(!response.ok){const error=new Error(`Shared repository returned HTTP ${response.status}`) as Error&{status:number};error.status=response.status;throw error;}
  return response.json();
 }
 async read():Promise<ReadState>{
  const ref=await this.api(`git/ref/heads/${this.branch}`);if(!ref)return{revision:null,index:emptyIndex()};
  const index=await this.api(`contents/market/index.json?ref=${ref.object.sha}`,'GET',undefined,true);
  if(index&&index.version!==1)throw new Error('Unsupported market data format');
  return{revision:ref.object.sha,index:index||emptyIndex()};
 }
 async snapshot(id:string):Promise<Snapshot|null>{
  if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('Invalid snapshot ID');
  return await this.api(`contents/market/snapshots/${id}.json?ref=${this.branch}`,'GET',undefined,true);
 }
 async commit(revision:string|null,index:MarketIndex,snapshot?:Snapshot):Promise<boolean>{
  if(!this.token)throw new Error('Shared repository write access is not configured.');
  const parent=revision||(await this.api('git/ref/heads/main'))?.object?.sha;
  if(!parent)throw new Error('Push the application to the main branch before enabling shared storage.');
  const base=await this.api(`git/commits/${parent}`);
  const files=[{path:'market/index.json',mode:'100644',type:'blob',content:JSON.stringify(index)}];
  if(snapshot)files.push({path:`market/snapshots/${snapshot.id}.json`,mode:'100644',type:'blob',content:JSON.stringify(snapshot)});
  const tree=await this.api('git/trees','POST',{base_tree:base.tree.sha,tree:files});
  const commit=await this.api('git/commits','POST',{message:snapshot?`Record market scan: ${snapshot.query}`:'Update market tracking state',tree:tree.sha,parents:[parent]});
  try{
   if(revision)await this.api(`git/refs/heads/${this.branch}`,'PATCH',{sha:commit.sha,force:false});
   else await this.api('git/refs','POST',{ref:`refs/heads/${this.branch}`,sha:commit.sha});
   return true;
  }catch(e){if([409,422].includes((e as any).status))return false;throw e;}
 }
}
