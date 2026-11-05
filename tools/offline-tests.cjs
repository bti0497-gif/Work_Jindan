// Applies to synthetic regression only; installation uses separately pinned public
// packages. Never log attempted URLs, headers or request data.
globalThis.fetch=async()=>{throw new Error('NETWORK_DISABLED_FOR_REGRESSION');};
for(const name of ['node:http','node:https']){const api=require(name);api.request=()=>{throw new Error('NETWORK_DISABLED_FOR_REGRESSION');};api.get=api.request;}
