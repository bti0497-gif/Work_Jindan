const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = () => import('../src/services/scheduleService.js');
const process = { id: 'p1', projectId: 'project', startDate: '2026-10-01', endDate: '2026-10-10', isCompleted: false };

test('schedule uses inclusive calendar dates for planned, active, and elapsed states', async () => {
    const { getSchedule } = await service();
    assert.equal(getSchedule(process, '2026-09-30').status, '예정');
    assert.equal(getSchedule(process, '2026-09-30').progress, 0);
    assert.equal(getSchedule(process, '2026-10-01').status, '진행 중');
    assert.equal(getSchedule(process, '2026-10-01').progress, 0);
    assert.equal(getSchedule(process, '2026-10-06').progress, 50);
    assert.equal(getSchedule(process, '2026-10-10').status, '진행 중');
    assert.equal(getSchedule(process, '2026-10-10').daysRemaining, 0);
    assert.equal(getSchedule(process, '2026-10-11').progress, 100);
    assert.equal(getSchedule(process, '2026-10-11').status, '미완료');
});

test('completion flags do not change the period progress calculation', async () => {
    const { getSchedule } = await service();
    const completed = { ...process, isCompleted: true };
    assert.equal(getSchedule(completed, '2026-10-06').progress, 50);
    assert.equal(getSchedule(completed, '2026-10-06').status, '진행 중');
    assert.equal(getSchedule(completed, '2026-10-11').progress, 100);
    assert.equal(getSchedule(completed, '2026-10-11').status, '완료');
});

test('a process starting today is active from local midnight, including in Korea', async () => {
    const { getSchedule } = await service();
    const result = getSchedule({ startDate: '2026-10-23', endDate: '2026-10-24' }, new Date(2026, 9, 23, 0, 0));
    assert.equal(result.status, '진행 중');
    assert.equal(result.progress, 0);
});

test('single-day periods remain active through their end date', async () => {
    const { getSchedule } = await service();
    const record = { startDate: '2026-10-23', endDate: '2026-10-23' };
    assert.equal(getSchedule(record, '2026-10-23').status, '진행 중');
    assert.equal(getSchedule(record, '2026-10-24').progress, 100);
});

test('missing, reversed, or impossible dates are held for judgment', async () => {
    const { getSchedule } = await service();
    for (const record of [{}, { startDate: '2026-10-10', endDate: '2026-10-01' }, { startDate: '2026-02-30', endDate: '2026-03-05' }]) {
        assert.equal(getSchedule(record, '2026-10-23').status, '판정보류');
        assert.equal(getSchedule(record, '2026-10-23').isValid, false);
    }
});

test('project and overall progress average the registered process periods', async () => {
    const { getAveragePeriodProgress, getProjectPeriodProgress } = await service();
    const planned = { ...process, id: 'p2', startDate: '2026-10-20', endDate: '2026-10-30', isCompleted: true };
    const records = [process, planned];
    assert.equal(getAveragePeriodProgress(records, '2026-10-06'), 25);
    assert.equal(getProjectPeriodProgress({ id: 'project' }, records, '2026-10-06'), 25);
    assert.equal(getProjectPeriodProgress({ ...process, id: 'empty-project' }, records, '2026-10-06'), 50);
});
