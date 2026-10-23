import { renderCadSvg } from './cadRender';

self.onmessage = ({ data }) => {
    try {
        self.postMessage({ id: data.id, preview: renderCadSvg(data.name, new Uint8Array(data.buffer)) });
    } catch (error) {
        self.postMessage({ id: data.id, error: error.message || '도면을 읽지 못했습니다.' });
    }
};

// Static imports have finished: subsequent requests can reuse this engine.
self.postMessage({ ready: true });
