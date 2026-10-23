const DAY_MS = 86400000;

// Compare calendar days, avoiding the UTC 09:00 offset of YYYY-MM-DD in Korea.
const calendarDay = value => {
    if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS;
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value || '');
    if (!match) return NaN;
    const [, year, month, day] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    return date.getTime() / DAY_MS;
};

export const getSchedule = (record, today = new Date()) => {
    const start = calendarDay(record.startDate);
    const end = calendarDay(record.endDate);
    const current = calendarDay(today);
    if (![start, end, current].every(Number.isFinite) || end < start) {
        return { progress: 0, status: '판정보류', daysRemaining: null, isValid: false };
    }
    const status = current < start ? '예정' : current <= end ? '진행 중'
        : record.isCompleted ? '완료' : '미완료';
    // The end date is included. 100% means the entire registered period passed.
    const progress = current < start ? 0 : current > end ? 100
        : Math.min(99, Math.round((current - start) / (end - start + 1) * 100));
    return { progress, status, daysRemaining: end - current, isValid: true };
};

export const getAveragePeriodProgress = (records, today = new Date()) => {
    const schedules = records.map(record => getSchedule(record, today)).filter(schedule => schedule.isValid);
    return schedules.length ? Math.round(schedules.reduce((sum, schedule) => sum + schedule.progress, 0) / schedules.length) : 0;
};

export const getProjectPeriodProgress = (project, allProcesses, today = new Date()) => {
    const processes = allProcesses.filter(process => process.projectId === project.id);
    return processes.length ? getAveragePeriodProgress(processes, today) : getSchedule(project, today).progress;
};
