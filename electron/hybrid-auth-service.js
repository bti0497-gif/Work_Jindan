const bcrypt = require('bcryptjs');
const GoogleDriveDB = require('./google-drive-simple');

class HybridAuthService {
    constructor() {
        this.googleDB = new GoogleDriveDB();
        this.useGoogleDrive = false;
        
        // 로컬 백업용 
        const { app } = require('electron');
        const path = require('path');
        this.localUsersFile = path.join(app.getPath('userData'), 'hybrid-users.json');
    }

    // 초기화 (Google Drive 연결 시도)
    async initialize() {
        try {
            console.log('=== 하이브리드 인증 서비스 초기화 ===');
            
            // Google Drive 연결 시도
            const googleConnected = await this.googleDB.initialize();
            
            if (googleConnected) {
                console.log('Google Drive 연결 성공! 클라우드 모드로 작동합니다.');
                this.useGoogleDrive = true;
            } else {
                console.log('Google Drive 연결 실패. 로컬 모드로 작동합니다.');
                this.useGoogleDrive = false;
            }
            
            return true;
        } catch (error) {
            console.error('하이브리드 인증 서비스 초기화 실패:', error);
            this.useGoogleDrive = false;
            return true; // 로컬 모드로라도 작동
        }
    }

    // 로컬 사용자 데이터 관리
    async getLocalUsers() {
        try {
            const fs = require('fs').promises;
            const data = await fs.readFile(this.localUsersFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    async saveLocalUsers(users) {
        try {
            const fs = require('fs').promises;
            await fs.writeFile(this.localUsersFile, JSON.stringify(users, null, 2));
        } catch (error) {
            console.error('로컬 사용자 데이터 저장 실패:', error);
        }
    }

    // 사용자 찾기 (하이브리드)
    async findUserByEmail(email) {
        try {
            if (this.useGoogleDrive) {
                console.log('Google Drive에서 사용자 검색:', email);
                return await this.googleDB.findUserByEmail(email);
            } else {
                console.log('로컬에서 사용자 검색:', email);
                const users = await this.getLocalUsers();
                return users.find(user => user.email === email);
            }
        } catch (error) {
            console.error('사용자 검색 실패:', error);
            return null;
        }
    }

    // 회원가입
    async register(userData) {
        try {
            console.log('=== 하이브리드 회원가입 시작 ===');
            console.log('Google Drive 모드:', this.useGoogleDrive);
            console.log('사용자 데이터:', userData);
            
            const { name, email, password, position, phone } = userData;

            // 기본 검증
            if (!name || !email || !password) {
                return {
                    success: false,
                    error: '이름, 이메일, 비밀번호는 필수 항목입니다.'
                };
            }

            // 기존 사용자 확인
            const existingUser = await this.findUserByEmail(email);
            if (existingUser) {
                return {
                    success: false,
                    error: '이미 등록된 이메일입니다.'
                };
            }

            // 비밀번호 암호화
            const hashedPassword = await bcrypt.hash(password, 10);

            // 새 사용자 데이터
            const newUser = {
                id: Date.now().toString(),
                name,
                email,
                password: hashedPassword,
                position: position || '',
                phone: phone || '',
                role: 'ADMIN', // 첫 사용자는 관리자
                isActive: true,
                createdAt: new Date().toISOString(),
                lastLogin: null
            };

            // 저장 (하이브리드)
            if (this.useGoogleDrive) {
                console.log('Google Drive에 사용자 저장 중...');
                await this.googleDB.addUser(newUser);
                console.log('Google Drive 저장 완료');
            } else {
                console.log('로컬에 사용자 저장 중...');
                const users = await this.getLocalUsers();
                users.push(newUser);
                await this.saveLocalUsers(users);
                console.log('로컬 저장 완료');
            }

            // 양쪽에 백업 저장
            try {
                if (this.useGoogleDrive) {
                    // Google Drive 사용 중이면 로컬에도 백업
                    const localUsers = await this.getLocalUsers();
                    localUsers.push(newUser);
                    await this.saveLocalUsers(localUsers);
                    console.log('로컬 백업 저장 완료');
                }
            } catch (backupError) {
                console.log('백업 저장 실패 (무시):', backupError.message);
            }

            console.log('=== 하이브리드 회원가입 성공 ===');
            return {
                success: true,
                user: {
                    id: newUser.id,
                    name: newUser.name,
                    email: newUser.email,
                    position: newUser.position,
                    role: newUser.role
                }
            };

        } catch (error) {
            console.error('=== 하이브리드 회원가입 실패 ===');
            console.error('오류:', error);
            return {
                success: false,
                error: '회원가입 처리 중 오류가 발생했습니다: ' + error.message
            };
        }
    }

    // 로그인
    async login(credentials) {
        try {
            console.log('=== 하이브리드 로그인 시작 ===');
            console.log('Google Drive 모드:', this.useGoogleDrive);
            
            const { email, password } = credentials;

            // 사용자 찾기
            const user = await this.findUserByEmail(email);
            if (!user) {
                return {
                    success: false,
                    error: '등록되지 않은 이메일입니다.'
                };
            }

            // 비밀번호 확인
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (!passwordMatch) {
                return {
                    success: false,
                    error: '비밀번호가 올바르지 않습니다.'
                };
            }

            console.log('=== 하이브리드 로그인 성공 ===');
            return {
                success: true,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    position: user.position,
                    phone: user.phone,
                    role: user.role
                }
            };

        } catch (error) {
            console.error('=== 하이브리드 로그인 실패 ===');
            console.error('오류:', error);
            return {
                success: false,
                error: '로그인 처리 중 오류가 발생했습니다: ' + error.message
            };
        }
    }
}

module.exports = HybridAuthService;