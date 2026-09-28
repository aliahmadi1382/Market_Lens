'use client';
import {ExternalLink,Info,TriangleAlert,Check,Globe2} from 'lucide-react';
import {COLLECTION_SOURCES,SELLERS,type SourceStatus,type Seller} from '@/lib/market/model';
import {date} from './market-ui';
import {ebaySellerUrl} from '@/lib/market/ebay-urls';
export function sourceOutcome(s:SourceStatus){return s.outcome||(s.status==='error'?'failed':s.status==='partial'?'partial':s.count?'matches':'no_matches');}
const labels:Record<string,string>={matches:'Matches found',no_matches:'No matches in searched pages',partial:'Partial coverage',blocked:'Blocked by source',failed:'Search failed',not_configured:'Link needed'};
export function CoverageSummary({sources,onDetails,busy}:{sources:SourceStatus[];onDetails:()=>void;busy:boolean}){
 const matches=sources.filter(s=>s.count>0).length,blocked=sources.filter(s=>sourceOutcome(s)==='blocked').length,failed=sources.filter(s=>sourceOutcome(s)==='failed').length;
 const configured=COLLECTION_SOURCES.filter(s=>s.channel!=='unconfigured');
 return <div className="collection-summary"><Globe2 size={18}/><div><strong>{new Set(configured.map(s=>s.seller)).size} of {SELLERS.length} accounts connected · {configured.filter(s=>s.channel==='website').length} websites + {configured.filter(s=>s.channel==='ebay').length} eBay sources</strong><p>{busy?'Scan in progress':`${sources.length} source reports in this snapshot`} · {matches} with matches · {blocked} blocked · {failed} failed. Blocked or partial searches cannot establish that an account has no products.</p></div><button className="text-button" onClick={onDetails}>View source results <ExternalLink size={14}/></button></div>;
}
export function SourceReports({sources,busy}:{sources:SourceStatus[];busy:boolean}){
 return <div className="source-status-list">{COLLECTION_SOURCES.map(config=>{
  const s=sources.find(x=>x.sourceId===config.id||!x.sourceId&&config.channel==='website'&&x.seller===config.seller);const outcome=s?sourceOutcome(s):config.channel==='unconfigured'?'not_configured':'pending';
  return <div className="source-status" key={config.id}><span className={'source-state '+(outcome==='matches'?'success':['failed','blocked'].includes(outcome)?'error':'partial')}>{outcome==='matches'?<Check size={17}/>:['failed','blocked'].includes(outcome)?<TriangleAlert size={17}/>:<Info size={17}/>}</span><div><strong>{config.seller}<b>{s?.count??0} observations{s?.productCount!==undefined&&` · ${s.productCount} products`}</b></strong><small>{config.channel==='ebay'?'eBay':config.channel==='website'?'Website':'Unconfigured'} · {labels[outcome]||(busy?'Waiting for result':'Not searched in this snapshot')}</small><p>{s?.message||(config.channel==='unconfigured'?'Provide this account’s public store URL to enable collection.':busy?'Queued or collecting public pages.':'Run Analyze Market to include this source.')}</p><small>{s?date(s.collectedAt):''}{config.url&&<> · <a href={s?.searchUrl||config.url} target="_blank" rel="noreferrer">{config.channel==='ebay'?'Open eBay search':'Open website'} <ExternalLink size={11}/></a></>}</small></div></div>;
 })}</div>;
}
export function AccountLinks({seller:s}:{seller:Seller}){return <div className="account-source-links">{s.domain&&<a href={'https://'+s.domain} target="_blank" rel="noreferrer">Website <ExternalLink size={12}/></a>}{s.ebay&&<a href={ebaySellerUrl(s)} target="_blank" rel="noreferrer">eBay <ExternalLink size={12}/></a>}</div>}
