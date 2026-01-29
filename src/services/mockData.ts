import { Project, Process, Task, BoardPost } from '@/types/common';

export const INITIAL_PROJECTS: Project[] = [
  {
    id: '1',
    title: '영흥도 수질 진단 컨설팅',
    description: '대부도 일대 수질 환경 기초 데이터 수집 및 정밀 진단 분석.',
    progress: 0,
    status: 'In Progress',
    dueDate: '2024-11-15',
    members: ['https://picsum.photos/seed/user1/100/100', 'https://picsum.photos/seed/user2/100/100', 'https://picsum.photos/seed/user3/100/100']
  }
];

export const INITIAL_PROCESSES: Process[] = [
  { id: 'pr1', projectId: '1', title: '현장 수질 샘플 채취', startDate: '2024-11-01', endDate: '2024-11-05', members: ['https://picsum.photos/seed/user1/40/40'], description: '영흥도 12개 지점 샘플링', isCompleted: true }
];

export const INITIAL_TASKS: Task[] = [
  { id: 't1', text: '주간 업무 보고서 작성', targetDate: '2024-11-10', regDate: '2024-11-01', completed: false, author: '김진단 팀장', authorId: 'master', authorAvatar: 'https://picsum.photos/seed/master/100/100', isPublic: true },
  { id: 't2', text: '개인 건강검진 예약', targetDate: '2024-11-12', regDate: '2024-11-02', completed: true, author: '김진단 팀장', authorId: 'master', authorAvatar: 'https://picsum.photos/seed/master/100/100', isPublic: false },
  { id: 't3', text: '공장 폐수 샘플 분석 요청', targetDate: '2024-11-08', regDate: '2024-11-01', completed: false, author: '이영희 과장', authorId: 'user2', authorAvatar: 'https://picsum.photos/seed/user2/100/100', isPublic: true },
];

export const INITIAL_BOARD_POSTS: BoardPost[] = [
  { id: 'b1', title: '신입 사원 환영회 공지', content: '이번 주 금요일 오후 6시, 신입 사원 윤도현 님의 환영회가 있습니다. 장소는 회사 근처 일식집입니다.', author: '이영희 과장', authorId: 'user2', authorAvatar: 'https://picsum.photos/seed/user2/100/100', regDate: '2024-11-01', views: 42 },
  { id: 'b2', title: '연구실 장비 점검 안내', content: '다음 주 월요일부터 수요일까지 연구실 내 수질 분석 장비 정기 점검이 예정되어 있습니다. 사용에 참고 부탁드립니다.', author: '김진단 팀장', authorId: 'master', authorAvatar: 'https://picsum.photos/seed/master/100/100', regDate: '2024-11-02', views: 15 },
  { id: 'b3', title: '탕비실 커피 원두 교체 건', content: '스타벅스 파이크 플레이스 원두로 교체되었습니다. 즐거운 티타임 되세요!', author: '박철수 대리', authorId: 'user3', authorAvatar: 'https://picsum.photos/seed/user3/100/100', regDate: '2024-11-03', views: 8 },
];
