export const openImageViewer = async (tree, fileId) => {
    if (window.electron?.invoke) {
        await window.electron.invoke('open-image-viewer', { tree, fileId });
        return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set('view', 'image-viewer');
    url.searchParams.set('fileId', fileId);
    const viewer = window.open(url.toString(), 'jindan-image-viewer', 'popup,width=1200,height=820,resizable=yes,scrollbars=yes');
    if (!viewer) throw new Error('이미지 뷰어 창을 열 수 없습니다. 브라우저의 팝업 허용 설정을 확인해 주세요.');
    viewer.focus();
};
