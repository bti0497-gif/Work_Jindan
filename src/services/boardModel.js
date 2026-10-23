export const BOARD_MENUS = ['본사공지', '전체게시판'];
export const POSTS_COLLECTION = 'jindan_board_posts';
export const COMMENTS_COLLECTION = 'jindan_board_comments';

export const assertBoardMenu = menu => {
    if (!BOARD_MENUS.includes(menu)) throw new Error('게시판을 선택해 주세요.');
};

export const makePost = (input, user, existing = null, now = new Date().toISOString()) => {
    assertBoardMenu(input.menu);
    const title = input.title?.trim();
    const content = input.content || '';
    if (!title || !content.trim()) throw new Error('제목과 내용을 입력해 주세요.');
    if (title.length > 300) throw new Error('제목은 300자 이내로 입력해 주세요.');
    if (new TextEncoder().encode(content).length > 600000) {
        throw new Error('본문이 너무 큽니다. 이미지는 첨부파일로 추가해 주세요.');
    }
    const attachments = (input.attachments || []).map(file => ({
        id: file.id,
        name: file.name || '',
        size: Number(file.size) || 0,
        mimeType: file.mimeType || file.type || '',
    }));
    if (attachments.length > 10 || attachments.some(file => !file.id)) {
        throw new Error('첨부파일을 확인해 주세요. 최대 10개까지 첨부할 수 있습니다.');
    }
    return {
        ...(existing?.migratedBy ? { migratedBy: existing.migratedBy } : {}),
        id: existing?.id || input.id || crypto.randomUUID(),
        menu: existing?.menu || input.menu,
        title,
        content,
        attachments,
        author: existing?.author || user.name,
        authorId: existing?.authorId || user.person_id,
        ownerUid: existing?.ownerUid || user.uid,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        deleted: false,
    };
};

export const canEditPost = (post, user) => !!user && (
    post.ownerUid === user.uid || user.role === 'admin'
);
