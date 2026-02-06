import React from 'react';
import {
    Users,
    Eye,
    LogOut,
    LayoutDashboard,
    Settings,
    FileText,
    CheckSquare,
    MessageSquare
} from 'lucide-react';

const LeftSidebar = ({ onMenuSelect, activeMenu }) => {
    const menuItems = [
        { name: '프로젝트관리', icon: <LayoutDashboard size={18} /> },
        { name: '공정관리', icon: <Settings size={18} /> },
        { name: '파일관리', icon: <FileText size={18} /> },
        { name: '할일관리', icon: <CheckSquare size={18} /> },
        { name: '전체게시판', icon: <MessageSquare size={18} /> },
        { name: '회원관리', icon: <Users size={18} /> },
    ];

    return (
        <aside className="sidebar-left">
            {/* 사용자 정보 섹션 */}
            <div className="user-profile">
                <div className="user-avatar">
                    <Users size={24} />
                </div>
                <div className="user-info">
                    <div className="user-name">홍길동 차장</div>
                    <div className="user-id">ID: jindan_admin</div>
                </div>
                <div className="user-actions">
                    <button className="action-btn" title="정보 수정">
                        <Eye size={16} />
                    </button>
                    <button className="action-btn logout" title="로그아웃">
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {/* 메뉴 리스트 */}
            <nav className="sidebar-nav">
                <div className="section-header">Main Menu</div>
                <ul className="menu-list">
                    {menuItems.map((item, index) => (
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
        </aside>
    );
};

export default LeftSidebar;
