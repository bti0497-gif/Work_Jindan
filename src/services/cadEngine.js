// Keep the imported CAD engine alive between drawings. Only one parse runs at
// a time; cancelling a running parse replaces the worker without losing queued jobs.
export const createCadEngine = createWorker => {
    let instance = null;
    let active = null;
    let sequence = 0;
    const queue = [];
    const abortError = () => new DOMException('Preview cancelled', 'AbortError');
    const finish = (job, error, preview) => {
        job.signal?.removeEventListener('abort', job.abort);
        if (error) job.reject(error);
        else job.resolve(preview);
    };
    const stop = error => {
        if (!instance) return;
        const previous = instance;
        instance = null;
        clearTimeout(previous.timeout);
        previous.rejectReady(error);
        previous.worker.terminate();
    };
    const fail = error => {
        stop(error);
        if (active) {
            finish(active, error);
            active = null;
        }
        queue.splice(0).forEach(job => finish(job, error));
    };
    const drain = () => {
        if (active || !instance?.ready || !queue.length) return;
        active = queue.shift();
        try {
            instance.worker.postMessage({ id: active.id, name: active.name, buffer: active.buffer }, [active.buffer]);
        } catch (error) {
            const failed = active;
            active = null;
            finish(failed, error);
            drain();
        }
    };
    const ensureWorker = () => {
        if (instance) return instance.promise;
        const worker = createWorker();
        const current = { worker, ready: false };
        current.promise = new Promise((resolve, reject) => {
            current.resolveReady = resolve;
            current.rejectReady = reject;
        });
        // A queued render also owns this promise, even without a warm-up caller.
        current.promise.catch(() => {});
        instance = current;
        current.timeout = setTimeout(() => {
            if (instance === current) fail(new Error('도면 엔진을 준비하는 데 시간이 너무 오래 걸립니다. 다시 열어 주세요.'));
        }, 30000);
        worker.onmessage = ({ data }) => {
            if (instance !== current) return;
            if (data.ready) {
                current.ready = true;
                clearTimeout(current.timeout);
                current.resolveReady();
                drain();
            } else if (active?.id === data.id) {
                const completed = active;
                active = null;
                finish(completed, data.error ? new Error(data.error) : null, data.preview);
                drain();
            }
        };
        worker.onerror = () => {
            if (instance === current) fail(new Error('도면 엔진을 실행하지 못했습니다. 다시 열어 주세요.'));
        };
        worker.onmessageerror = () => {
            if (instance === current) fail(new Error('도면 변환 결과를 읽지 못했습니다.'));
        };
        return current.promise;
    };
    const warm = () => {
        try { return ensureWorker(); }
        catch (error) { return Promise.reject(error); }
    };
    return {
        warm,
        render: (name, buffer, signal) => {
            if (signal?.aborted) return Promise.reject(abortError());
            return new Promise((resolve, reject) => {
                const job = { id: ++sequence, name, buffer, signal, resolve, reject };
                job.abort = () => {
                    if (active === job) {
                        active = null;
                        stop(abortError());
                        finish(job, abortError());
                        try { ensureWorker(); }
                        catch (error) { fail(error); }
                    } else {
                        const index = queue.indexOf(job);
                        if (index >= 0) queue.splice(index, 1);
                        finish(job, abortError());
                    }
                };
                signal?.addEventListener('abort', job.abort, { once: true });
                queue.push(job);
                try {
                    ensureWorker();
                    drain();
                } catch (error) {
                    fail(error);
                }
            });
        },
        dispose: () => fail(abortError())
    };
};
