// Firebase 웹 앱 설정.
// ────────────────────────────────────────────────────────────────
// 아래 값은 Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹) 에서 복사합니다.
// 웹 API 키는 비밀값이 아니지만, 반드시 아래 두 가지를 함께 설정하세요.
//   1) Google Cloud 콘솔 > API 및 서비스 > 사용자 인증 정보 > 해당 키
//      → 애플리케이션 제한: HTTP 리퍼러 → GitHub Pages 도메인만 허용
//   2) Firebase 콘솔 > Authentication > 설정 > 승인된 도메인
//      → 사용하는 도메인만 남기고 나머지 삭제
// 실제 접근 통제는 firestore.rules 가 담당합니다.
export const firebaseConfig = {
  apiKey: "AIzaSyBS_1OKLAVAtB0-G1kkOAZDN4yjqSJ03xw",
  authDomain: "quetta-special-lecture.firebaseapp.com",
  projectId: "quetta-special-lecture",
  storageBucket: "quetta-special-lecture.firebasestorage.app",
  messagingSenderId: "229163482146",
  appId: "1:229163482146:web:f339f7614e79ec2db2de7b",
};

// App Check(reCAPTCHA v3) 사이트 키. 미사용 시 빈 문자열로 두세요.
export const recaptchaSiteKey = "";

export const APP = {
  title: "특강 MASTER",
  academy: "강남대성기숙 QUETTA",
  smsSignature: "Good Better Best\n강남대성기숙 QUETTA",
  ratePerMinute: 196, // 교습비 = 196원 × 수업시간(분) × 회차
};
