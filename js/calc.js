// 수업일 · 교습비 계산 + 집계 파생값
import { APP } from "./config.js?v=4";

export const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const pad = (n) => String(n).padStart(2, "0");
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
export const dayName = (s) => DAYS[(parse(s).getDay() + 6) % 7];
export const fmt = (s) => (s ? `${+s.slice(5, 7)}/${+s.slice(8, 10)}(${dayName(s)})` : "-");
export const won = (n) => (n == null ? "-" : Number(n).toLocaleString("ko-KR") + "원");

/** "19:10~22:00" → 170 (분) */
export function minutesOf(timeRange) {
  const m = String(timeRange || "").match(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (+m[3] * 60 + +m[4]) - (+m[1] * 60 + +m[2]);
}

/** 교습비 = 분당단가 × 수업시간(분) × 회차 */
export const tuitionOf = (minutes, sessions, rate = APP.ratePerMinute) =>
  minutes && sessions ? rate * minutes * sessions : null;

/** 기수 캘린더의 제외일(모의고사·정기휴가·휴강)을 날짜 배열로 펼침 */
export function exceptDates(cal) {
  const out = new Map();
  if (!cal?.excepts) return out;
  const push = (list, kind) => (list || []).forEach((d) => out.set(d, kind));
  push(cal.excepts.mock, "모의고사");
  push(cal.excepts.vacation, "정기휴가");
  push(cal.excepts.closed, "휴강");
  return out;
}

/**
 * 개강일부터 요일 반복으로 회차를 만들고 제외일을 건너뜁니다.
 * @returns [{no, date, skipped, reason}]
 */
export function buildSessions({ startDate, weekday, count, excepts = new Map(), untilDate = null }) {
  const rows = [];
  if (!startDate || !count) return rows;
  let cur = parse(startDate);
  const wantIdx = weekday ? DAYS.indexOf(weekday) : (cur.getDay() + 6) % 7;
  while (((cur.getDay() + 6) % 7) !== wantIdx) cur.setDate(cur.getDate() + 1);
  let made = 0, guard = 0;
  while (made < count && guard++ < 200) {
    const d = iso(cur);
    if (untilDate && d > untilDate) break;
    const reason = excepts.get(d);
    if (reason) rows.push({ no: null, date: d, skipped: true, reason });
    else rows.push({ no: ++made, date: d, skipped: false, reason: null });
    cur.setDate(cur.getDate() + 7);
  }
  return rows;
}

// ── 상태 ────────────────────────────────────────────────────────
// 신청 : 신청만 하고 아직 결제 전   수강 : 결제 완료, 수업 진행 중
// 취소 : 결제 전 취소 (명단에서 숨김) 환불 : 결제 후 취소
export const STATUSES = ["신청", "수강", "취소", "환불"];
export const ACTIVE = ["신청", "수강"];

/** 초기 적재분의 옛 표기(미결제/결제완료)를 새 표기로 변환 */
export function normStatus(s) {
  if (s === "결제완료") return "수강";
  if (s === "미결제") return "신청";
  return s || "신청";
}

/**
 * 월요일 시작 주 목록. 주차 라벨의 달은 그 주 '토요일'이 속한 달을 따릅니다.
 * (예: 3/30~4/5 주는 토요일이 4/4이므로 '4월 1주차')
 */
export function weeksOfRange(year, fromMonth, toMonth) {
  const out = [];
  const counts = {};
  const sat = new Date(year, fromMonth - 1, 1);
  while (sat.getDay() !== 6) sat.setDate(sat.getDate() + 1);
  while (sat.getFullYear() === year && sat.getMonth() + 1 <= toMonth) {
    const m = sat.getMonth() + 1;
    counts[m] = (counts[m] || 0) + 1;
    const monday = new Date(sat);
    monday.setDate(sat.getDate() - 5);
    const dates = {};
    DAYS.forEach((d, i) => {
      const x = new Date(monday);
      x.setDate(monday.getDate() + i);
      dates[d] = iso(x);
    });
    out.push({ label: `${m}월 ${counts[m]}주차`, short: `${m}월 ${counts[m]}주`, dates });
    sat.setDate(sat.getDate() + 7);
  }
  return out;
}

/** 기준일까지 해당 학생이 실제로 들은 수업 횟수 (휴강 제외, 시작 회차 반영) */
export function sessionsTaken(course, asOf = iso(new Date()), startNo = 1) {
  return (course?.sessions || [])
    .filter((s) => !s.canceled && s.date <= asOf && (s.no ?? 1) >= (startNo || 1)).length;
}

/** 진행 회차 → 환불유형 문자열 */
export const refundTypeFor = (n) => (n <= 0 ? "전액" : `${n}회수강`);

/** 환불 예상액. 전액 = 총액, N회수강 = 총액 − (교습비/총회차 × N) − (교재 수령 시 교재비) */
export function refundAmount(course, refund) {
  if (!course?.fee || !refund) return null;
  const total = course.fee.total ?? ((course.fee.tuition || 0) + (course.fee.book || 0));
  const type = String(refund.type || "");
  if (type.includes("전액")) return total;          // '전액', '전액환불' 등 표기 흔들림 흡수
  const m = type.match(/(\d+)\s*회/);               // '3회수강', '3회 수강' 모두 인식
  const used = m ? Number(m[1]) : 1;
  const n = (course.sessions || []).length || 1;
  const perSession = Math.round((course.fee.tuition || 0) / n);
  const bookKeep = refund.bookRefund === "수령" ? (course.fee.book || 0) : 0;
  return Math.max(total - perSession * used - bookKeep, 0);
}

// ── 집계 ────────────────────────────────────────────────────────
export function countsFor(courseId, enrollments, waitlist) {
  const es = enrollments.filter((e) => e.courseId === courseId);
  const st = (e) => normStatus(e.status);
  return {
    active: es.filter((e) => ACTIVE.includes(st(e))).length,
    attending: es.filter((e) => st(e) === "수강").length,
    applied: es.filter((e) => st(e) === "신청").length,
    canceled: es.filter((e) => st(e) === "취소").length,
    refunded: es.filter((e) => st(e) === "환불").length,
    waiting: waitlist.filter((w) => w.courseId === courseId
      && ["유지", "무응답", "안읽음"].includes(w.state)).length,
  };
}

export function termSummary(term, courses, enrollments, waitlist) {
  const ids = new Set(courses.filter((c) => c.term === term).map((c) => c.id));
  const es = enrollments.filter((e) => ids.has(e.courseId));
  const st = (e) => normStatus(e.status);
  const revenue = es.filter((e) => st(e) === "수강").reduce((s, e) => {
    const c = courses.find((x) => x.id === e.courseId);
    return s + (c?.fee?.total || 0);
  }, 0);
  return {
    courses: ids.size,
    active: es.filter((e) => ACTIVE.includes(st(e))).length,
    attending: es.filter((e) => st(e) === "수강").length,
    applied: es.filter((e) => st(e) === "신청").length,
    canceled: es.filter((e) => st(e) === "취소").length,
    refunded: es.filter((e) => st(e) === "환불").length,
    waiting: waitlist.filter((w) => ids.has(w.courseId)
      && ["유지", "무응답", "안읽음"].includes(w.state)).length,
    revenue,
  };
}

export const dday = (dateStr, today = iso(new Date())) => {
  const diff = Math.round((parse(dateStr) - parse(today)) / 86400000);
  return diff === 0 ? "D-DAY" : diff > 0 ? `D-${diff}` : null;
};
