// Total normalization: arbitrary thrown values/getters cannot break the result
// contract. Never stringify an arbitrary thrown object or document/evidence bytes.
export function engineFailure(error,{cancelled=false}={}){
    if(cancelled)return {code:'CANCELLED',message:'Operation cancelled; no output was published.'};
    let code='ENGINE_ERROR',message='Engine operation failed.';
    try{if(typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(error.code))code=error.code;}catch{}
    try{if(error instanceof Error&&typeof error.message==='string'&&error.message.trim())message=error.message.slice(0,500);}catch{}
    message=message.replace(/\bsk-[\w-]+\b/gi,'[redacted]').replace(/\bBearer\s+\S+/gi,'Bearer [redacted]').replace(/((?:api[_-]?key|password|token|secret)\s*[=:]\s*)[^\s,;]+/gi,'$1[redacted]');
    return {code,message};
}
