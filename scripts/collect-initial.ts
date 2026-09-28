import {writeFile} from 'node:fs/promises';
import {collectSource} from '../lib/market/collectors.ts';
import {SELLERS,deduplicate} from '../lib/market/model.ts';
const query='Chevy Corvette 2005–2013';
const results=await Promise.all(SELLERS.filter(s=>s.adapter).map(s=>collectSource(s.name,query)));
const snapshot={id:'initial-public-research',query,createdAt:new Date().toISOString(),listings:deduplicate(results.flatMap(r=>r.listings)),sources:results.map(r=>r.source)};
await writeFile('data/initial.json',JSON.stringify(snapshot,null,2));
console.log(JSON.stringify({count:snapshot.listings.length,sources:snapshot.sources},null,2));
