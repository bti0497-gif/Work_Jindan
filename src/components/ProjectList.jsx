
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { getProjectPeriodProgress } from '../services/scheduleService';
import { Briefcase, Calendar, User, Search, RefreshCw, ChevronRight, Plus, ChevronLeft } from 'lucide-react';

const ProjectList = ({ onWriteNew, onViewProject }) => {
    const [projects, setProjects] = useState([]);
    const [filteredProjects, setFilteredProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInputValue, setSearchInputValue] = useState('');

    const loadProjects = () => {
        setLoading(true);
        try {
            const data = dbService.getAll('프로젝트관리');
            const allProcesses = dbService.getAll('공정관리');

            const sortedData = [...data].map(proj => {
                const progress = getProjectPeriodProgress(proj, allProcesses);
                return { ...proj, progress };
            }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            setProjects(sortedData);
            setFilteredProjects(sortedData);
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    useEffect(() => {
        if (!searchTerm) {
            setFilteredProjects(projects);
        } else {
            const lowerSearch = searchTerm.toLowerCase();
            const filtered = projects.filter(p =>
                p.title?.toLowerCase().includes(lowerSearch) ||
                p.author?.toLowerCase().includes(lowerSearch)
            );
            setFilteredProjects(filtered);
        }
    }, [searchTerm, projects]);

    const handleSearch = () => {
        setSearchTerm(searchInputValue);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    const clearSearch = () => {
        setSearchInputValue('');
        setSearchTerm('');
    };

    return (
        <div className="board-list-container">
            {/* Header: Title & Refresh */}
            <div className="board-header">
                <div>
                    <h1 className="board-title">프로젝트관리</h1>
                    <p className="post-count">총 {filteredProjects.length}개의 프로젝트</p>
                </div>
                <button className="refresh-btn" onClick={loadProjects} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {/* Search Bar */}
            <div className="search-section">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="프로젝트명 또는 담당자 검색"
                        value={searchInputValue}
                        onChange={(e) => setSearchInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button className="search-btn-inner" onClick={handleSearch}>
                        검색
                    </button>
                </div>
            </div>

            {/* Body: List */}
            <div className="board-body">
                {loading ? (
                    <div className="status-container font-loading">
                        <RefreshCw size={32} className="spin text-blue-500" />
                        <p>프로젝트 로딩 중...</p>
                    </div>
                ) : filteredProjects.length === 0 ? (
                    <div className="status-container empty">
                        <Briefcase size={48} className="text-slate-200" />
                        <p>{searchTerm ? '검색 결과가 없습니다.' : '등록된 프로젝트가 없습니다.'}</p>
                        {searchTerm && (
                            <button className="return-list-btn" onClick={clearSearch}>
                                <RefreshCw size={14} /> 목록으로 돌아가기
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="post-list">
                        {filteredProjects.map((proj) => (
                            <div key={proj.id} className="post-item" onClick={() => onViewProject(proj)}>
                                <div className="post-info-top">
                                    <span className="post-title-text">{proj.title}</span>
                                </div>
                                <div className="post-info-bottom flex justify-between items-center pr-10">
                                    <div className="flex gap-4">
                                        <span className="post-meta">
                                            <User size={12} /> {proj.author}
                                        </span>
                                        <span className="post-meta">
                                            <Calendar size={12} /> {proj.startDate} ~ {proj.endDate}
                                        </span>
                                    </div>

                                    {/* % 뱃지 */}
                                    <div className="flex items-center gap-1.5 min-w-[80px] justify-end" title="등록 기간 경과에 따른 진행률">
                                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-1000 ${proj.progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                                style={{ width: `${proj.progress || 0}%` }}
                                            ></div>
                                        </div>
                                        <span className={`text-[10px] font-bold w-6 text-right ${proj.progress === 100 ? 'text-green-600' : 'text-slate-400'}`}>
                                            {proj.progress || 0}%
                                        </span>
                                    </div>
                                </div>
                                <ChevronRight className="item-arrow" size={18} />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Footer: Pagination & Write */}
            <div className="board-footer">
                <div className="pagination">
                    <button className="page-btn disabled"><ChevronLeft size={16} /></button>
                    <button className="page-btn active">1</button>
                    <button className="page-btn"><ChevronRight size={16} /></button>
                </div>
                <button className="write-btn-float" onClick={onWriteNew}>
                    <Plus size={20} />
                    <span>프로젝트 등록</span>
                </button>
            </div>
        </div>
    );
};

export default ProjectList;
