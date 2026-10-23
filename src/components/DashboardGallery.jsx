import React, { useEffect, useState } from 'react';
import { FileText, Image } from 'lucide-react';
import { getDriveFolderTree, getFileBlob } from '../services/driveService';
import { isCadFile } from '../services/cadPreviewService';
import { collectDriveItems, sortGalleryFiles } from '../services/galleryData';
import { openImageViewer } from '../services/imageViewerService';

const THUMBNAIL_COUNT = 8;

const DashboardGallery = () => {
    const [rootFolder, setRootFolder] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [drawings, setDrawings] = useState([]);
    const [thumbnailUrls, setThumbnailUrls] = useState({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [openError, setOpenError] = useState('');

    useEffect(() => {
        let isCurrent = true;
        const createdUrls = [];
        const loadPhotos = async () => {
            try {
                const tree = await getDriveFolderTree();
                if (!isCurrent) return;
                const items = collectDriveItems(tree);
                setRootFolder(tree);
                setPhotos(items.photos);
                setDrawings(items.drawings);
                const thumbnails = await Promise.all(items.photos.slice(0, THUMBNAIL_COUNT).map(async file => {
                    try {
                        const blob = await getFileBlob(file.id);
                        if (!isCurrent) return [file.id, ''];
                        const url = URL.createObjectURL(blob);
                        createdUrls.push(url);
                        return [file.id, url];
                    } catch (error) {
                        console.warn(`Failed to load image preview: ${file.name}`, error);
                        return [file.id, ''];
                    }
                }));
                if (isCurrent) setThumbnailUrls(Object.fromEntries(thumbnails));
            } catch (error) {
                console.error('Failed to load dashboard gallery', error);
                if (isCurrent) setLoadError(true);
            } finally {
                if (isCurrent) setLoading(false);
            }
        };
        void loadPhotos();
        return () => {
            isCurrent = false;
            createdUrls.forEach(URL.revokeObjectURL);
        };
    }, []);

    const galleryFiles = sortGalleryFiles([...photos, ...drawings]).slice(0, THUMBNAIL_COUNT);
    const openPhoto = async photo => {
        setOpenError('');
        try {
            await openImageViewer(rootFolder, photo.id);
        } catch (error) {
            console.error('Failed to open image viewer', error);
            setOpenError(error.message || '이미지 뷰어 창을 열지 못했습니다.');
        }
    };

    return (
        <section className="dashboard-card gallery-card">
            <div className="card-header">
                <Image size={20} className="header-icon" />
                <h2>사진 갤러리</h2>
                <span className="gallery-count">사진 {photos.length} · 도면 {drawings.length}</span>
            </div>
            <div className="card-content">
                {openError && <p className="gallery-open-error" role="alert">{openError}</p>}
                {loading ? (
                    <div className="gallery-empty">사진을 불러오는 중입니다.</div>
                ) : loadError ? (
                    <div className="gallery-empty">사진 목록을 불러오지 못했습니다. 연결 상태를 확인해 주세요.</div>
                ) : galleryFiles.length === 0 ? (
                    <div className="gallery-empty">파일관리에서 사진이나 DWG/DXF 도면을 올리면 여기에 표시됩니다.</div>
                ) : (
                    <div className="gallery-grid">
                        {galleryFiles.map(photo => (
                            <button type="button" key={photo.id} className="gallery-thumb" onClick={() => openPhoto(photo)} aria-label={`${photo.name} 새 창에서 보기`} title="새 창에서 보기">
                                {isCadFile(photo) ? (
                                    <span className="cad-thumb"><FileText size={30} /><small>{photo.name.split('.').pop()?.toUpperCase()}</small></span>
                                ) : thumbnailUrls[photo.id] ? (
                                    <img src={thumbnailUrls[photo.id]} alt={photo.name} loading="lazy" />
                                ) : (
                                    <span className="gallery-thumb-fallback"><Image size={28} /></span>
                                )}
                                <span className="gallery-caption">
                                    <span>{photo.name}</span>
                                    <small>{photo.modifiedTime ? new Date(photo.modifiedTime).toLocaleDateString() : ''}</small>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <style>{`
                .gallery-count{margin-left:auto;color:#64748b;font-size:12px;font-weight:700}
                .gallery-empty{min-height:120px;display:grid;place-items:center;color:#64748b;font-size:13px;text-align:center}
                .gallery-open-error{margin-bottom:12px;color:#b91c1c;font-size:13px}
                .gallery-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
                .gallery-thumb{display:flex;flex-direction:column;min-width:0;padding:0;border:0;background:white;text-align:left;cursor:pointer}
                .gallery-thumb>img,.gallery-thumb-fallback,.cad-thumb{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;background:#f1f5f9}
                .gallery-thumb-fallback{display:grid;place-items:center;color:#94a3b8}
                .cad-thumb{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;color:#334155;background:#e9eef5}
                .cad-thumb small{font-size:10px;font-weight:800;letter-spacing:.08em}
                .gallery-caption{display:flex;flex-direction:column;min-width:0;margin-top:6px;color:#334155;font-size:11px;font-weight:600}
                .gallery-caption>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
                .gallery-caption small{margin-top:2px;color:#94a3b8;font-size:10px;font-weight:400}
                @media(max-width:700px){.gallery-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
            `}</style>
        </section>
    );
};

export default DashboardGallery;
