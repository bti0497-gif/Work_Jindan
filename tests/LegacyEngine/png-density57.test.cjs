const {test}=require('node:test'),assert=require('node:assert/strict'),{withDensity,crc32}=require('./prepare-preservation57-probes.cjs');
test('diagnostic density edit preserves every IDAT byte, dimension and original byte on inverse removal',()=>{
    const source=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9p8AAAAASUVORK5CYII=','base64'),after=withDensity(source,23622,23622);
    assert.equal(after.length,source.length+21);assert.deepEqual(Buffer.concat([after.subarray(0,33),after.subarray(54)]),source);assert.equal(after.toString('ascii',37,41),'pHYs');assert.equal(after.readUInt32BE(41),23622);assert.equal(after.readUInt32BE(50),crc32(after.subarray(37,50)));
    assert.throws(()=>withDensity(after,23622,23622),/preexisting/);
});
