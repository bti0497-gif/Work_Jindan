'use client';

import { useState } from 'react';
import Script from 'next/script';

interface NewRegisterFormProps {
  onCancelClick: () => void;
}

declare global {
  interface Window {
    daum: any;
  }
}

export default function NewRegisterForm({ onCancelClick }: NewRegisterFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    confirmPassword: '',
    email: '',
    phone: '',
    address: '',
    addressDetail: ''
  });
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    // Map input IDs to state keys
    const keyMap: {[key: string]: string} = {
      'nameInput': 'name',
      'usernameInput': 'username',
      'passwordInput': 'password',
      'confirmPasswordInput': 'confirmPassword',
      'emailInput': 'email',
      'phoneInput': 'phone',
      'addressInput': 'address',
      'addressDetailInput': 'addressDetail'
    };
    
    const key = keyMap[id];
    if (key) {
      setFormData(prev => ({ ...prev, [key]: value }));
      // Clear error when typing
      if (errors[key]) {
        setErrors(prev => ({ ...prev, [key]: '' }));
      }
    }
  };

  const validate = () => {
    const newErrors: {[key: string]: string} = {};
    let isValid = true;

    if (!formData.name.trim()) { newErrors.name = '이름을 입력해주세요.'; isValid = false; }
    if (!formData.username.trim()) { newErrors.username = '아이디를 입력해주세요.'; isValid = false; }
    
    if (formData.password.length < 6) {
      newErrors.password = '비밀번호는 최소 6자 이상이어야 합니다.';
      isValid = false;
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = '비밀번호가 일치하지 않습니다.';
      isValid = false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      newErrors.email = '유효한 이메일 주소를 입력해주세요.';
      isValid = false;
    }

    const phoneRegex = /^\d{2,3}-?\d{3,4}-?\d{4}$/;
    if (!phoneRegex.test(formData.phone)) {
      newErrors.phone = '유효한 전화번호 형식(예: 010-1234-5678)을 입력해주세요.';
      isValid = false;
    }

    if (!formData.address.trim()) { newErrors.address = '주소를 입력해주세요.'; isValid = false; }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          username: formData.username,
          password: formData.password,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          addressDetail: formData.addressDetail,
          position: '' // Optional in new form
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || '회원가입에 실패했습니다.');
      } else {
        alert('회원가입이 완료되었습니다!');
        // Auto login or redirect to login
        onCancelClick(); // Go back to login screen
      }
    } catch (error) {
      alert('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddressSearch = () => {
    if (window.daum && window.daum.Postcode) {
      new window.daum.Postcode({
        oncomplete: function(data: any) {
          // 팝업에서 검색결과 항목을 클릭했을때 실행할 코드를 작성하는 부분.
          let addr = ''; // 주소 변수
          let extraAddr = ''; // 참고항목 변수

          //사용자가 선택한 주소 타입에 따라 해당 주소 값을 가져온다.
          if (data.userSelectedType === 'R') { // 사용자가 도로명 주소를 선택했을 경우
            addr = data.roadAddress;
          } else { // 사용자가 지번 주소를 선택했을 경우(J)
            addr = data.jibunAddress;
          }

          // 사용자가 선택한 주소가 도로명 타입일때 참고항목을 조합한다.
          if(data.userSelectedType === 'R'){
            // 법정동명이 있을 경우 추가한다. (법정리는 제외)
            // 법정동의 경우 마지막 문자가 "동/로/가"로 끝난다.
            if(data.bname !== '' && /[동|로|가]$/g.test(data.bname)){
              extraAddr += data.bname;
            }
            // 건물명이 있고, 공동주택일 경우 추가한다.
            if(data.buildingName !== '' && data.apartment === 'Y'){
              extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
            }
            // 표시할 참고항목이 있을 경우, 괄호까지 추가한 최종 문자열을 만든다.
            if(extraAddr !== ''){
              extraAddr = ' (' + extraAddr + ')';
            }
            // 조합된 참고항목을 해당 필드에 넣는다.
            addr += extraAddr;
          }

          // 우편번호와 주소 정보를 해당 필드에 넣는다.
          setFormData(prev => ({ ...prev, address: addr }));
          
          // 상세주소 필드로 포커스 이동
          const detailInput = document.getElementById('addressDetailInput');
          if (detailInput) {
            detailInput.focus();
          }
        }
      }).open();
    } else {
      alert("주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <>
      <Script 
        src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js" 
        strategy="lazyOnload" 
      />
      <style jsx>{`
        /* Google Fonts - Noto Sans KR */
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

        :root {
            --primary-color: #007bff; /* Bright Blue */
            --primary-dark-color: #0056b3;
            --secondary-button-color: #6c757d; /* Gray for Cancel */
            --secondary-button-hover-color: #5a6268;
            --background-color: #f0f2f5; /* Light Gray Background */
            --card-background-color: #ffffff; /* White Card */
            --text-color: #333333; /* Dark Gray Text */
            --input-background-color: #f8f9fa; /* Very Light Gray Input */
            --input-border-color: #ced4da; /* Light Gray Border */
            --shadow-color: rgba(0, 0, 0, 0.08);
            --error-color: #dc3545; /* Red for errors */
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        .register-container {
            background-color: #ffffff;
            padding: 20px; /* Further reduced padding */
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.08);
            width: 100%;
            max-width: 420px;
            text-align: center;
            border: 1px solid #e0e0e0;
            animation: fadeIn 0.6s ease-out;
            font-family: 'Noto Sans KR', sans-serif;
            color: #333333;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-15px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .register-header {
            margin-bottom: 15px; /* Further reduced margin */
            color: #007bff;
            font-size: 1.5em;
            font-weight: 700;
            letter-spacing: -0.5px;
            line-height: 1.3;
        }

        /* --- Horizontal Input Group Styling --- */
        .input-group {
            margin-bottom: 10px; /* Reduced margin between groups */
            display: flex; /* Make it a flex container for horizontal layout */
            align-items: baseline; /* Align text baselines of label and input */
            gap: 10px; /* Space between label and input field wrapper */
        }

        .input-group label {
            flex-basis: 90px; /* Fixed width for labels */
            flex-shrink: 0; /* Prevent label from shrinking */
            margin-bottom: 0; /* Remove bottom margin as it's flexed */
            color: #333333;
            font-size: 0.85em;
            font-weight: 500;
            text-align: left; /* Align label text to the left within its allocated space */
        }

        .input-field-wrapper {
            flex-grow: 1; /* Input and its error take remaining horizontal space */
            display: flex;
            flex-direction: column; /* Stacks input and error message vertically */
        }

        .input-field-wrapper input[type="text"],
        .input-field-wrapper input[type="password"],
        .input-field-wrapper input[type="email"],
        .input-field-wrapper input[type="tel"] {
            width: 100%; /* Ensures input fills its wrapper */
            padding: 8px 10px; /* Further reduced padding */
            border: 1px solid #ced4da;
            border-radius: 6px;
            background-color: #f8f9fa;
            color: #333333;
            font-size: 0.9em; /* Further reduced font size */
            outline: none;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .input-field-wrapper input[type="text"]:focus,
        .input-field-wrapper input[type="password"]:focus,
        .input-field-wrapper input[type="email"]:focus,
        .input-field-wrapper input[type="tel"]:focus {
            border-color: #007bff;
            box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
        }

        /* Placeholder styles */
        .input-field-wrapper input::placeholder {
            color: #888;
            opacity: 0.8;
        }

        .address-input-group {
            display: flex;
            gap: 8px;
        }

        .address-input-group input {
            flex-grow: 1;
        }

        .address-input-group button {
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            background-color: #6c757d;
            color: white;
            font-size: 0.8em; /* Slightly smaller button text */
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            flex-shrink: 0;
        }

        .address-input-group button:hover {
            background-color: #5a6268;
            transform: translateY(-1px);
        }

        #addressDetailGroup {
            margin-top: 5px; /* Keeps a small gap between main and detailed address */
        }
        #addressDetailGroup input {
            margin-top: 0px; /* Specific override */
        }

        .error-message {
            color: #dc3545;
            font-size: 0.75em; /* Smaller error font size */
            margin-top: 2px; /* Reduced margin */
            text-align: left;
            display: block;
        }

        .button-group {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            margin-top: 15px; /* Reduced margin */
        }

        .button-group button {
            width: 100%;
            padding: 10px 15px;
            border: none;
            border-radius: 6px;
            font-size: 1em;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.3s ease, transform 0.2s ease;
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
        }

        #saveButton {
            background-color: #007bff;
            color: white;
        }

        #saveButton:hover {
            background-color: #0056b3;
            transform: translateY(-1px);
        }

        #saveButton:active {
            background-color: #0056b3;
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        
        #saveButton:disabled {
            background-color: #ccc;
            cursor: not-allowed;
            transform: none;
        }

        #cancelButton {
            background-color: #6c757d;
            color: white;
        }

        #cancelButton:hover {
            background-color: #5a6268;
            transform: translateY(-1px);
        }

        #cancelButton:active {
            background-color: #5a6268;
            transform: translateY(0);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      `}</style>

      <div id="registerContainer" className="register-container">
        <h2 id="registerHeader" className="register-header">회원가입</h2>

        <form id="registerForm" onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="nameInput">이름 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="text" 
                id="nameInput" 
                placeholder="이름을 입력하세요" 
                required 
                value={formData.name}
                onChange={handleChange}
              />
              {errors.name && <div className="error-message">{errors.name}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="usernameInput">아이디 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="text" 
                id="usernameInput" 
                placeholder="사용할 아이디를 입력하세요" 
                required 
                value={formData.username}
                onChange={handleChange}
              />
              {errors.username && <div className="error-message">{errors.username}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="passwordInput">비밀번호 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="password" 
                id="passwordInput" 
                placeholder="비밀번호를 입력하세요" 
                required 
                value={formData.password}
                onChange={handleChange}
              />
              {errors.password && <div className="error-message">{errors.password}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="confirmPasswordInput">비밀번호 확인 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="password" 
                id="confirmPasswordInput" 
                placeholder="비밀번호를 다시 입력하세요" 
                required 
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              {errors.confirmPassword && <div className="error-message">{errors.confirmPassword}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="emailInput">이메일 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="email" 
                id="emailInput" 
                placeholder="이메일 주소를 입력하세요" 
                required 
                value={formData.email}
                onChange={handleChange}
              />
              {errors.email && <div className="error-message">{errors.email}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="phoneInput">전화번호 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <input 
                type="tel" 
                id="phoneInput" 
                placeholder="예: 010-1234-5678" 
                required 
                value={formData.phone}
                onChange={handleChange}
              />
              {errors.phone && <div className="error-message">{errors.phone}</div>}
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="addressInput">주소 <span style={{color:'#dc3545'}}>*</span></label>
            <div className="input-field-wrapper">
              <div className="address-input-group">
                <input 
                  type="text" 
                  id="addressInput" 
                  placeholder="주소 검색 버튼을 눌러주세요" 
                  required 
                  readOnly 
                  value={formData.address}
                />
                <button type="button" id="addressSearchButton" onClick={handleAddressSearch}>검색</button>
              </div>
              <div id="addressDetailGroup" style={{marginTop: '5px'}}>
                <input 
                  type="text" 
                  id="addressDetailInput" 
                  placeholder="상세 주소를 입력하세요"
                  value={formData.addressDetail}
                  onChange={handleChange}
                />
              </div>
              {errors.address && <div className="error-message">{errors.address}</div>}
            </div>
          </div>

          <div className="button-group">
            <button type="submit" id="saveButton" disabled={loading}>
              {loading ? '저장 중...' : '저장'}
            </button>
            <button type="button" id="cancelButton" onClick={onCancelClick}>취소</button>
          </div>
        </form>
      </div>
    </>
  );
}
