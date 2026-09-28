import { NextRequest, NextResponse } from 'next/server';
import { collectSource } from '@/lib/market/collectors';
import {planSearch} from '@/lib/market/search';
import {writeGuard,marketStore} from '@/lib/market/server';
export async function POST(request:NextRequest){
 const denied=writeGuard(request);if(denied)return denied;
 try{const body:any=await request.json();if(typeof body.query!=='string'||typeof (body.sourceId||body.seller)!=='string')throw new Error('Enter a product name and optional year range.');planSearch(body.query);
 const {index}=await marketStore().read();const track=index.tracks.find(t=>t.key===planSearch(body.query).key);
 return NextResponse.json(await collectSource(body.sourceId||body.seller,body.query.trim(),track?.knownItems||[]));
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not read this source.'},{status:400});}
}
