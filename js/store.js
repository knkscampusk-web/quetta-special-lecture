// Firestore 접근 레이어 — 읽기는 실시간 구독, 쓰기는 명시적 호출만.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc,
  writeBatch, getDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app-check.js";
import { firebaseConfig, recaptchaSiteKey } from "./config.js";

const app = initializeApp(firebaseConfig);
if (recaptchaSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
export const auth = getAuth(app);
export const db = getFirestore(app);

// 브라우저 종료 시 세션 만료 — 공용 계정이라 탭을 닫으면 로그아웃되게 둡니다.
setPersistence(auth, browserSessionPersistence);

export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logout = () => signOut(auth);
export const watchAuth = (cb) => onAuthStateChanged(auth, cb);

/** admins/{uid} 문서가 있어야 행정실 사용자로 인정 (rules와 동일 조건) */
export async function isAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch { return false; }
}

// ── 인메모리 캐시 + 실시간 구독 ─────────────────────────────────
export const state = {
  courses: [], students: [], enrollments: [], waitlist: [],
  schedule: {}, calendars: {}, meta: {},
  ready: false,
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((f) => f());

const COLS = ["courses", "students", "enrollments", "waitlist"];
const DOCS = [["config", "schedule", "schedule"], ["config", "calendars", "calendars"],
               ["config", "meta", "meta"]];

export function subscribeAll() {
  let pending = COLS.length + DOCS.length;
  const done = () => { if (--pending <= 0) { state.ready = true; } emit(); };
  COLS.forEach((name) => {
    onSnapshot(collection(db, name), (snap) => {
      state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      done();
    }, (e) => { console.error(name, e); done(); });
  });
  DOCS.forEach(([col, id, key]) => {
    onSnapshot(doc(db, col, id), (snap) => {
      state[key] = snap.exists() ? snap.data() : {};
      done();
    }, (e) => { console.error(key, e); done(); });
  });
}

// ── 쓰기 ────────────────────────────────────────────────────────
const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.email || null });

export const saveCourse = (id, patch) => updateDoc(doc(db, "courses", id), { ...patch, ...stamp() });
export const saveEnrollment = (id, patch) => setDoc(doc(db, "enrollments", id), { ...patch, ...stamp() }, { merge: true });
export const removeEnrollment = (id) => deleteDoc(doc(db, "enrollments", id));
export const saveWait = (id, patch) => setDoc(doc(db, "waitlist", id), { ...patch, ...stamp() }, { merge: true });
export const saveStudent = (id, patch) => setDoc(doc(db, "students", id), { ...patch, ...stamp() }, { merge: true });

export const saveConfig = (id, data) => setDoc(doc(db, "config", id), data, { merge: true });

/** 파피 명단 일괄 반영 등, 최대 400건 단위 배치 쓰기 */
export async function bulkSet(colName, rows) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += 400) chunks.push(rows.slice(i, i + 400));
  for (const chunk of chunks) {
    const b = writeBatch(db);
    chunk.forEach((r) => b.set(doc(db, colName, r.id), { ...r, ...stamp() }, { merge: true }));
    await b.commit();
  }
  return rows.length;
}

/** 대기자 → 수강생 승계 */
export async function promoteWait(wait) {
  if (!wait.courseId) throw new Error("연결된 강좌가 없습니다. 강좌를 먼저 지정하세요.");
  const id = `${wait.studentId}__${wait.courseId}`;
  const b = writeBatch(db);
  b.set(doc(db, "enrollments", id), {
    id, studentId: wait.studentId, courseId: wait.courseId,
    term: wait.term || null, payer: null, paidAt: null,
    status: "미결제", refund: null, source: "waitlist", ...stamp(),
  }, { merge: true });
  b.set(doc(db, "waitlist", wait.id), { state: "배정", ...stamp() }, { merge: true });
  await b.commit();
  return id;
}
