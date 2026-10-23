// Bound compressed previews; object URLs and decoded images belong to the view.
export const createPreviewCache = ({ maxEntries = 6, maxBytes = 32 * 1024 * 1024 } = {}) => {
    const entries = new Map();
    const pending = new Map();
    let bytes = 0;
    const remember = (key, blob) => {
        if (blob.size > maxBytes) return;
        entries.set(key, blob);
        bytes += blob.size;
        while (entries.size > maxEntries || bytes > maxBytes) {
            const oldest = entries.keys().next().value;
            bytes -= entries.get(oldest).size;
            entries.delete(oldest);
        }
    };
    return {
        load: (key, produce, signal) => {
            if (signal?.aborted) return Promise.reject(new DOMException('Preview cancelled', 'AbortError'));
            if (entries.has(key)) {
                const blob = entries.get(key);
                entries.delete(key);
                entries.set(key, blob);
                return Promise.resolve(blob);
            }
            let job = pending.get(key);
            if (!job) {
                job = { controller: new AbortController(), consumers: 0, settled: false };
                pending.set(key, job);
                job.promise = Promise.resolve().then(() => {
                    job.controller.signal.throwIfAborted();
                    return produce(job.controller.signal);
                }).then(blob => {
                    if (!job.controller.signal.aborted) remember(key, blob);
                    return blob;
                }).finally(() => {
                    job.settled = true;
                    if (pending.get(key) === job) pending.delete(key);
                });
            }
            job.consumers += 1;
            return new Promise((resolve, reject) => {
                let finished = false;
                const finish = (callback, value) => {
                    if (finished) return;
                    finished = true;
                    signal?.removeEventListener('abort', abort);
                    job.consumers -= 1;
                    if (!job.consumers && !job.settled) {
                        job.controller.abort();
                        if (pending.get(key) === job) pending.delete(key);
                    }
                    callback(value);
                };
                const abort = () => finish(reject, new DOMException('Preview cancelled', 'AbortError'));
                signal?.addEventListener('abort', abort, { once: true });
                job.promise.then(blob => finish(resolve, blob), error => finish(reject, error));
            });
        }
    };
};
