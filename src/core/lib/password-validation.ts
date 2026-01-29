// 비밀번호 강도 검증 유틸리티

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

export interface PasswordRequirement {
  regex: RegExp;
  message: string;
}

export const passwordRequirements: PasswordRequirement[] = [
  {
    regex: /.{8,}/,
    message: '최소 8자 이상'
  },
  {
    regex: /(?=.*[a-z])/,
    message: '소문자 포함'
  },
  {
    regex: /(?=.*[A-Z])/,
    message: '대문자 포함'
  },
  {
    regex: /(?=.*\d)/,
    message: '숫자 포함'
  },
  {
    regex: /(?=.*[!@#$%^&*(),.?":{}|<>])/,
    message: '특수문자 포함 (!@#$%^&*(),.?":{}|<>)'
  }
];

export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  
  // 각 요구사항 검증
  passwordRequirements.forEach(requirement => {
    if (!requirement.regex.test(password)) {
      errors.push(requirement.message);
    }
  });

  // 비밀번호 강도 계산
  const passedRequirements = passwordRequirements.length - errors.length;
  let strength: 'weak' | 'medium' | 'strong';
  
  if (passedRequirements < 3) {
    strength = 'weak';
  } else if (passedRequirements < 5) {
    strength = 'medium';
  } else {
    strength = 'strong';
  }

  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
}

export function getPasswordStrengthColor(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return 'text-red-600';
    case 'medium':
      return 'text-yellow-600';
    case 'strong':
      return 'text-green-600';
    default:
      return 'text-gray-600';
  }
}

export function getPasswordStrengthText(strength: 'weak' | 'medium' | 'strong'): string {
  switch (strength) {
    case 'weak':
      return '약함';
    case 'medium':
      return '보통';
    case 'strong':
      return '강함';
    default:
      return '';
  }
}

// 비밀번호 입력 실시간 검증을 위한 훅
export function usePasswordValidation(password: string) {
  const validation = validatePassword(password);
  
  return {
    ...validation,
    strengthColor: getPasswordStrengthColor(validation.strength),
    strengthText: getPasswordStrengthText(validation.strength)
  };
}