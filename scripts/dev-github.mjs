import {spawnSync} from 'node:child_process';
const token=spawnSync('gh',['auth','token'],{encoding:'utf8',windowsHide:true});
if(token.status!==0||!token.stdout.trim())throw new Error('Sign in with gh auth login before starting the shared-data app.');
process.env.MARKETLENS_GITHUB_TOKEN=token.stdout.trim();
process.env.MARKETLENS_DATA_REPO||='aliahmadi1382/Market_Lens';
process.argv=[process.argv[0],process.argv[1],'dev'];
await import('./run-framework.mjs');
