export class PublicPageError extends Error {
  outcome:'blocked'|'failed';
  constructor(message:string,outcome:'blocked'|'failed'='failed'){super(message);this.outcome=outcome;}
}
export function isChallenge(html:string){
 return /<title[^>]*>[^<]*(?:Security Measure|Pardon Our Interruption|Access Denied|Robot Check)/i.test(html)||/verify you(?:'re| are) (?:a )?human|checking your browser|id=["']captcha|id=["']captcha_form/i.test(html);
}
export async function readPublic(url:string,source:{domain?:string;deadline?:number},headers:Record<string,string>={}){
 const target=new URL(url);
 if(target.protocol!=='https:'||target.hostname!==source.domain||target.username||target.password)throw new PublicPageError('Unsupported source URL');
 const remaining=(source.deadline??Date.now()+18000)-Date.now();
 if(remaining<=0)throw new PublicPageError('Source time limit reached; collection is incomplete.');
 const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(Math.min(18000,remaining)),headers:{Accept:'application/json,text/html;q=0.8','User-Agent':'MarketLens/1.0 public-product-research',...headers}});
 if([401,403,429].includes(response.status))throw new PublicPageError(`Public access blocked (HTTP ${response.status}). No claim about catalog availability can be made.`,'blocked');
 if(response.status>=300&&response.status<400){const location=response.headers.get('location')||'';if(/captcha|splashui|challenge|signin/i.test(location))throw new PublicPageError('eBay requires a security check or sign-in. Automated public search stopped.','blocked');throw new PublicPageError('The store redirected the request; collection could not be completed.');}
 if(!response.ok)throw new PublicPageError(`Store returned HTTP ${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw new PublicPageError('Empty source response');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4_000_000){await reader.cancel();throw new PublicPageError('Store response exceeded size limit');}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
 const html=new TextDecoder().decode(all);if(isChallenge(html))throw new PublicPageError('Public page requires a security check. Automated collection stopped.','blocked');return html;
}
