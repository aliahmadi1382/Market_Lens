'use client';
import {useState} from 'react';
import {SELLERS} from '@/lib/market/model';
import type {TrackedProduct} from '@/lib/market/tracking';
import {Button} from '@/components/ui/button';
import {ExternalLink,Link2} from 'lucide-react';

export function KnownItems({query,track,busy,onSaved}:{query:string;track?:TrackedProduct;busy:boolean;onSaved:()=>Promise<void>}){
 const [seller,setSeller]=useState('DIY Auto Upholstery'),[links,setLinks]=useState(''),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 async function mutate(body:object){setSaving(true);setMessage('');try{
  const response=await fetch('/api/tracking',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data:any=await response.json();if(!response.ok)throw new Error(data.error);
  await onSaved();setLinks('');setMessage('Saved. Analyze Market will recheck these links; daily refreshes include them too.');
 }catch(e){setMessage(e instanceof Error?e.message:'Links could not be saved.')}finally{setSaving(false)}}
 const items=track?.knownItems||[];
 return <details className="known-items"><summary><Link2 size={16}/> Saved product links <span>{items.length} for {query}</span></summary><div className="known-items-body">
  <p>Add missing eBay products from any account. Tracking parameters are removed; a selected <code>var</code> ID is preserved. A saved link is queued evidence, not a verified listing.</p>
  <div className="known-items-form"><label>Account<select value={seller} onChange={e=>setSeller(e.target.value)} disabled={saving||busy}>{SELLERS.filter(s=>s.ebay).map(s=><option key={s.name}>{s.name}</option>)}</select></label>
  <label>Item URLs — one per line<textarea value={links} onChange={e=>setLinks(e.target.value)} placeholder="https://www.ebay.com/itm/389580615317" rows={3} disabled={saving||busy}/></label>
  <Button disabled={!links.trim()||saving||busy} onClick={()=>mutate({action:'addItems',query,seller,urls:links.split(/\s+/).filter(Boolean)})}>{saving?'Saving…':'Save product links'}</Button></div>
  {message&&<p role="status">{message}</p>}
  {!!items.length&&<div className="known-item-list">{items.slice().sort((a,b)=>Number(b.origin==='manual')-Number(a.origin==='manual')).map(item=><div key={item.seller+item.url}>
   <a href={item.url} target="_blank" rel="noreferrer">{item.seller} · {item.url.split('/itm/')[1]} <ExternalLink size={12}/></a>
   <span>{item.outcome==='matched'?'Verified on last check':item.outcome==='not_matched'?'Different product / years':item.outcome==='blocked'?'Blocked':item.outcome==='failed'?'Read failed':'Pending item read'}{item.lastCheckedAt?' · '+new Date(item.lastCheckedAt).toLocaleString():''}</span>
   {item.message&&<small>{item.message}</small>}
   <button disabled={saving||busy} onClick={()=>mutate({action:'removeItem',id:track!.id,seller:item.seller,url:item.url})}>Remove link</button>
  </div>)}</div>}
 </div></details>;
}
