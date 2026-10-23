import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService';
import { Calendar } from 'lucide-react';
import DashboardGallery from './DashboardGallery';
import packageJson from '../../package.json';
import { getAveragePeriodProgress, getProjectPeriodProgress, getSchedule } from '../services/scheduleService';

const Dashboard = () => {
    const [activeProjects, setActiveProjects] = useState([]);
    const [allProjects, setAllProjects] = useState([]);
    const [processes, setProcesses] = useState([]);

    const loadActiveProjects = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const projects = dbService.getAll('프로젝트관리');
        const allProcesses = dbService.getAll('공정관리');
        const projectsWithProgress = projects.map(project => {
            const projectProcesses = allProcesses.filter(process => process.projectId === project.id);
            const completedCount = projectProcesses.filter(process => process.isCompleted).length;
            const completionPercentage = getProjectPeriodProgress(project, allProcesses, today);
            return { ...project, completionPercentage, processCount: projectProcesses.length, completedCount };
        });
        const active = projectsWithProgress.filter(project => {
            return getSchedule(project, today).status === '진행 중';
        });

        setAllProjects(projectsWithProgress.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
        setProcesses(allProcesses);
        setActiveProjects(active);
    };

    useEffect(() => {
        const frameId = window.requestAnimationFrame(loadActiveProjects);
        return () => window.cancelAnimationFrame(frameId);
    }, []);

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    const getDaysRemaining = (endDate) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return getSchedule({ startDate: endDate, endDate }, today).daysRemaining;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const schedules = processes.map(process => getSchedule(process, today));
    const completedProcesses = schedules.filter(schedule => schedule.status === '완료').length;
    const upcomingProcesses = schedules.filter(schedule => schedule.status === '예정').length;
    const overdueProcesses = schedules.filter(schedule => schedule.status === '미완료').length;
    const inProgressProcesses = schedules.filter(schedule => schedule.status === '진행 중').length;
    const pendingProcesses = schedules.filter(schedule => schedule.status === '판정보류').length;
    const overallProgress = getAveragePeriodProgress(processes, today);

    return (
        <div className="dashboard-container">
            {/* Active Projects Card */}
            <div className="dashboard-card projects-card">
                <div className="card-header">
                    <Calendar size={20} className="header-icon" />
                    <h2>진행 중인 프로젝트</h2>
                    <div className="flex items-center gap-2">
                        <span className="version-badge">ver {packageJson.version}</span>
                        <span className="project-count">{activeProjects.length}</span>
                    </div>
                </div>

                <div className="card-content">
                    {activeProjects.length === 0 ? (
                        <div className="empty-state">
                            <Calendar size={48} className="empty-icon" />
                            <p className="empty-title">진행 중인 프로젝트가 없습니다</p>
                            <p className="empty-subtitle">프로젝트 관리 메뉴에서 새 프로젝트를 추가해 보세요</p>
                        </div>
                    ) : (
                        <div className="projects-grid">
                            {activeProjects.map(project => {
                                const daysLeft = getDaysRemaining(project.endDate);
                                const isUrgent = daysLeft <= 7;

                                return (
                                    <div key={project.id} className="project-item">
                                        <div className="project-header">
                                            <h3 className="project-title">{project.title}</h3>
                                            {isUrgent && (
                                                <span className="urgent-badge">마감임박</span>
                                            )}
                                        </div>
                                        <div className="project-meta">
                                            <div className="meta-row">
                                                <span className="meta-label">기간</span>
                                                <span className="meta-value">
                                                    {formatDate(project.startDate)} ~ {formatDate(project.endDate)}
                                                </span>
                                            </div>
                                            <div className="meta-row">
                                                <span className="meta-label">남은 기간</span>
                                                <span className={`meta-value ${isUrgent ? 'urgent' : ''}`}>
                                                    {daysLeft > 0 ? `${daysLeft}일` : '오늘 마감'}
                                                </span>
                                            </div>
                                            {project.completionPercentage !== undefined && (
                                                <div className="meta-row">
                                                    <span className="meta-label">기간 진행률</span>
                                                    <div className="progress-container">
                                                        <div className="progress-bar">
                                                            <div
                                                                className="progress-fill"
                                                                style={{ width: `${project.completionPercentage}%` }}
                                                            />
                                                        </div>
                                                        <span className="progress-text">{project.completionPercentage}%</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="dashboard-card progress-card">
                <div className="card-header">
                    <Calendar size={20} className="header-icon" />
                    <h2>공정 기간 진행률</h2>
                    <strong className="overall-progress-value">{overallProgress}%</strong>
                </div>
                <div className="card-content">
                    <div className="overall-progress-track">
                        <div className="overall-progress-fill" style={{ width: `${overallProgress}%` }} />
                    </div>
                    <div className="progress-stat-grid">
                        <div><span className="stat-dot completed-dot" /><span>완료</span><strong>{completedProcesses}</strong></div>
                        <div><span className="stat-dot active-dot" /><span>진행 중</span><strong>{inProgressProcesses}</strong></div>
                        <div><span className="stat-dot upcoming-dot" /><span>예정</span><strong>{upcomingProcesses}</strong></div>
                        <div><span className="stat-dot overdue-dot" /><span>미완료</span><strong>{overdueProcesses}</strong></div>
                        <div><span className="stat-dot pending-dot" /><span>판정보류</span><strong>{pendingProcesses}</strong></div>
                    </div>
                    <div className="project-progress-list">
                        {allProjects.length === 0 ? (
                            <p className="progress-empty">등록된 프로젝트가 없습니다.</p>
                        ) : allProjects.slice(0, 6).map(project => (
                            <div className="project-progress-row" key={project.id}>
                                <div className="project-progress-heading">
                                    <strong>{project.title}</strong>
                                    <span>{project.completedCount}/{project.processCount} 공정 · {project.completionPercentage}%</span>
                                </div>
                                <div className="project-progress-track">
                                    <div className="project-progress-fill" style={{ width: `${project.completionPercentage}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <DashboardGallery />

            <style jsx>{`
                .dashboard-container {
                    max-width: 1100px;
                    width: 100%;
                    margin: 0 auto;
                    padding: 40px 0;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                    box-sizing: border-box;
                }

                .dashboard-card {
                    background: white;
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
                    overflow: hidden;
                }

                .card-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 16px 20px;
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                    color: #1e293b;
                }

                .header-icon {
                    flex-shrink: 0;
                }

                .card-header h2 {
                    font-size: 16px;
                    font-weight: 700;
                    margin: 0;
                    flex: 1;
                    color: #334155;
                }

                .project-count {
                    background: rgba(255, 255, 255, 0.2);
                    padding: 4px 12px;
                    border-radius: 12px;
                    font-size: 14px;
                    font-weight: 600;
                }

                .version-badge {
                    background: rgba(16, 185, 129, 0.2);
                    color: #10b981;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 800;
                    border: 1px solid rgba(16, 185, 129, 0.3);
                }

                .card-content {
                    padding: 28px;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                    text-align: center;
                }

                .empty-icon {
                    color: #cbd5e1;
                    margin-bottom: 16px;
                }

                .empty-title {
                    font-size: 18px;
                    font-weight: 600;
                    color: #334155;
                    margin: 0 0 8px 0;
                }

                .empty-subtitle {
                    font-size: 14px;
                    color: #64748b;
                    margin: 0;
                }

                .projects-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 20px;
                }

                .project-item {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 20px;
                    transition: all 0.2s;
                }

                .project-item:hover {
                    border-color: #667eea;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
                }

                .project-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .project-title {
                    font-size: 16px;
                    font-weight: 700;
                    color: #1e293b;
                    margin: 0;
                    flex: 1;
                }

                .urgent-badge {
                    background: #ef4444;
                    color: white;
                    font-size: 11px;
                    font-weight: 700;
                    padding: 4px 8px;
                    border-radius: 6px;
                    white-space: nowrap;
                }

                .project-meta {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .meta-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                }

                .meta-label {
                    font-size: 13px;
                    color: #64748b;
                    font-weight: 500;
                }

                .meta-value {
                    font-size: 13px;
                    color: #334155;
                    font-weight: 600;
                }

                .meta-value.urgent {
                    color: #ef4444;
                }

                .progress-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex: 1;
                }

                .progress-bar {
                    flex: 1;
                    height: 8px;
                    background: #e2e8f0;
                    border-radius: 4px;
                    overflow: hidden;
                }

                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
                    border-radius: 4px;
                    transition: width 0.3s ease;
                }

                .progress-text {
                    font-size: 13px;
                    color: #334155;
                    font-weight: 600;
                    min-width: 40px;
                    text-align: right;
                }

                .gallery-card .card-header {
                    background: #f8fafc;
                    border-bottom: 1px solid #e2e8f0;
                }
                .gallery-card .header-icon {
                  color: #64748b;
                }
                .projects-card .header-icon {
                  color: #3b82f6;
                }
                                .overall-progress-value { margin-left: auto; color: #2563eb; font-size: 18px; }
                                .overall-progress-track, .project-progress-track { height: 9px; overflow: hidden; border-radius: 8px; background: #e2e8f0; }
                                .overall-progress-fill, .project-progress-fill { height: 100%; border-radius: inherit; background: #2563eb; transition: width .4s ease; }
                                .progress-stat-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 20px 0 24px; }
                                .progress-stat-grid > div { display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: 8px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 12px; }
                                .progress-stat-grid strong { color: #1e293b; font-size: 16px; }
                                .stat-dot { width: 9px; height: 9px; border-radius: 50%; }
                                .completed-dot { background: #10b981; } .active-dot { background: #3b82f6; } .upcoming-dot { background: #f59e0b; } .overdue-dot { background: #f43f5e; } .pending-dot { background: #94a3b8; }
                                .project-progress-list { display: flex; flex-direction: column; gap: 16px; }
                                .project-progress-heading { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 7px; font-size: 12px; }
                                .project-progress-heading strong { overflow: hidden; color: #334155; text-overflow: ellipsis; white-space: nowrap; }
                                .project-progress-heading span { flex: 0 0 auto; color: #64748b; }
                                .project-progress-track { height: 6px; }
                                .project-progress-fill { background: #10b981; }
                                .progress-empty { margin: 0; color: #64748b; font-size: 13px; }
                                @media (max-width: 640px) { .dashboard-container { padding: 20px 12px; } .progress-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .project-progress-heading { align-items: flex-start; flex-direction: column; gap: 4px; } }
            `}</style>
        </div>
    );
};

export default Dashboard;
