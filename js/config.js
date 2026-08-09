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

// 아이디 로그인용 도메인.
// Firebase 인증은 내부적으로 이메일 형식을 요구하므로, 아이디 뒤에 이 도메인을 자동으로 붙입니다.
// 예: 아이디 'quetta' -> quetta@quetta.local 로 로그인
// Firebase 콘솔에서 사용자를 만들 때도 같은 형식(아이디@quetta.local)으로 만드세요.
// '@'가 포함된 값을 입력하면 그대로 이메일로 처리하므로 기존 이메일 계정도 함께 쓸 수 있습니다.
export const loginDomain = "quetta.local";

// 고정 로그인 아이디. 값이 있으면 로그인 화면에서 아이디 칸을 숨기고 이 값을 씁니다.
// 빈 문자열("")로 두면 아이디 칸이 표시됩니다.
// 주의: 저장소가 공개돼 있으면 이 값도 공개됩니다. 아이디는 비밀이 아니므로 무방하지만,
//       그만큼 PIN 하나로 접근이 결정되니 App Check를 반드시 켜세요.
export const fixedLoginId = "";

// PIN 자릿수. Firebase는 비밀번호 최소 6자를 요구하므로 6 미만으로 낮출 수 없습니다.
export const pinLength = 6;

export const APP = {
  title: "특강 MASTER",
  academy: "강남대성기숙 QUETTA",
  smsSignature: "Good Better Best\n강남대성기숙 QUETTA",
  ratePerMinute: 196, // 교습비 = 196원 × 수업시간(분) × 회차
};
