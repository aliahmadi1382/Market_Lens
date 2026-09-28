import {env} from 'cloudflare:workers';
import {GitHubMarketStore} from './store';
export function settings(){
 const read=(key:string)=>(env as unknown as Record<string,string|undefined>)[key]||process.env[key]||'';
 return{repo:read('MARKETLENS_DATA_REPO')||'aliahmadi1382/Market_Lens',token:read('MARKETLENS_GITHUB_TOKEN'),password:read('MARKETLENS_TEAM_PASSWORD')};
}
export function marketStore(){const s=settings();return new GitHubMarketStore(s.repo,s.token);}
export function writeGuard(request:Request){
 const url=new URL(request.url);const origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return Response.json({error:'Cross-origin write rejected'},{status:403});
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if(!local){const password=settings().password;
  if(!password)return Response.json({error:'Team write access is not configured'},{status:503});
  const auth=request.headers.get('authorization')||'';let supplied='';try{if(auth.startsWith('Basic '))supplied=atob(auth.slice(6)).split(':').slice(1).join(':')}catch{}
  if(supplied!==password)return Response.json({error:'Sign in to update the team workspace'},{status:401,headers:{'WWW-Authenticate':'Basic realm="MarketLens team"'}});
 }
 if(!settings().token)return Response.json({error:'Repository write access is not configured'},{status:503});
 return null;
}
