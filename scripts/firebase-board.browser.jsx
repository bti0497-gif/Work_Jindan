import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import Login from '../src/components/Login';
import BoardList from '../src/components/BoardList';
import BoardWrite from '../src/components/BoardWrite';
import BoardView from '../src/components/BoardView';
import MemberList from '../src/components/MemberList';
import GlobalModal from '../src/components/common/GlobalModal';
import ChangePassword from '../src/components/ChangePassword';
import { getCurrentUser, logout } from '../src/services/authService';
import { dbService } from '../src/services/dbService';

export default function BoardTest() {
    const [user, setUser] = useState(getCurrentUser);
    const [view, setView] = useState('list');
    const [post, setPost] = useState(null);
    const [modal, setModal] = useState({ isOpen: false });
    const [changingPassword, setChangingPassword] = useState(false);
    const showAlert = (message, title = '알림', type = 'alert') => new Promise(resolve => setModal({
        isOpen: true, message, title, type,
        onConfirm: () => { setModal({ isOpen: false }); resolve(true); },
        onCancel: () => { setModal({ isOpen: false }); resolve(false); },
    }));
    const showConfirm = message => showAlert(message, '확인', 'confirm');
    const dialogs = { showAlert, showConfirm };
    let content;
    if (!user) content = <Login onLoginSuccess={setUser} {...dialogs} />;
    else if (view === 'members') content = <MemberList {...dialogs} />;
    else if (view === 'write') content = <BoardWrite menuName="전체게시판" initialData={post} onCancel={() => setView('list')} onSaveSuccess={() => setView('list')} {...dialogs} />;
    else if (view === 'view') content = <BoardView post={post} boardUser={user} onBack={() => setView('list')} onEdit={current => { setPost(current); setView('write'); }} onDeleteSuccess={() => setView('list')} {...dialogs} />;
    else content = <BoardList menuName="전체게시판" boardUser={user} onWriteNew={() => { setPost(null); setView('write'); }} onViewPost={item => { setPost(item); setView('view'); }} {...dialogs} />;
    return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {user && <nav style={{ padding: 10, display: 'flex', gap: 20 }}>
            <span>{user.name}</span><button onClick={() => setView('list')}>전체게시판</button>
            <button onClick={() => setView('members')}>회원관리</button>
            <button onClick={() => setChangingPassword(true)}>비밀번호 변경</button>
            <button onClick={() => {
                const rows = dbService.getAll('전체게시판').filter(post => !(post.authorId === 'legacy-user' && post.title === '로컬 원본 이전 검증'));
                dbService.setTable('전체게시판', rows);
            }}>검증용 로컬 글 정리</button>
            <button onClick={() => dbService.setTable('전체게시판', [{
                id: `legacy-${user.uid}`, menu: '전체게시판', title: '로컬 원본 이전 검증',
                content: '<p>기존 로컬 글 보존 확인</p>', author: '기존 작성자', authorId: 'legacy-user',
                createdAt: '2026-10-01T00:00:00Z', attachments: [],
                comments: [{ id: 'legacy-comment', author: '기존 댓글 작성자', content: '기존 댓글 보존 확인', createdAt: '2026-10-02T00:00:00Z' }],
            }])}>검증용 로컬 글 준비</button>
            <button onClick={async () => { await logout(); setUser(null); }}>로그아웃</button>
        </nav>}
        <main style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{content}</main>
        <GlobalModal {...modal} />
        {changingPassword && <ChangePassword onClose={() => setChangingPassword(false)} showAlert={showAlert} />}
    </div>;
}
createRoot(document.getElementById('root')).render(<BoardTest />);
