const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif']);
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif']);
const CAD_EXTENSIONS = new Set(['dwg', 'dxf']);
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export const sortGalleryFiles = files => [...files].sort((a, b) =>
    (Date.parse(b.modifiedTime || '') || 0) - (Date.parse(a.modifiedTime || '') || 0));

export const collectDriveItems = rootFolder => {
    const folders = [];
    const photos = [];
    const drawings = [];
    const visit = (folder, folderPath = []) => {
        const path = [...folderPath, folder.name];
        folders.push({ ...folder, folderPath: path });
        for (const child of folder.children || []) {
            if (child.mimeType === FOLDER_MIME_TYPE) {
                visit(child, path);
            } else {
                const extension = child.name.split('.').pop()?.toLowerCase();
                const item = { ...child, parentFolderId: folder.id, folderPath: path };
                if (IMAGE_EXTENSIONS.has(extension) || IMAGE_MIME_TYPES.has(child.mimeType?.toLowerCase())) {
                    photos.push(item);
                } else if (CAD_EXTENSIONS.has(extension)) {
                    drawings.push(item);
                }
            }
        }
    };
    if (rootFolder) visit(rootFolder);
    return { folders, photos: sortGalleryFiles(photos), drawings: sortGalleryFiles(drawings) };
};

export const findFolderTrail = (folder, folderId, trail = []) => {
    if (!folder) return [];
    const currentTrail = [...trail, folder.id];
    if (folder.id === folderId) return currentTrail;
    for (const child of folder.children || []) {
        if (child.mimeType !== FOLDER_MIME_TYPE) continue;
        const result = findFolderTrail(child, folderId, currentTrail);
        if (result.length) return result;
    }
    return [];
};
