import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function reportRuntimeAssets() {
    const files=new Map();
    const add=(name,file)=>files.set(`/report-runtime/${name}`,file);
    const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
    for(const dir of ['cmaps','standard_fonts','wasm'])for(const name of fs.readdirSync(path.join(pdfRoot,dir)))if(/\.(?:bcmap|pfb|ttf|wasm)$/.test(name)||/^LICENSE/.test(name))add(`pdf/${dir}/${name}`,path.join(pdfRoot,dir,name));
    add('pdf/LICENSE',path.join(pdfRoot,'LICENSE'));
    const coreRoot=path.dirname(require.resolve('tesseract.js-core/package.json'));
    for(const name of fs.readdirSync(coreRoot))if(/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm(?:\.js)?$/.test(name))add(`ocr/${name}`,path.join(coreRoot,name));
    add('ocr/worker.min.js',path.join(path.dirname(require.resolve('tesseract.js/package.json')),'dist','worker.min.js'));
    add('ocr/LICENSE-tesseract.js',path.join(path.dirname(require.resolve('tesseract.js/package.json')),'LICENSE.md'));
    add('ocr/LICENSE-core',path.join(coreRoot,'LICENSE'));
    return {name:'report-offline-runtime',configureServer(server){server.middlewares.use((req,res,next)=>{const file=files.get(req.url?.split('?')[0]);if(!file)return next();res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');fs.createReadStream(file).pipe(res);});},generateBundle(){for(const [name,file]of files)this.emitFile({type:'asset',fileName:name.slice(1),source:fs.readFileSync(file)});}};
}
