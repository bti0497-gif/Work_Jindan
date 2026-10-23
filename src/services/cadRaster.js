export const rasterizeCadSvg = async ({ svg, width, height }, signal) => {
    signal?.throwIfAborted();
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let abort;
    try {
        return await new Promise((resolve, reject) => {
            abort = () => reject(new DOMException('Preview cancelled', 'AbortError'));
            signal?.addEventListener('abort', abort, { once: true });
            image.onerror = () => reject(new Error('도면 이미지 변환에 실패했습니다.'));
            image.onload = () => {
                try {
                    signal?.throwIfAborted();
                    const context = canvas.getContext('2d', { alpha: false });
                    if (!context) throw new Error('도면 이미지를 만들 수 없습니다.');
                    context.drawImage(image, 0, 0, width, height);
                    canvas.toBlob(blob => {
                        if (signal?.aborted) abort();
                        else if (blob) resolve(blob);
                        else reject(new Error('도면 이미지 저장에 실패했습니다.'));
                    }, 'image/png');
                } catch (error) {
                    reject(error);
                }
            };
            image.src = svgUrl;
        });
    } finally {
        signal?.removeEventListener('abort', abort);
        image.onload = null;
        image.onerror = null;
        image.removeAttribute('src');
        URL.revokeObjectURL(svgUrl);
        canvas.width = 0;
        canvas.height = 0;
    }
};
