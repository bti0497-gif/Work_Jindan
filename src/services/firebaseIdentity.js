const digest = async value => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
};

// Firebase Auth의 이메일 형식은 내부 식별자로만 사용한다. 앱에서는 기존 아이디를 사용한다.
export const loginEmailForId = async personId => {
    const id = personId.trim();
    if (!id) throw new Error('아이디를 입력해 주세요.');
    return `id-${await digest('work-jindan:id:v1:' + id)}@work-jindan.internal`;
};

// 기존 짧은 초기 비밀번호도 유지할 수 있도록 Auth에 전달하는 값을 일정한 형식으로 만든다.
// Firebase Auth는 이 값을 다시 자체 비밀번호 해시로 저장한다.
export const authPasswordForId = (personId, password) => {
    if (!password) throw new Error('비밀번호를 입력해 주세요.');
    return digest('work-jindan:password:v1:' + personId.trim() + ':' + password);
};
