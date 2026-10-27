import { useState } from 'react';
import ChangePassword from './ChangePassword';
import { REPORT_SECTIONS } from '../services/report/reportSections.js';
import {
    Users,
    ChevronDown,
    LogOut,
    KeyRound,
    LayoutDashboard,
    Settings,
    FileText,
    CheckSquare,
    MessageSquare
} from 'lucide-react';

const LeftSidebar = ({ onMenuSelect, activeMenu, currentUser, disabled, showAlert, showConfirm }) => {
    const [changingPassword, setChangingPassword] = useState(false);
    const [reportsOpen, setReportsOpen] = useState(true);
    const menuItems = [
        { name: '프로젝트관리', icon: <LayoutDashboard size={18} /> },
        { name: '공정관리', icon: <Settings size={18} /> },
        { name: '파일관리', icon: <FileText size={18} /> },
        { name: '보고서 작성', icon: <FileText size={18} />, children: REPORT_SECTIONS },
        { name: '할일관리', icon: <CheckSquare size={18} /> },
        { name: '전체게시판', icon: <MessageSquare size={18} /> },
        { name: '회원관리', icon: <Users size={18} />, adminOnly: true },
    ];

    const filteredMenuItems = menuItems.filter(item => {
        if (!currentUser) return false;
        if (item.adminOnly && currentUser.role !== 'admin') return false;
        return true;
    });

    const handleLogout = async () => {
        const confirmed = await showConfirm('로그아웃 하시겠습니까?');
        if (confirmed) {
            const { logout } = await import('../services/authService');
            await logout();
            window.location.reload(); // 세션 초기화 및 첫 화면으로 이동
        }
    };

    return (
        <aside className={`sidebar-left ${disabled ? 'disabled' : ''}`}>
            {/* 사용자 정보 섹션 */}
            <div className="user-profile">
                {currentUser ? (
                    <>
                        <div className="user-header">
                            <div className="user-avatar">
                                <div className="avatar-circle">
                                    {currentUser.name?.charAt(0)}
                                </div>
                            </div>
                            <button className="action-btn" title="비밀번호 변경" onClick={() => setChangingPassword(true)}><KeyRound size={16} /></button>
                            <button className="action-btn logout" title="로그아웃" onClick={handleLogout}>
                                <LogOut size={16} />
                            </button>
                        </div>
                        <div className="user-info">
                            <div className="user-name">{currentUser.name} {currentUser.position}</div>
                            <div className="user-id">ID: {currentUser.person_id}</div>
                        </div>
                    </>
                ) : (
                    <div className="user-info empty">
                        <div className="user-name">로그인이 필요합니다</div>
                    </div>
                )}
            </div>

            {/* 메뉴 리스트 */}
            <nav className="sidebar-nav">
                <div className="section-header">Main Menu</div>
                <ul className="menu-list">
                    {filteredMenuItems.map((item, index) => item.children ? (
                        <li className="menu-group" key={item.name}>
                            <button type="button" className={`menu-item menu-group-toggle ${item.children.some(child => child.menu === activeMenu) ? 'active' : ''}`} aria-expanded={reportsOpen} aria-controls="report-submenus" onClick={() => setReportsOpen(open => !open)}>
                                <span className="menu-icon">{item.icon}</span><span className="menu-text">{item.name}</span><ChevronDown size={15} className={reportsOpen ? '' : 'collapsed'} />
                            </button>
                            {reportsOpen && <ul id="report-submenus" className="menu-submenu">{item.children.map(child => <li key={child.id}><button type="button" className={`menu-item ${activeMenu === child.menu ? 'active' : ''}`} aria-current={activeMenu === child.menu ? 'page' : undefined} onClick={() => onMenuSelect(child.menu)}><span className="menu-text">{child.label}</span></button></li>)}</ul>}
                        </li>
                    ) : (
                        <li
                            key={index}
                            className={`menu-item ${activeMenu === item.name ? 'active' : ''}`}
                            onClick={() => onMenuSelect(item.name)}
                        >
                            <span className="menu-icon">{item.icon}</span>
                            <span className="menu-text">{item.name}</span>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 사이드바 하단 정보 (선택 사항) */}
            <div className="sidebar-footer">
                <p>© 2026 더죤환경기술(주)</p>
            </div>
            {changingPassword && <ChangePassword onClose={() => setChangingPassword(false)} showAlert={showAlert} />}
        </aside>
    );
};

export default LeftSidebar;
