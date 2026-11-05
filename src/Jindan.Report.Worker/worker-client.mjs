import {spawn} from 'node:child_process';
import {realpath,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const PROTOCOL='jindan-worker/1',MAX_LINE=64*1024;
const inside=(root,file)=>{const relative=path.relative(root,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const errorResult=(request,code)=>({protocol:PROTOCOL,type:'result',ok:false,requestId:request?.requestId||'',projectId:request?.projectId||'',sourceSha256:request?.sourceSha256||'',operation:request?.operation||'',error:{code,message:'The owned local worker did not publish a usable result.'},reportReady:false});

/** One invocation owns exactly one Node child. Resolves only after that child
 * exits, including cancellation/timeout. Kills only that ChildProcess object,
 * never any process name, native Hancom instance, or unrelated PID. */
export async function invokeWorker({nodePath=process.execPath,workerPath,sessionDirectory,request,timeoutMs=120000,signal,onProgress}={}){
    let serialized,session,worker;
    try{
        serialized=JSON.stringify(request);
        if(!serialized||Buffer.byteLength(serialized)>MAX_LINE)return errorResult(request,'REQUEST_TOO_LARGE');
        if(!Number.isInteger(timeoutMs)||timeoutMs<25||timeoutMs>30*60*1000)return errorResult(request,'INVALID_TIMEOUT');
        session=await realpath(sessionDirectory);worker=await realpath(workerPath);
    }catch{return errorResult(request,'INVALID_REQUEST');}
    if(signal?.aborted)return errorResult(request,'CANCELLED');
    return new Promise(resolve=>{
        let child,buffer='',total=0,pending=null,failure=null,settled=false;
        const stop=code=>{if(!failure)failure=code;pending=null;try{child?.kill('SIGKILL');}catch{}};
        const aborted=()=>stop('CANCELLED');
        let timer;
        const finish=async(code)=>{
            if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);
            if(failure){resolve({...errorResult(request,failure),workerPid:child?.pid??null,workerExited:true});return;}
            if(code!==0||!pending){resolve({...errorResult(request,'WORKER_CRASH'),workerPid:child?.pid??null,workerExited:true});return;}
            if(pending.ok){
                try{
                    const descriptor=pending.resultFile,resolved=await realpath(descriptor.path),info=await stat(resolved);
                    if(!inside(path.join(session,'output'),resolved)||!info.isFile()||info.size!==descriptor.size||info.size>192*1024*1024)throw new Error();
                    const bytes=await readFile(resolved);if(createHash('sha256').update(bytes).digest('hex')!==descriptor.sha256)throw new Error();
                }catch{resolve({...errorResult(request,'INVALID_RESULT_FILE'),workerPid:child?.pid??null,workerExited:true});return;}
            }
            resolve({...pending,workerPid:child?.pid??null,workerExited:true});
        };
        try{child=spawn(nodePath,[worker,session],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});}
        catch{resolve(errorResult(request,'WORKER_START_FAILED'));return;}
        signal?.addEventListener('abort',aborted,{once:true});
        if(signal?.aborted)aborted();
        timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);
        child.on('error',()=>{failure='WORKER_START_FAILED';});
        child.on('close',code=>void finish(code));
        // Drain, never expose, untrusted diagnostics. stderr content is not a log.
        child.stderr.on('data',()=>{});
        child.stdout.on('data',chunk=>{
            if(failure)return;
            total+=chunk.length;if(total>1024*1024){stop('PROTOCOL_LIMIT');return;}
            buffer+=chunk.toString('utf8');if(Buffer.byteLength(buffer)>MAX_LINE&&!buffer.includes('\n')){stop('PROTOCOL_LIMIT');return;}
            let newline;
            while((newline=buffer.indexOf('\n'))>=0){
                const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
                if(Buffer.byteLength(line)>MAX_LINE){stop('PROTOCOL_LIMIT');return;}
                let message;try{message=JSON.parse(line);}catch{stop('INVALID_PROTOCOL');return;}
                if(message?.protocol!==PROTOCOL||['requestId','projectId','sourceSha256','operation'].some(key=>message[key]!==request[key])||message.reportReady!==false){stop('STALE_RESULT');return;}
                if(message.type==='progress'){
                    if(pending){stop('INVALID_PROTOCOL');return;}
                    try{onProgress?.(message);}catch{stop('PROGRESS_CALLBACK_FAILED');return;}
                }else if(message.type==='result'&&pending===null&&(message.ok===true||message.ok===false))pending=message;
                else{stop('INVALID_PROTOCOL');return;}
            }
        });
        child.stdin.on('error',()=>{});child.stdin.end(serialized+'\n');
    });
}
