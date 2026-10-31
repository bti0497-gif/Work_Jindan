/* 
 * ==========================================================================
 * [PROTECTION ZONE] UI/UX COMPONENT - DO NOT MODIFY WITHOUT APPROVAL
 * --------------------------------------------------------------------------
 * This component's UI/UX has been finalized and approved.
 * Any modifications to layout, styling, or user interactions require
 * explicit approval to maintain consistency and prevent regressions.
 * ==========================================================================
 */
import React, { useState, useEffect, useCallback } from 'react';
import { dbService } from '../services/dbService';
import { getCurrentUser } from '../services/authService';
import { Plus, ChevronLeft, ChevronRight, Save, X, Edit, Trash2 } from 'lucide-react';

const formatDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const TaskManager = ({ showAlert, showConfirm, onDataChange }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [tasks, setTasks] = useState([]);
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [editingIsPublic, setEditingIsPublic] = useState(false);

    const loadTasks = useCallback(() => {
        const dateStr = formatDate(selectedDate);
        const allTasks = dbService.getAll('할일관리');
        const user = getCurrentUser();

        // Filter: public tasks + user's private tasks for selected date
        const dateTasks = allTasks.filter(task => {
            if (task.date !== dateStr) return false;
            if (task.isPublic) return true;
            return task.authorId === user?.person_id;
        });

        setTasks(dateTasks);
    }, [selectedDate]);

    useEffect(() => {
        const timer = setTimeout(loadTasks, 0);
        return () => clearTimeout(timer);
    }, [loadTasks]);

    const handleAddTask = () => {
        const user = getCurrentUser();
        if (!user) {
            showAlert('로그인이 필요합니다.');
            return;
        }

        // Create a temporary new task ID
        const newTaskId = 'new_' + Date.now();
        setEditingTaskId(newTaskId);
        setEditingContent('');
        setEditingIsPublic(false);
    };

    const handleSaveTask = async () => {
        const user = getCurrentUser();
        if (!user) return;

        if (!editingContent.trim()) {
            showAlert('할일 내용을 입력해 주세요.');
            return;
        }

        const isNewTask = editingTaskId.startsWith('new_');
        const targetDate = formatDate(selectedDate);
        const tempContent = editingContent;
        const tempIsPublic = editingIsPublic;

        try {
            let taskToSync;
            if (isNewTask) {
                // 1. 새 할일 데이터 생성
                taskToSync = {
                    id: crypto.randomUUID(),
                    date: targetDate,
                    content: tempContent,
                    isPublic: tempIsPublic,
                    author: user.name,
                    authorId: user.person_id,
                    createdAt: new Date().toISOString()
                };
            } else {
                // 기존 할일 수정
                const existingTask = tasks.find(t => t.id === editingTaskId);
                if (!existingTask) return;
                taskToSync = {
                    ...existingTask,
                    content: tempContent,
                    isPublic: tempIsPublic
                };
            }

            // 2. 로컬 DB 및 UI 즉시 업데이트 (낙관적 업데이트)
            dbService.save('할일관리', taskToSync);
            setEditingTaskId(null);
            setEditingContent('');
            setEditingIsPublic(false);
            loadTasks();
            showAlert('저장되었습니다.', '성공', 'success');
            if (onDataChange) onDataChange();

            // Firebase 전송은 로컬 큐에서 처리한다.

        } catch (err) {
            showAlert(`저장 실패: ${err.message}`, '오류', 'error');
        }
    };

    const handleCancelEdit = () => {
        setEditingTaskId(null);
        setEditingContent('');
        setEditingIsPublic(false);
    };

    const handleEditTask = (task) => {
        setEditingTaskId(task.id);
        setEditingContent(task.content);
        setEditingIsPublic(task.isPublic);
    };

    const handleDeleteTask = async (task) => {
        const confirmed = await showConfirm('이 할일을 삭제하시겠습니까?');
        if (!confirmed) return;

        try {
            // 1. 로컬 DB 및 UI 즉시 업데이트 (낙관적 업데이트)
            dbService.remove('할일관리', task.id);
            loadTasks();
            showAlert('삭제되었습니다.', '성공', 'success');
            if (onDataChange) onDataChange();

            // 삭제도 Firebase 전송 확인까지 큐에 보관한다.

        } catch (err) {
            showAlert(`삭제 실패: ${err.message}`, '오류', 'error');
        }
    };

    const handleVisibilityToggle = () => {
        setEditingIsPublic(!editingIsPublic);
    };

    // Calendar logic
    const getDaysInMonth = (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        return { daysInMonth, startingDayOfWeek };
    };

    const getTasksForDate = (date) => {
        const dateStr = formatDate(date);
        const allTasks = dbService.getAll('할일관리');
        const user = getCurrentUser();

        // Count tasks for this date (public + user's private)
        return allTasks.filter(task => {
            if (task.date !== dateStr) return false;
            if (task.isPublic) return true;
            return task.authorId === user?.person_id;
        });
    };

    const renderCalendar = () => {
        const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
        const days = [];

        // Empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isSelected = formatDate(date) === formatDate(selectedDate);
            const isToday = formatDate(date) === formatDate(new Date());
            const hasTasks = getTasksForDate(date).length > 0;

            days.push(
                <button
                    key={day}
                    onClick={() => setSelectedDate(date)}
                    className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${hasTasks ? 'has-tasks' : ''}`}
                >
                    {day}
                    {hasTasks && <span className="task-indicator"></span>}
                </button>
            );
        }

        return days;
    };

    const changeMonth = (delta) => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
    };

    const user = getCurrentUser();

    return (
        <div className="board-list-container relative">
            <div className="flex gap-4 h-full" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
                {/* Left Panel - Calendar */}
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100" style={{ width: '300px', flexShrink: 0 }}>
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => changeMonth(-1)} className="p-2 hover:bg-slate-50 rounded-lg">
                            <ChevronLeft size={20} className="text-slate-600" />
                        </button>
                        <h2 className="text-lg font-black text-slate-800">
                            {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
                        </h2>
                        <button onClick={() => changeMonth(1)} className="p-2 hover:bg-slate-50 rounded-lg">
                            <ChevronRight size={20} className="text-slate-600" />
                        </button>
                    </div>

                    <div className="calendar-grid">
                        <div className="calendar-header">일</div>
                        <div className="calendar-header">월</div>
                        <div className="calendar-header">화</div>
                        <div className="calendar-header">수</div>
                        <div className="calendar-header">목</div>
                        <div className="calendar-header">금</div>
                        <div className="calendar-header">토</div>
                        {renderCalendar()}
                    </div>
                </div>

                {/* Right Panel - Tasks (Flexible) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col relative flex-1 min-w-[350px]">
                    <div className="p-4 border-b border-slate-100">
                        <h2 className="text-lg font-black text-slate-800">
                            {formatDate(selectedDate)} 할일
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ paddingBottom: '80px' }}>
                        {/* Editing/New Task */}
                        {editingTaskId && (
                            <div className="space-y-2 p-3 bg-blue-50 rounded-xl border-2 border-blue-200">
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editingIsPublic}
                                        onChange={handleVisibilityToggle}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    전체 공개
                                </label>
                                <textarea
                                    value={editingContent}
                                    onChange={(e) => setEditingContent(e.target.value)}
                                    placeholder="할일을 입력하세요..."
                                    className="w-full px-4 py-3 bg-white border-none rounded-xl text-sm resize-none focus:ring-2 focus:ring-blue-300"
                                    rows={3}
                                    autoFocus
                                />
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={handleCancelEdit}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors"
                                    >
                                        <X size={14} />
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSaveTask}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                                    >
                                        <Save size={14} />
                                        저장
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Existing Tasks */}
                        {tasks.length === 0 && !editingTaskId ? (
                            <div className="text-center text-slate-400 py-8">
                                <p className="text-sm">등록된 할일이 없습니다.</p>
                            </div>
                        ) : (
                            tasks.map(task => {
                                const isOwner = task.authorId === user?.person_id;
                                const isEditing = editingTaskId === task.id;

                                if (isEditing) return null; // Skip if editing

                                return (
                                    <div key={task.id} className="space-y-2 p-3 bg-slate-50 rounded-xl">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1">
                                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{task.content}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="flex gap-2 text-[10px] text-slate-400">
                                                {task.isPublic ? (
                                                    <span>전체 공개</span>
                                                ) : (
                                                    <span>비공개 (나만 보기)</span>
                                                )}
                                                {!isOwner && <span>• 작성자: {task.author}</span>}
                                            </div>
                                            {isOwner && (
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handleEditTask(task)}
                                                        className="flex items-center gap-1 px-2 py-1 bg-slate-200 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-300 transition-colors"
                                                    >
                                                        <Edit size={12} />
                                                        수정
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteTask(task)}
                                                        className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-[10px] font-bold hover:bg-red-200 transition-colors"
                                                    >
                                                        <Trash2 size={12} />
                                                        삭제
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Fixed Add Button */}
                    {!editingTaskId && (
                        <button
                            onClick={handleAddTask}
                            className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg"
                        >
                            <Plus size={16} />
                            할일 추가
                        </button>
                    )}
                </div>
            </div>

            <style jsx>{`
                .calendar-grid {
                    display: grid;
                    grid-template-columns: repeat(7, 1fr);
                    gap: 4px;
                }
                .calendar-header {
                    text-align: center;
                    font-size: 10px;
                    font-weight: 800;
                    color: #94a3b8;
                    padding: 8px 0;
                    text-transform: uppercase;
                }
                .calendar-day {
                    aspect-ratio: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 600;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    color: #334155;
                    background: transparent;
                    border: none;
                }
                .calendar-day:hover:not(.empty) {
                    background: #f1f5f9;
                }
                .calendar-day.selected {
                    background: #3b82f6;
                    color: white;
                }
                .calendar-day.today {
                    border: 2px solid #3b82f6;
                }
                .calendar-day.empty {
                    cursor: default;
                }
                .calendar-day.has-tasks {
                    position: relative;
                }
                .task-indicator {
                    position: absolute;
                    bottom: 4px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #3b82f6;
                }
                .calendar-day.selected .task-indicator {
                    background: white;
                }
            `}</style>
        </div>
    );
};

export default TaskManager;
