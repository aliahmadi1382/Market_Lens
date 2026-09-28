import {readFile} from 'node:fs/promises';
import {GitHubMarketStore} from '../lib/market/store.ts';
import {saveResearch} from '../lib/market/service.ts';
const filename=process.argv[2];if(!filename)throw new Error('Pass a JSON export containing research snapshots or D1 query results.');
const token=process.env.MARKETLENS_GITHUB_TOKEN||process.env.GITHUB_TOKEN;if(!token)throw new Error('Repository write token required.');
const store=new GitHubMarketStore(process.env.MARKETLENS_DATA_REPO||'aliahmadi1382/Market_Lens',token);
const input=JSON.parse((await readFile(filename,'utf8')).replace(/^\uFEFF/,''));
const snapshots=(Array.isArray(input)&&input[0]?.results?input.flatMap(x=>x.results).map(x=>JSON.parse(x.payload)):Array.isArray(input)?input:[input]).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
for(const snapshot of snapshots){await saveResearch(store,snapshot);console.log(`Imported ${snapshot.id}: ${snapshot.query} (${snapshot.listings.length} observations)`)}
