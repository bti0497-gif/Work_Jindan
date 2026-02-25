
/**
 * DEOJON TECH STUDIO - DATABASE SCHEMA DEFINITION (v1.1)
 * 
 * 이 파일은 백엔드 설계 및 데이터베이스 구축을 위한 최신 표준 가이드라인입니다.
 * 회원가입 및 내 정보 수정 기능에 필요한 모든 필드를 포함합니다.
 */

/*
-- 1. USERS (사용자 테이블 - 업데이트됨)
CREATE TABLE Users (
    user_id VARCHAR(50) PRIMARY KEY, -- 사용자 ID
    name VARCHAR(50) NOT NULL,       -- 성명
    password_hash TEXT NOT NULL,     -- 암호화된 비밀번호
    email VARCHAR(100) UNIQUE NOT NULL, -- 이메일 (임시비번 발송용)
    phone VARCHAR(20) NOT NULL,      -- 전화번호
    address TEXT NOT NULL,           -- 기본 주소 (주소 검색 결과)
    detail_address TEXT,             -- 상세 주소 (직접 입력)
    avatar_url TEXT,                 -- 프로필 이미지 경로 또는 Base64 데이터
    role VARCHAR(50) DEFAULT 'user', -- 'master', 'admin', 'user'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PROJECTS (프로젝트 테이블)
CREATE TABLE Projects (
    project_id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    due_date DATE,
    status VARCHAR(20) DEFAULT 'In Progress',
    created_by VARCHAR(50) REFERENCES Users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PROJECT_MEMBERS (프로젝트 참여자 - N:M 관계)
CREATE TABLE Project_Members (
    project_id INTEGER REFERENCES Projects(project_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES Users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- 4. PROCESSES (공정 테이블)
CREATE TABLE Processes (
    process_id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES Projects(project_id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. PROCESS_MEMBERS (공정 담당자 - N:M 관계)
CREATE TABLE Process_Members (
    process_id INTEGER REFERENCES Processes(process_id) ON DELETE CASCADE,
    user_id VARCHAR(50) REFERENCES Users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (process_id, user_id)
);

-- 6. TASKS (할일 테이블)
CREATE TABLE Tasks (
    task_id SERIAL PRIMARY KEY,
    author_id VARCHAR(50) REFERENCES Users(user_id),
    text TEXT NOT NULL,
    target_date DATE NOT NULL,
    reg_date DATE DEFAULT CURRENT_DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. BOARD_POSTS (게시판 테이블)
CREATE TABLE Board_Posts (
    post_id SERIAL PRIMARY KEY,
    author_id VARCHAR(50) REFERENCES Users(user_id),
    title VARCHAR(300) NOT NULL,
    content TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    reg_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. FILES (파일 관리 테이블)
CREATE TABLE Files (
    file_id SERIAL PRIMARY KEY,
    project_id INTEGER REFERENCES Projects(project_id),
    name VARCHAR(255) NOT NULL,
    size VARCHAR(50),
    file_type VARCHAR(20), 
    action VARCHAR(20), 
    user_id VARCHAR(50) REFERENCES Users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성 (검색 성능 최적화)
CREATE INDEX idx_users_email ON Users(email);
CREATE INDEX idx_projects_status ON Projects(status);
CREATE INDEX idx_tasks_target_date ON Tasks(target_date);
*/

// --- FE/BE 연동을 위한 상세 엔티티 모델 (User 상세화) ---

export interface DbUser {
  userId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  detailAddress: string;
  avatarUrl: string;
  role: 'master' | 'admin' | 'user';
}

export interface DbProject {
  projectId: number;
  title: string;
  description: string;
  dueDate: string;
  status: 'In Progress' | 'Completed';
  members: DbUser[];
}

export interface DbProcess {
  processId: number;
  projectId: number;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  isCompleted: boolean;
  assignedUsers: DbUser[];
}

export interface DbTask {
  taskId: number;
  authorId: string;
  text: string;
  targetDate: string;
  regDate: string;
  isCompleted: boolean;
  isPublic: boolean;
}

export interface DbBoardPost {
  postId: number;
  authorId: string;
  title: string;
  content: string;
  views: number;
  regDate: string;
}
