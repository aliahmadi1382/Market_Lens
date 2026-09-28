export class PublicPageError extends Error {
  outcome:'blocked'|'failed';
  constructor(message:string,outcome:'blocked'|'failed'='failed'){super(message);this.outcome=outcome;}
}
export function isChallenge(html:string){
 if(/<title[^>]*>[^<]*(?:Security Measure|Pardon Our Interruption|Access Denied|Robot Check|Just a moment|Challenge)/i.test(html))return true;
 // Store themes often embed CAPTCHA libraries even on readable product pages.
 const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
 return visible.length<2000&&/verify you(?:'re| are) (?:a )?human|checking your browser/i.test(visible);
}
export async function readPublic(url:string,source:{domain?:string;deadline?:number},headers:Record<string,string>={}){
 let target=new URL(url);
 if(target.protocol!=='https:'||target.hostname!==source.domain||target.username||target.password)throw new PublicPageError('Unsupported source URL');
 const deadline=source.deadline??Date.now()+36000;let redirects=0,retries=0;let response:Response;
 while(true){
 const remaining=deadline-Date.now();
 if(remaining<=0)throw new PublicPageError('Source time limit reached; collection is incomplete.');
 response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(Math.min(18000,remaining)),headers:{Accept:'application/json,text/html;q=0.8','User-Agent':'MarketLens/1.0 public-product-research',...headers}});
 if([401,403,429].includes(response.status))throw new PublicPageError(`Public access blocked (HTTP ${response.status}). No claim about catalog availability can be made.`,'blocked');
 if(response.status>=300&&response.status<400){
  const location=response.headers.get('location')||'';await response.body?.cancel();
  if(/captcha|splashui|challenge|signin|login|auth/i.test(location))throw new PublicPageError('Store requires a security check or sign-in. Automated public search stopped.','blocked');
  const next=new URL(location,target);
  if(!location||next.protocol!=='https:'||next.hostname!==source.domain||next.port!==target.port||next.username||next.password||redirects++>=2)throw new PublicPageError('Unsupported store redirect; collection could not be completed.');
  target=next;continue;
 }
 // One retry for transient server errors only. Access denials are never retried.
 if([502,503,504].includes(response.status)&&retries++<1&&remaining>1000){await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,200));continue;}
 break;
 }
 if(!response.ok)throw new PublicPageError(`Store returned HTTP ${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw new PublicPageError('Empty source response');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4_000_000){await reader.cancel();throw new PublicPageError('Store response exceeded size limit');}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
 const html=new TextDecoder().decode(all);if(isChallenge(html))throw new PublicPageError('Public page requires a security check. Automated collection stopped.','blocked');return html;
}
