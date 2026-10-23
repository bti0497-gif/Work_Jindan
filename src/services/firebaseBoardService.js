import { collection, doc, getDocsFromServer, onSnapshot, query, runTransaction, where } from 'firebase/firestore';
import { getFirebase } from './firebaseClient';
import { getBoardUser } from './firebaseBoardAuth';
import { assertBoardMenu, canEditPost, COMMENTS_COLLECTION, makePost, POSTS_COLLECTION } from './boardModel';

const requireUser = async () => {
    const user = await getBoardUser();
    if (!user) throw new Error('게시판에 로그인해 주세요.');
    return user;
};
const postRef = id => doc(getFirebase().db, POSTS_COLLECTION, id);
const unpack = snapshot => ({ ...snapshot.data(), id: snapshot.id });
const listQuery = menu => query(collection(getFirebase().db, POSTS_COLLECTION), where('menu', '==', menu));
const unpackList = snapshot => snapshot.docs.map(unpack).filter(post => !post.deleted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const firebaseBoardService = {
    list: async menu => {
        assertBoardMenu(menu);
        await requireUser();
        return unpackList(await getDocsFromServer(listQuery(menu)));
    },

    watchList: (menu, onData, onError) => {
        assertBoardMenu(menu);
        return onSnapshot(listQuery(menu), snapshot => onData(unpackList(snapshot)), onError);
    },

    watchPost: (id, onData, onError) => onSnapshot(postRef(id), snapshot => {
        onData(snapshot.exists() && !snapshot.data().deleted ? unpack(snapshot) : null);
    }, onError),

    watchComments: (id, onData, onError) => onSnapshot(
        query(collection(getFirebase().db, COMMENTS_COLLECTION), where('postId', '==', id)),
        snapshot => onData(snapshot.docs.map(unpack).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
        onError,
    ),

    save: async input => {
        const user = await requireUser();
        const id = input.id || crypto.randomUUID();
        return runTransaction(getFirebase().db, async transaction => {
            const ref = postRef(id);
            const current = await transaction.get(ref);
            const existing = current.exists() ? unpack(current) : null;
            if (existing && (!canEditPost(existing, user) || existing.deleted)) {
                throw new Error('이 게시글을 수정할 수 없습니다.');
            }
            if (input.id && !existing) throw new Error('게시글이 삭제되었거나 존재하지 않습니다.');
            if (existing && input.expectedUpdatedAt && existing.updatedAt !== input.expectedUpdatedAt) {
                throw new Error('다른 창에서 글이 변경되었습니다. 글을 다시 열고 수정해 주세요.');
            }
            const post = makePost({ ...input, id }, user, existing);
            transaction.set(ref, post);
            return post;
        });
    },

    remove: async id => {
        const user = await requireUser();
        await runTransaction(getFirebase().db, async transaction => {
            const ref = postRef(id);
            const current = await transaction.get(ref);
            if (!current.exists()) throw new Error('게시글이 존재하지 않습니다.');
            if (!canEditPost(unpack(current), user)) throw new Error('이 게시글을 삭제할 수 없습니다.');
            transaction.update(ref, { deleted: true, updatedAt: new Date().toISOString() });
        });
    },

    comment: async (id, content) => {
        const user = await requireUser();
        if (!content.trim() || content.length > 10000) throw new Error('댓글은 1~10,000자로 입력해 주세요.');
        const ref = doc(collection(getFirebase().db, COMMENTS_COLLECTION));
        const comment = {
            id: ref.id, postId: id, content: content.trim(),
            ownerUid: user.uid, author: `${user.name} ${user.position}`.trim(),
            createdAt: new Date().toISOString(),
        };
        await runTransaction(getFirebase().db, async transaction => {
            const post = await transaction.get(postRef(id));
            if (!post.exists() || post.data().deleted) throw new Error('게시글이 삭제되었습니다.');
            transaction.set(ref, comment);
        });
        return comment;
    },

    importLocal: async (menu, posts) => {
        assertBoardMenu(menu);
        const user = await requireUser();
        if (user.role !== 'admin') throw new Error('관리자만 기존 게시글을 가져올 수 있습니다.');
        let imported = 0;
        let skipped = 0;
        for (const legacy of posts) {
            if (!legacy.id || String(legacy.id).includes('/')) { skipped++; continue; }
            const didImport = await runTransaction(getFirebase().db, async transaction => {
                const ref = postRef(String(legacy.id));
                const current = await transaction.get(ref);
                if (current.exists()) return false;
                const post = makePost({ ...legacy, id: String(legacy.id), menu }, user);
                transaction.set(ref, {
                    ...post,
                    author: legacy.author || post.author,
                    authorId: legacy.authorId || post.authorId,
                    createdAt: legacy.createdAt || post.createdAt,
                    migratedBy: user.uid,
                });
                for (const [index, oldComment] of (legacy.comments || []).entries()) {
                    if (!oldComment.content?.trim()) continue;
                    const commentId = `${legacy.id}_${index}`;
                    transaction.set(doc(getFirebase().db, COMMENTS_COLLECTION, commentId), {
                        id: commentId, postId: String(legacy.id), ownerUid: user.uid,
                        author: oldComment.author || user.name,
                        content: oldComment.content,
                        createdAt: oldComment.createdAt || post.createdAt,
                    });
                }
                return true;
            });
            if (didImport) imported++; else skipped++;
        }
        return { imported, skipped };
    },
};
