# QUETTA 특강 MASTER

강남대성기숙 QUETTA 단과특강 운영 관리 웹앱. GitHub Pages 정적 배포 + Firebase(Auth·Firestore).

## 화면

| 화면 | 하는 일 |
|---|---|
| 현황표 | 기수별 강좌·신청·결제·미결제·환불·대기 집계, 정원 게이지, 출석부 바로가기 |
| 특강학생명단 | 학생×강좌 단위 조회·검색, 결제확인·환불신청, 신청명단 엑셀 불러오기, 엑셀 저장 |
| 환불자 명단 | 환불 건 조회, 유형별 집계, 환불 예상액 자동 산출 |
| 대기자 명단 | 대기 큐 관리, 처리 상태 변경, 수강생 승계 |
| 수업계획·신청일정 | 연도별 준비 일정 타임라인, 다음 일정 D-day |
| 수업일 계산 | 개강일·요일 입력 → 모의고사·정기휴가·휴강 제외 → 회차·교습비 산출 |

## 데이터 구조

```
students/{학번}        반·그룹·기숙사·성명·전형·상태
courses/{강좌ID}       기수·과목·강의명·담당·요일/시간·강의실·정원·회차·교재·교습비
enrollments/{학번__강좌ID}
                       결제주체·결제일·상태(신청/결제완료/미결제/환불)·refund{}
waitlist/{ID}          등록시각·학번·강좌·안내발송일·처리상태
config/schedule        연도별 준비 일정
config/calendars       기수별 주차 매트릭스 + 제외일(모의고사/휴가/휴강)
config/meta            단가·기수·과목 등 공통 설정
admins/{uid}           행정실 계정 화이트리스트 (콘솔에서만 생성)
```

**강좌 ID 규칙** : `{기수코드}_{과목}_{약칭}` — 예 `3_국어_빌드업국어`, `1_수학_클리닉확통`
(기수코드 : 제로=Z, 1기=1, 2기=2, 3기=3, 4기=4)

**환불은 별도 컬렉션이 아니라** `enrollments` 문서의 `status: "환불"` + `refund{}` 로 관리합니다.
기존 엑셀의 명단 시트와 환불 시트가 어긋나던 문제를 구조적으로 없앤 부분입니다.

**환불 처리** : 명단에서 `환불 신청` → 취소일 기준으로 진행 회차를 자동 계산해
`N회수강` 유형과 예상 환불액을 제시 → 확정 시 환불자 명단으로 이동.
휴강일은 회차에서 제외합니다.

**교습비 공식** : `196원 × 1회 수업시간(분) × 회차`
원본 현황표 값에서 역산해 검증했습니다 (170분×8회 = 266,560 / 160분×6회 = 188,160).

## 설치

### 1. Firebase 프로젝트

1. 콘솔에서 프로젝트 생성 → **Authentication** → 로그인 방법에서 **이메일/비밀번호**만 사용 설정
2. 행정실 계정 1개 생성 (예: `office@…`) 후 **UID 복사**
3. **Firestore Database** 생성 (프로덕션 모드, 리전 `asia-northeast3`)
4. Firestore에 `admins` 컬렉션 → 문서 ID를 복사한 **UID**로 만들고 필드에 `email` 저장
5. **규칙** 탭에 `firestore.rules` 내용을 붙여넣고 게시

### 2. 데이터 적재

```bash
cd tools
pip install firebase-admin
export GOOGLE_APPLICATION_CREDENTIALS=/절대경로/serviceAccountKey.json

python3 upload_seed.py --seed ../seed --dry-run   # 건수 확인
python3 upload_seed.py --seed ../seed             # 실제 적재
```

엑셀 원본이 갱신되면 다시 변환합니다.

```bash
python3 migrate.py /경로/_퀘타__특강MASTER_기숙2026.xlsx ../seed
```

변환 후 반드시 `validation_report.md` 의 대조표에서 ❌ 가 늘지 않았는지 확인하세요.

### 3. 앱 설정 및 배포

1. `js/config.js` 의 `firebaseConfig` 값을 콘솔 값으로 교체
2. GitHub 저장소에 푸시 → Settings → Pages → Source `main` / `/ (root)`
3. Firebase 콘솔 → Authentication → 설정 → **승인된 도메인**에 Pages 도메인만 남기기
4. Google Cloud 콘솔 → 사용자 인증 정보 → 웹 API 키 → **HTTP 리퍼러 제한**에 Pages 도메인 등록

## 보안

- 미인증 요청은 전 컬렉션 차단. 인증되어도 `admins/{uid}` 문서가 없으면 거부됩니다.
- `allow read, write: if true` 는 어디에도 두지 않았습니다.
- 세션은 브라우저 종료 시 만료됩니다 (`browserSessionPersistence`). 공용 PC를 쓰기 때문입니다.
- 서비스 계정 키는 저장소에 커밋 금지. `.gitignore` 에 포함돼 있습니다.
- 공용 계정 특성상 **App Check(reCAPTCHA v3)** 적용을 권장합니다. 사이트 키를 발급받아
  `js/config.js` 의 `recaptchaSiteKey` 에 넣으면 자동으로 켜집니다.
- 강좌 문서는 앱에서 삭제할 수 없습니다(수강 이력 보호). 삭제가 필요하면 콘솔에서 처리하세요.

## 알려진 데이터 공백

원본 `특강학생명단` 시트에 열이 없어 학생 단위 기록이 존재하지 않는 강좌가 2건 있습니다.
현황표에는 인원이 잡혀 있으나 누가 신청했는지는 엑셀에 없습니다.

| 강좌 | 현황표 신청 | 조치 |
|---|--:|---|
| `1_수학_확통Learn` | 10명 | 앱에서 수기 입력 필요 |
| `1_수학_클리닉미적분` | 3명 | 앱에서 수기 입력 필요 |

## 다음 단계 후보

- 파피 API 직접 동기화 (quetta-textbook의 싱크 워커 재사용)
- SMS 시트의 문안 템플릿을 앱에 내장해 미납·환불 안내 문자 자동 생성
- 강좌별 출석부 시트 자동 생성
