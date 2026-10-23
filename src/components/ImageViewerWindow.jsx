import React, { useEffect, useState } from 'react';
import { getDriveFolderTree } from '../services/driveService';
import ImageViewer from './ImageViewer';
import { warmCadEngine } from '../services/cadPreviewService';
import './ImageViewer.css';

const ImageViewerWindow = () => {
    const [session, setSession] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let isCurrent = true;
        let receivedUpdate = false;
        warmCadEngine().catch(error => console.warn('CAD engine warm-up failed; retrying on demand', error));
        const show = data => {
            if (!isCurrent || !data?.tree) return;
            setSession(current => data.requestId && current?.data.requestId === data.requestId
                ? current : { data, revision: (current?.revision || 0) + 1 });
            setError('');
        };
        const unsubscribe = window.electron?.receive('image-viewer-data', data => {
            receivedUpdate = true;
            show(data);
        });
        const load = async () => {
            try {
                if (window.electron?.invoke) {
                    const data = await window.electron.invoke('get-image-viewer-data');
                    // A hidden preloaded viewer waits for the first selection.
                    if (!receivedUpdate && data?.tree) show(data);
                } else {
                    const tree = await getDriveFolderTree();
                    show({ tree, fileId: new URLSearchParams(window.location.search).get('fileId') });
                }
            } catch (error) {
                console.error('Failed to initialize image viewer', error);
                if (isCurrent) setError('이미지 뷰어를 불러오지 못했습니다. 창을 닫고 다시 열어 주세요.');
            }
        };
        void load();
        return () => {
            isCurrent = false;
            unsubscribe?.();
        };
    }, []);

    if (!session) return <div className="standalone-viewer-message" role="status">{error || '이미지 뷰어를 준비하는 중입니다.'}</div>;
    return <ImageViewer key={session.revision} tree={session.data.tree} initialFileId={session.data.fileId} />;
};

export default ImageViewerWindow;
