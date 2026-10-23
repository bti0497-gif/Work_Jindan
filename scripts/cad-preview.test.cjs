const { test } = require('node:test');
const assert = require('node:assert/strict');

// A large model with both a white ByLayer line and an explicit red line.
const dxf = [
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '1',
    '0', 'LAYER', '2', 'WHITE', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LINE', '8', 'WHITE', '10', '0', '20', '0', '11', '100000', '21', '50000',
    '0', 'LINE', '8', 'WHITE', '62', '1', '10', '0', '20', '50000', '11', '100000', '21', '0',
    '0', 'ENDSEC', '0', 'EOF'
].join('\n');

for (const extension of ['dxf', 'dwg']) {
    test(`${extension}: white layer lines remain visible on a dark CAD background`, async () => {
        const { readDxf, writeDwg2018 } = await import('nasjidwg');
        const { renderCadSvg } = await import('../src/services/cadRender.js');
        const content = extension === 'dwg' ? writeDwg2018(readDxf(dxf)).data : dxf;
        const { svg, width, height } = renderCadSvg(`sample.${extension}`, typeof content === 'string' ? new TextEncoder().encode(content) : content);
        assert.ok(width <= 1600 && height <= 1600);
        assert.match(svg, /<rect[^>]*fill="#111827"/);
        assert.match(svg, /<path[^>]*stroke="#ffffff"/i);
        assert.match(svg, /<path[^>]*stroke="#ff0000"/i);
        const viewBox = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
        const strokeWidth = Number(svg.match(/stroke-width="([^"]+)"/)[1]);
        const strokePixels = strokeWidth / viewBox[2] * width;
        assert.ok(strokePixels >= 1, `Expected readable line width, got ${strokePixels}px`);
    });
}

test('portrait drawings fit within the same raster pixel limit', async () => {
    const { renderCadSvg } = await import('../src/services/cadRender.js');
    const portrait = dxf.replaceAll('100000', '1000').replaceAll('50000', '500000');
    const { width, height } = renderCadSvg('portrait.dxf', new TextEncoder().encode(portrait));
    assert.ok(height > width);
    assert.ok(width <= 1600 && height <= 1600);
});
