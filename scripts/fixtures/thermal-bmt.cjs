// Synthetic, non-user Testo-format fixture for the supported self-describing variant.
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwAooooA/9k=', 'base64');
function fixture({ version = '1.0.1', columns = 2, rows = 2, superResolution = false, editorMarkers = false } = {}) {
    const data = [];
    const n = (value, bytes, writer) => { const out = Buffer.alloc(bytes); out[writer](value, 0); return out; };
    const group = (name, nodes) => `<group name="${name}">${nodes}</group>`;
    const item = (name, type, bytes) => { data.push(bytes); return `<item name="${name}" type="${type.replaceAll('<','&lt;').replaceAll('>','&gt;')}" size="${bytes.length}"/>`; };
    const string = (name, value) => { const text = Buffer.from(value); return item(name,'string',Buffer.concat([n(text.length,4,'writeUInt32LE'),text])); };
    const temp = (name, value) => item(name,'Temperature<MarkedFloat>',n(value,4,'writeFloatLE'));
    const header = Buffer.concat([n(2,4,'writeInt32LE'),n(rows,4,'writeInt32LE'),n(columns,4,'writeInt32LE'),n(2,4,'writeInt32LE'),n(1,4,'writeInt32LE'),n(2,4,'writeInt32LE')]);
    const raw = Buffer.alloc(rows*columns*2); for(let i=0;i<rows*columns;i++)raw.writeUInt16LE(8000+i,i*2);
    const schema = Buffer.from(group('BmtMetaData',group('DeviceInfo',string('DeviceName','Testo fixture'))
        +group('Environment',item('EmissivityValue','float',n(.95,4,'writeFloatLE'))+temp('ReflectedTemperature',293.15)+temp('Temperature',293.15))
        +group('FileInfo',item('DateTime','uint64',n(1677242528n,8,'writeBigUInt64LE')))
        +group('Images',item('Ir','cvmat',Buffer.concat([header,raw]))+item('Vis','vecuint8',Buffer.concat([n(jpeg.length,4,'writeUInt32LE'),jpeg])))
        +group('IrImage',item('Cols','uint16',n(2,2,'writeUInt16LE'))+item('Rows','uint16',n(2,2,'writeUInt16LE')))
        +group('MeasPoints',group('CenterSpot',item('Position','cvpoint',Buffer.alloc(8))+item('Visible','bool',Buffer.from([1]))))
        +group('Miscellaneous',item('SuperResolution','bool',Buffer.from([superResolution?1:0]))+string('TemperatureUnit','Celsius'))
        +group('Scaling',temp('TempMin',303.15)+temp('TempMax',313.15))
        +(editorMarkers ? item('IMGADDONID_GRAPHICOBJECTS_WITH_ID','vecuint8',Buffer.from([0,0,0,0]))+item('WAS_SAVED_BY_IRSOFT','vecuint8',Buffer.from([1,0,0,0,1])) : ''))+'\n');
    const payload = Buffer.concat(data), footer = Buffer.alloc(13); footer.writeUInt32LE(13,9);
    return Buffer.concat([jpeg,Buffer.from(`<ToFo version="${version}"><xml size="${schema.length}"/><data size="${payload.length}" endianness="little"/></ToFo>\n`),schema,payload,footer]);
}
module.exports = { fixture };
