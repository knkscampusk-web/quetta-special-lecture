// 화면 렌더링
import * as S from "./store.js?v=6";
import * as C from "./calc.js?v=6";
import { pinLength, fixedLoginId } from "./config.js?v=6";

const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g,
  (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])));
const host = () => $("#view");
const TERMS = ["제로", "1기", "2기", "3기", "4기"];
let termFilter = null;
let termInit = false;
let yearFilter = null;

const TERM_CODE = { 제로: "Z", "1기": "1", "2기": "2", "3기": "3", "4기": "4" };

/** 강좌의 연도. year 필드가 없으면 첫 회차 날짜에서 뽑습니다. */
export const courseYear = (c) =>
  c?.year ?? (Number(String(c?.sessions?.[0]?.date || "").slice(0, 4)) || null);

/** 수강 건의 연도 (강좌 기준) */
const enrollYear = (e) =>
  e?.year ?? courseYear(S.state.courses.find((c) => c.id === e?.courseId));

function allYears() {
  const set = new Set(S.state.courses.map(courseYear).filter(Boolean));
  set.add(new Date().getFullYear());
  return [...set].sort();
}

/** 기수별 수업 기간 (최초 개강 ~ 마지막 회차) */
function termRanges() {
  const r = {};
  S.state.courses.filter((c) => !yearFilter || courseYear(c) === yearFilter).forEach((c) => {
    (c.sessions || []).forEach((s) => {
      if (!s.date) return;
      const cur = (r[c.term] ||= { min: s.date, max: s.date });
      if (s.date < cur.min) cur.min = s.date;
      if (s.date > cur.max) cur.max = s.date;
    });
  });
  return r;
}

/** 오늘 기준 진행 중인 기수. 없으면 가장 가까운 다음 기수, 그것도 없으면 마지막 기수 */
export function currentTerm() {
  const today = C.iso(new Date());
  const r = termRanges();
  const have = TERMS.filter((t) => r[t]);
  const running = have.find((t) => r[t].min <= today && today <= r[t].max);
  if (running) return running;
  const upcoming = have.filter((t) => r[t].min > today).sort((a, b) => r[a].min.localeCompare(r[b].min));
  if (upcoming.length) return upcoming[0];
  return have.length ? have[have.length - 1] : null;
}

/** 데이터가 처음 도착했을 때 진행 중 기수로 한 번만 고정 */
function ensureTermFilter() {
  if (termInit || !S.state.courses.length) return;
  termInit = true;
  const ys = allYears();
  const now = new Date().getFullYear();
  yearFilter = ys.includes(now) ? now : ys[ys.length - 1];
  calYearSel = yearFilter;
  termFilter = currentTerm();
}

export function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function drawer(title, sub, bodyHtml) {
  closeDrawer();
  const bg = document.createElement("div");
  bg.className = "drawer-bg"; bg.id = "dbg";
  const d = document.createElement("aside");
  d.className = "drawer"; d.id = "dpanel";
  d.setAttribute("role", "dialog"); d.setAttribute("aria-label", title);
  d.innerHTML = `<div class="drawer-head">
      <div><h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}</div>
      <button class="x-btn" id="dclose" aria-label="닫기"><i data-lucide="x"></i></button>
    </div><div class="drawer-body">${bodyHtml}</div>`;
  document.body.append(bg, d);
  bg.onclick = closeDrawer;
  $("#dclose").onclick = closeDrawer;
  window.lucide?.createIcons();
  return d;
}
export function closeDrawer() {
  $("#dbg")?.remove(); $("#dpanel")?.remove();
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

const filterBar = (active) => termChips(active);

/** 사이드바 연도 선택기 — 최근 2개 연도만 보여줍니다. */
function paintYearPicker() {
  const sel = document.querySelector("#yearSel");
  if (!sel) return;
  const ys = allYears().slice(-2);                 // 최근 2년
  if (yearFilter && !ys.includes(yearFilter)) yearFilter = ys[ys.length - 1];
  sel.innerHTML = ys.map((v) =>
    `<option value="${v}" ${v === yearFilter ? "selected" : ""}>${v}년</option>`).join("");
  sel.onchange = () => {
    yearFilter = Number(sel.value);
    termFilter = currentTerm();
    calYearSel = yearFilter;                       // 수업일 계산도 함께 이동
    render();
  };
}

const termChips = (active) => {
  const cur = currentTerm();
  return `<div class="chips">
  <button class="chip ${active === null ? "on" : ""}" data-term="">전체</button>
  ${TERMS.map((t) => `<button class="chip ${active === t ? "on" : ""}" data-term="${t}">${t}${
    t === cur ? '<span title="진행 중" style="display:inline-block;width:5px;height:5px;border-radius:99px;background:currentColor;vertical-align:middle;margin-left:5px;opacity:.7"></span>' : ""
  }</button>`).join("")}
</div>`;
};


const STATUS_TAG = { "수강": "tag-ok", "신청": "tag-warn", "취소": "tag-neutral", "환불": "tag-danger" };
const statusTag = (raw) => {
  const st = C.normStatus(raw);
  return `<span class="tag ${STATUS_TAG[st] || "tag-neutral"}">${esc(st)}</span>`;
};

/** 강좌의 전체 수업일을 칩으로. 지난 날은 어둡게, 오늘 수업은 강조 */
function sessionChips(sessions, today) {
  const list = sessions || [];
  if (!list.length) return '<span class="dim">-</span>';
  return list.map((x) => {
    const md = `${+x.date.slice(5, 7)}/${+x.date.slice(8, 10)}`;
    const cls = x.canceled ? "sd-off"
      : x.date === today ? "sd-now"
      : x.date < today ? "sd-past" : "sd-next";
    return `<span class="sd ${cls}" title="${x.no}회차 · ${C.fmt(x.date)}${
      x.canceled ? " · 휴강" : x.date === today ? " · 오늘 수업" : x.date < today ? " · 완료" : ""}">${md}</span>`;
  }).join("");
}

const emptyBox = (title, hint) =>
  `<div class="empty"><b>${esc(title)}</b>${hint ? esc(hint) : ""}</div>`;

// ════════════════════════════════════════════════════════════════
// 1. 현황표
// ════════════════════════════════════════════════════════════════
export function viewDashboard() {
  const { courses, enrollments, waitlist } = S.state;
  const today = C.iso(new Date());
  const list = courses
    .filter((c) => (!yearFilter || courseYear(c) === yearFilter)
      && (!termFilter || c.term === termFilter))
    .slice().sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term)
      || String(a.subject).localeCompare(b.subject));

  const sum = list.reduce((a, c) => {
    const n = C.countsFor(c.id, enrollments, waitlist, c);
    a.active += n.active; a.attending += n.attending; a.applied += n.applied;
    a.canceled += n.canceled; a.refunded += n.refunded; a.waiting += n.waiting;
    return a;
  }, { active: 0, attending: 0, applied: 0, canceled: 0, refunded: 0, waiting: 0 });

  host().innerHTML = `
  <div class="page-head">
    <div><h1>현황표</h1><p>기수별 개설 강좌와 신청·수강 현황입니다.</p></div>
    <div class="toolbar">
      ${filterBar(termFilter)}
      <button class="btn btn-pri" id="course-add"><i data-lucide="plus"></i>강좌 추가</button>
    </div>
  </div>
  <dl class="kpis">
    <div class="kpi"><dt>개설 강좌</dt><dd>${list.length}<small>개</small></dd></div>
    <div class="kpi accent"><dt>인원</dt><dd>${sum.active}<small>명</small></dd></div>
    <div class="kpi"><dt>수강</dt><dd>${sum.attending}<small>명</small></dd></div>
    <div class="kpi ${sum.applied ? "alert" : ""}"><dt>신청</dt><dd>${sum.applied}<small>명</small></dd></div>
    <div class="kpi"><dt>취소</dt><dd>${sum.canceled}<small>건</small></dd></div>
    <div class="kpi"><dt>환불</dt><dd>${sum.refunded}<small>건</small></dd></div>
    <div class="kpi"><dt>대기</dt><dd>${sum.waiting}<small>명</small></dd></div>
  </dl>
  <section class="card">
    <div class="card-head"><h2>강좌 목록</h2><span class="sub">행을 누르면 상세가 열립니다</span></div>
    <div class="tbl-wrap">${list.length ? `<table class="tbl">
      <thead><tr>
        <th>기수</th><th>과목</th><th>강의명</th><th>담당</th><th>요일·시간</th><th class="ctr">강의실</th>
        <th class="ctr">인원</th><th class="ctr">수강</th><th class="ctr">신청</th>
        <th class="ctr">취소</th><th class="ctr">환불</th><th class="ctr">대기</th>
        <th class="ctr">정원</th><th class="ctr">개강</th><th class="ctr">회차</th><th>수업일</th>
      </tr></thead><tbody>
      ${list.map((c) => {
        const n = C.countsFor(c.id, enrollments, waitlist, c);
        const cap = c.cap1 || c.cap2 || null;
        const pct = cap ? Math.min(Math.round((n.active / cap) * 100), 130) : 0;
        const cls = !cap ? "" : n.active > cap ? "over" : n.active === cap ? "full" : "";
        const open = (c.sessions || [])[0]?.date;
        return `<tr class="clickable" data-course="${esc(c.id)}">
          <td><span class="tag tag-peri">${esc(c.term)}</span></td>
          <td>${esc(c.subject)}</td>
          <td class="strong">${esc(c.title)}</td>
          <td>${esc((c.teachers || []).join(", "))}</td>
          <td>${esc([c.day1, c.time1].filter(Boolean).join(" "))}</td>
          <td class="ctr">${esc(c.room) || '<span class="dim">-</span>'}</td>
          <td class="ctr strong" ${n.archived ? 'title="학생 정보 삭제 후 보관된 최종 집계"' : ""}>${
            n.active}${n.archived ? '<span class="dim" style="font-size:9px;margin-left:2px">보관</span>' : ""}</td>
          <td class="ctr">${n.attending}</td>
          <td class="ctr">${n.applied ? `<span class="tag tag-warn">${n.applied}</span>` : '<span class="dim">0</span>'}</td>
          <td class="ctr">${n.canceled || '<span class="dim">0</span>'}</td>
          <td class="ctr">${n.refunded || '<span class="dim">0</span>'}</td>
          <td class="ctr">${n.waiting || '<span class="dim">0</span>'}</td>
          <td class="ctr">${cap ? `<span class="gauge"><i class="${cls}" style="width:${pct}%"></i></span> <span class="dim">${cap}</span>` : '<span class="dim">-</span>'}</td>
          <td class="ctr">${open ? C.fmt(open) : '<span class="dim">-</span>'}</td>
          <td class="ctr">${(c.sessions || []).length}</td>
          <td class="days">${sessionChips(c.sessions, today)}</td>
        </tr>`;
      }).join("")}
      </tbody></table>` : emptyBox("표시할 강좌가 없습니다.", "기수 필터를 바꾸거나 데이터를 먼저 적재하세요.")}
    </div>
  </section>`;
  $("#course-add").onclick = () => courseFormDrawer(null);
  host().querySelectorAll("[data-course]").forEach((tr) =>
    tr.addEventListener("click", () => courseDrawer(tr.dataset.course)));
}

function courseDrawer(id) {
  const c = S.state.courses.find((x) => x.id === id);
  if (!c) return;
  const n = C.countsFor(id, S.state.enrollments, S.state.waitlist, c);
  const mins = C.minutesOf(c.time1);
  const roster = S.state.enrollments.filter((e) => e.courseId === id && C.ACTIVE.includes(C.normStatus(e.status)))
    .map((e) => ({ e, s: S.state.students.find((s) => s.id === e.studentId) }))
    .sort((a, b) => String(a.e.studentId).localeCompare(String(b.e.studentId), "ko", { numeric: true }));

  const d = drawer(c.title, `${courseYear(c) || ""} ${c.term} · ${(c.teachers || []).join(", ")}`, `
    <button class="btn btn-sm" id="course-edit" style="margin-bottom:14px"><i data-lucide="pencil"></i>강좌 수정</button>
    <dl class="dl">
      <dt>강좌 ID</dt><dd><code>${esc(c.id)}</code></dd>
      <dt>요일·시간</dt><dd>${esc([c.day1, c.time1].filter(Boolean).join(" "))}${mins ? ` <span class="dim">(${mins}분)</span>` : ""}</dd>
      <dt>강의실</dt><dd>${esc(c.room) || "-"}</dd>
      <dt>교습비</dt><dd>${C.won(c.fee?.tuition)}${mins && c.sessions?.length ? ` <span class="dim">· 계산값 ${C.won(C.tuitionOf(mins, c.sessions.length))}</span>` : ""}</dd>
      <dt>교재</dt><dd>${esc(c.textbook?.title) || "없음"}${c.fee?.book ? ` · ${C.won(c.fee.book)}` : ""}</dd>
      <dt>총액</dt><dd class="strong">${C.won(c.fee?.total)}</dd>
      ${c.attendanceUrl ? `<dt>출석부</dt><dd><a href="${esc(c.attendanceUrl)}" target="_blank" rel="noopener">열기</a></dd>` : ""}
      <dt>현황</dt><dd>인원 ${n.active} (수강 ${n.attending} · 신청 ${n.applied}) · 취소 ${n.canceled} · 환불 ${n.refunded} · 대기 ${n.waiting}</dd>
      ${c.note ? `<dt>특이사항</dt><dd>${esc(c.note)}</dd>` : ""}
    </dl>
    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px">수업 일정 (${(c.sessions || []).length}회)</h4>
    <div class="daylist">${(c.sessions || []).map((s) =>
      `<span class="day ${s.canceled ? "skip" : ""}">${s.no}회 ${C.fmt(s.date)}</span>`).join("") || '<span class="dim">등록된 회차 없음</span>'}</div>
    <h4 style="font-size:12px;color:var(--muted);margin:22px 0 8px">명단 ${roster.length}명</h4>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      ${roster.map(({ e, s }) => `<tr>
        <td>${esc(s?.classGroup) || "-"}</td><td class="strong">${esc(s?.name) || e.studentId}</td>
        <td class="dim">${esc(e.studentId)}</td>
        <td>${statusTag(e.status)}</td>
        <td class="dim">${e.startSession && e.startSession > 1 ? `${e.startSession}회차부터` : ""}</td>
      </tr>`).join("") || '<tr><td class="dim">등록된 학생이 없습니다.</td></tr>'}
    </tbody></table></div>`);
  $("#course-edit", d).onclick = () => courseFormDrawer(c.id);
}

/** 선택 연도의 제외일 (모의고사·정기휴가·휴강) — 수업일 자동 생성에 사용 */
function exceptsOfYear(year) {
  const cells = S.state.calendars?.[String(year)]?.cells || {};
  const m = new Map();
  Object.entries(cells).forEach(([d, v]) => {
    if (["모의고사", "정기휴가", "휴강"].includes(v)) m.set(d, v);
  });
  return m;
}

const shortTitle = (t) => String(t || "")
  .replace(/^［.*?］|^\[.*?\]/, "")
  .replace(/\(.*?\)/g, "")
  .replace(/\s+/g, "")
  .replace(/확률과통계/g, "확통");

/** 강좌 추가 · 수정 */
function courseFormDrawer(courseId) {
  const editing = courseId ? S.state.courses.find((x) => x.id === courseId) : null;
  const y = editing ? (courseYear(editing) || yearFilter) : yearFilter;

  const d = drawer(editing ? "강좌 수정" : "강좌 추가",
    editing ? editing.id : `${y}년 · 개강일과 회차를 넣으면 수업일이 자동 계산됩니다`, `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field" style="margin:0"><span>연도</span>
        <input class="inp" type="number" id="c-year" value="${y}" ${editing ? "disabled" : ""} style="width:100%"></label>
      <label class="field" style="margin:0"><span>기수</span>
        <select class="inp" id="c-term" style="width:100%">
          ${TERMS.map((t) => `<option ${editing?.term === t || (!editing && t === termFilter) ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:12px">
      <label class="field" style="margin:0"><span>과목</span>
        <input class="inp" id="c-subject" value="${esc(editing?.subject || "")}" placeholder="국어" style="width:100%"></label>
      <label class="field" style="margin:0"><span>강의명</span>
        <input class="inp" id="c-title" value="${esc(editing?.title || "")}" placeholder="［7월］빌드업 국어" style="width:100%"></label>
    </div>
    <label class="field" style="margin-top:12px"><span>담당 선생님 (쉼표로 구분)</span>
      <input class="inp" id="c-teachers" value="${esc((editing?.teachers || []).join(", "))}" style="width:100%"></label>
    <div style="display:grid;grid-template-columns:1fr 1.4fr 1fr;gap:10px">
      <label class="field" style="margin:0"><span>요일</span>
        <select class="inp" id="c-day" style="width:100%">
          ${C.DAYS.map((x) => `<option ${String(editing?.day1 || "").startsWith(x) ? "selected" : ""}>${x}</option>`).join("")}
        </select></label>
      <label class="field" style="margin:0"><span>시간</span>
        <input class="inp" id="c-time" value="${esc(editing?.time1 || "")}" placeholder="19:10~22:00" style="width:100%"></label>
      <label class="field" style="margin:0"><span>강의실</span>
        <input class="inp" id="c-room" value="${esc(editing?.room || "")}" style="width:100%"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:12px">
      <label class="field" style="margin:0"><span>개강일</span>
        <input class="inp" type="date" id="c-start" value="${esc(editing?.sessions?.[0]?.date || "")}" style="width:100%"></label>
      <label class="field" style="margin:0"><span>회차</span>
        <input class="inp" type="number" id="c-count" min="1" max="20" value="${(editing?.sessions || []).length || 8}" style="width:100%"></label>
      <label class="field" style="margin:0"><span>정원</span>
        <input class="inp" type="number" id="c-cap" min="0" value="${editing?.cap1 ?? ""}" style="width:100%"></label>
    </div>
    <div id="c-sess" style="margin:10px 0 4px"></div>

    <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:8px">
      <label class="field" style="margin:0"><span>교재명</span>
        <input class="inp" id="c-book" value="${esc(editing?.textbook?.title || "")}" style="width:100%"></label>
      <label class="field" style="margin:0"><span>교재비</span>
        <input class="inp" type="number" id="c-bookfee" min="0" step="1000" value="${editing?.fee?.book ?? 0}" style="width:100%"></label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
      <label class="field" style="margin:0"><span>교습비</span>
        <input class="inp" type="number" id="c-tuition" min="0" step="10" value="${editing?.fee?.tuition ?? ""}" style="width:100%"></label>
      <label class="field" style="margin:0"><span>총액</span>
        <input class="inp" type="number" id="c-total" min="0" step="10" value="${editing?.fee?.total ?? ""}" style="width:100%"></label>
    </div>
    <p id="c-feehint" style="font-size:12px;color:var(--muted);margin:6px 0 12px"></p>

    <label class="field"><span>출석부 링크</span>
      <input class="inp" id="c-att" value="${esc(editing?.attendanceUrl || "")}" placeholder="https://" style="width:100%"></label>
    <label class="field"><span>특이사항</span>
      <input class="inp" id="c-note" value="${esc(editing?.note || "")}" style="width:100%"></label>

    <button class="btn btn-pri" id="c-save" style="width:100%;justify-content:center;margin-top:6px">
      ${editing ? "수정 저장" : "강좌 추가"}</button>
    ${editing ? '<p style="font-size:12px;color:var(--muted);margin:10px 0 0">강좌 ID는 바뀌지 않습니다. 이미 등록된 수강생은 그대로 유지됩니다.</p>' : ""}`);

  const el = (s2) => $(s2, d);
  let sessions = editing?.sessions ? editing.sessions.slice() : [];

  const rebuild = () => {
    const start = el("#c-start").value;
    const count = Number(el("#c-count").value);
    const yr = Number(el("#c-year").value);
    if (!start || !count) { sessions = []; el("#c-sess").innerHTML = ""; return feeHint(); }
    const rows = C.buildSessions({
      startDate: start, weekday: el("#c-day").value, count, excepts: exceptsOfYear(yr),
    });
    sessions = rows.filter((r) => !r.skipped).map((r) => ({ no: r.no, date: r.date, canceled: false }));
    const skipped = rows.filter((r) => r.skipped);
    el("#c-sess").innerHTML = `<div class="daylist">${rows.map((r) => r.skipped
      ? `<span class="day skip" title="${esc(r.reason)}">${esc(r.reason)} ${C.fmt(r.date)}</span>`
      : `<span class="day">${r.no}회 ${C.fmt(r.date)}</span>`).join("")}</div>
      <p style="font-size:12px;color:var(--muted);margin:8px 0 0">
        ${sessions.length}회 편성${skipped.length ? ` · ${skipped.length}주 건너뜀` : ""}${
          sessions.length ? ` · ${C.fmt(sessions[0].date)} 개강, ${C.fmt(sessions[sessions.length - 1].date)} 종강` : ""}</p>`;
    feeHint();
  };

  const feeHint = () => {
    const mins = C.minutesOf(el("#c-time").value);
    const auto = C.tuitionOf(mins, sessions.length);
    el("#c-feehint").innerHTML = auto
      ? `계산값 ${C.won(auto)} (196원 × ${mins}분 × ${sessions.length}회)
         <button class="btn btn-sm" id="c-apply" type="button" style="margin-left:6px">적용</button>`
      : "시간과 회차를 넣으면 교습비 계산값이 표시됩니다.";
    const btn = el("#c-apply");
    if (btn) btn.onclick = () => {
      el("#c-tuition").value = auto;
      el("#c-total").value = auto + Number(el("#c-bookfee").value || 0);
    };
  };

  ["#c-start", "#c-count", "#c-day", "#c-year"].forEach((sel) => el(sel).addEventListener("change", rebuild));
  ["#c-time", "#c-bookfee"].forEach((sel) => el(sel).addEventListener("input", feeHint));
  rebuild();

  el("#c-save").onclick = async (ev) => {
    const yr = Number(el("#c-year").value);
    const term = el("#c-term").value;
    const subject = el("#c-subject").value.trim();
    const title = el("#c-title").value.trim();
    if (!subject) return toast("과목을 입력하세요.");
    if (!title) return toast("강의명을 입력하세요.");
    if (!sessions.length) return toast("개강일과 회차를 확인하세요.");

    const id = editing ? editing.id : `${yr}_${TERM_CODE[term]}_${subject}_${shortTitle(title)}`;
    if (!editing && S.state.courses.some((c) => c.id === id)) {
      return toast("같은 이름의 강좌가 이미 있습니다. 강의명을 조금 다르게 하세요.");
    }
    const tuition = Number(el("#c-tuition").value) || null;
    const book = Number(el("#c-bookfee").value) || 0;

    ev.target.disabled = true; ev.target.textContent = "저장 중…";
    try {
      await S.saveCourseDoc(id, {
        id, year: yr, term, subject, title,
        teachers: el("#c-teachers").value.split(",").map((x) => x.trim()).filter(Boolean),
        day1: el("#c-day").value + "요일", time1: el("#c-time").value.trim() || null,
        room: el("#c-room").value.trim() || null,
        cap1: Number(el("#c-cap").value) || null,
        sessions, closedDates: editing?.closedDates || [],
        textbook: { title: el("#c-book").value.trim() || null, qty: editing?.textbook?.qty ?? null,
                    distributeDate: editing?.textbook?.distributeDate ?? null },
        fee: { tuition, book, total: Number(el("#c-total").value) || ((tuition || 0) + book) },
        attendanceUrl: el("#c-att").value.trim() || null,
        note: el("#c-note").value.trim() || null,
      });
      closeDrawer();
      yearFilter = yr; termFilter = term;
      toast(editing ? "강좌를 수정했습니다." : "강좌를 추가했습니다.");
      render("dashboard");
    } catch (err) {
      toast("저장하지 못했습니다: " + err.message);
      ev.target.disabled = false; ev.target.textContent = editing ? "수정 저장" : "강좌 추가";
    }
  };
}

// ════════════════════════════════════════════════════════════════
// 2. 특강학생명단
// ════════════════════════════════════════════════════════════════
let q = "", statusFilter = "", courseFilter = "";

export function viewStudents() {
  const { enrollments, students, courses } = S.state;
  const rows = enrollments
    .filter((e) => {
      const st = C.normStatus(e.status);
      if (st === "환불") return false;
      return statusFilter ? st === statusFilter : C.ACTIVE.includes(st);
    })
    .map((e) => ({ e, s: students.find((x) => x.id === e.studentId), c: courses.find((x) => x.id === e.courseId) }))
    .filter(({ e, s, c }) => {
      if (yearFilter && enrollYear(e) !== yearFilter) return false;
      if (termFilter && e.term !== termFilter) return false;
      if (courseFilter && e.courseId !== courseFilter) return false;
      if (!q) return true;
      const hay = `${s?.name || ""} ${e.studentId} ${s?.classGroup || ""} ${c?.title || ""}`;
      return hay.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => String(a.e.studentId).localeCompare(String(b.e.studentId), "ko", { numeric: true })
      || String(a.s?.name ?? "").localeCompare(String(b.s?.name ?? ""), "ko"));

  const courseOpts = courses
    .filter((c) => (!yearFilter || courseYear(c) === yearFilter) && (!termFilter || c.term === termFilter))
    .map((c) => `<option value="${esc(c.id)}" ${courseFilter === c.id ? "selected" : ""}>${esc(c.term)} · ${esc(c.title)}</option>`).join("");

  host().innerHTML = `
  <div class="page-head">
    <div><h1>특강학생명단</h1><p>학생 × 강좌 단위로 조회합니다. 총 ${rows.length}건.</p></div>
    <div class="toolbar">
      <button class="btn btn-pri" id="add"><i data-lucide="plus"></i>신청 추가</button>
      <button class="btn" id="upload"><i data-lucide="upload"></i>신청명단 불러오기</button>
      <button class="btn" id="xlsx"><i data-lucide="download"></i>엑셀파일로 저장</button>
    </div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    ${filterBar(termFilter)}
    <input class="inp" id="q" placeholder="이름 · 학번 · 반 검색" value="${esc(q)}" style="width:200px">
    <select class="inp" id="st">
      <option value="">신청 + 수강</option>
      <option value="수강" ${statusFilter === "수강" ? "selected" : ""}>수강만</option>
      <option value="신청" ${statusFilter === "신청" ? "selected" : ""}>신청만</option>
      <option value="취소" ${statusFilter === "취소" ? "selected" : ""}>취소 이력</option>
    </select>
    <select class="inp" id="cf"><option value="">강좌 전체</option>${courseOpts}</select>
  </div>
  ${statusFilter === "취소" ? `<div class="banner banner-info"><i data-lucide="info"></i>
    <div>결제 전 취소한 이력입니다. 평소 명단에는 나오지 않으며, 같은 학생이 다시 신청하면
    <b>신청 추가</b>로 되살릴 수 있습니다.</div></div>` : ""}
  <section class="card"><div class="tbl-wrap">${rows.length ? `<table class="tbl">
    <thead><tr><th>반</th><th>그룹</th><th>학번</th><th>성명</th><th>기수</th><th>강좌</th>
      <th>시작회차</th><th>결제주체</th><th>결제일</th><th>상태</th><th></th></tr></thead>
    <tbody>${rows.map(({ e, s, c }) => {
      const st = C.normStatus(e.status);
      return `<tr class="clickable" data-sid="${esc(e.studentId)}">
      <td>${esc(s?.classGroup) || "-"}</td><td>${esc(s?.group) || "-"}</td>
      <td class="dim">${esc(e.studentId)}</td><td class="strong">${esc(s?.name) || "-"}</td>
      <td><span class="tag tag-peri">${esc(e.term)}</span></td>
      <td>${esc(c?.title) || '<span class="tag tag-danger">미연결</span>'}</td>
      <td>${e.startSession && e.startSession > 1
        ? `<span class="tag tag-teal">${e.startSession}회차</span>` : '<span class="dim">1회차</span>'}</td>
      <td>${esc(e.payer) || '<span class="dim">-</span>'}</td>
      <td>${e.paidAt ? C.fmt(e.paidAt) : '<span class="dim">-</span>'}</td>
      <td>${statusTag(e.status)}</td>
      <td style="white-space:nowrap">${
        st === "수강" ? `<button class="btn btn-sm btn-danger" data-refund="${esc(e.id)}">환불 신청</button>`
        : st === "신청" ? `<button class="btn btn-sm" data-pay="${esc(e.id)}">결제확인</button>
            <button class="btn btn-sm btn-danger" data-cancel="${esc(e.id)}">취소</button>`
        : `<button class="btn btn-sm" data-restore="${esc(e.id)}">되살리기</button>`}</td>
    </tr>`;
    }).join("")}</tbody></table>`
    : emptyBox("조건에 맞는 학생이 없습니다.", "검색어나 필터를 바꿔보세요.")}
  </div></section>`;

  $("#q").oninput = (ev) => { q = ev.target.value; render("students"); $("#q").focus(); };
  $("#st").onchange = (ev) => { statusFilter = ev.target.value; render("students"); };
  $("#cf").onchange = (ev) => { courseFilter = ev.target.value; render("students"); };
  $("#add").onclick = () => addEnrollDrawer();
  $("#xlsx").onclick = (ev) => exportExcel(rows, ev.currentTarget);
  $("#upload").onclick = openRosterUpload;
  host().querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const e = S.state.enrollments.find((x) => x.id === b.dataset.pay);
    await S.saveEnrollment(e.id, { status: "수강", paidAt: C.iso(new Date()) });
    toast("수강으로 변경했습니다.");
  }));
  host().querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const e = S.state.enrollments.find((x) => x.id === b.dataset.cancel);
    const s = S.state.students.find((x) => x.id === e.studentId);
    if (!confirm(`${s?.name || e.studentId} 학생의 신청을 취소합니다.\n명단에서는 숨겨지지만 기록은 남습니다. 계속할까요?`)) return;
    await S.saveEnrollment(e.id, { status: "취소", canceledAt: C.iso(new Date()) });
    toast("취소 처리했습니다. '취소 이력' 필터에서 볼 수 있습니다.");
  }));
  host().querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const e = S.state.enrollments.find((x) => x.id === b.dataset.restore);
    await S.saveEnrollment(e.id, { status: "신청", canceledAt: null });
    toast("신청 상태로 되살렸습니다.");
  }));
  host().querySelectorAll("[data-refund]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    refundDrawer(b.dataset.refund);
  }));
  host().querySelectorAll("[data-sid]").forEach((tr) => tr.addEventListener("click", () => studentDrawer(tr.dataset.sid)));
}

function studentDrawer(sid) {
  const s = S.state.students.find((x) => x.id === sid);
  const es = S.state.enrollments.filter((e) => e.studentId === sid);
  const ws = S.state.waitlist.filter((w) => w.studentId === sid);
  const total = es.filter((e) => C.normStatus(e.status) === "수강")
    .reduce((a, e) => a + (S.state.courses.find((c) => c.id === e.courseId)?.fee?.total || 0), 0);
  drawer(s?.name || sid, `${s?.classGroup || "-"}반 · ${sid}`, `
    <dl class="dl">
      <dt>기숙사</dt><dd>${esc(s?.dorm) || "-"}</dd>
      <dt>상태</dt><dd>${esc(s?.status) || "-"}</dd>
      <dt>전형</dt><dd>${esc(s?.admissionType) || "-"}</dd>
      <dt>누적 결제</dt><dd class="strong">${C.won(total)}</dd>
    </dl>
    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px">수강 이력 ${es.length}건</h4>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      ${es.map((e) => {
        const c = S.state.courses.find((x) => x.id === e.courseId);
        return `<tr><td><span class="tag tag-peri">${esc(e.term)}</span></td>
          <td class="strong">${esc(c?.title) || esc(e.courseId)}</td>
          <td>${statusTag(e.status)}</td><td class="dim">${e.paidAt ? C.fmt(e.paidAt) : ""}</td></tr>`;
      }).join("") || '<tr><td class="dim">이력이 없습니다.</td></tr>'}
    </tbody></table></div>
    ${ws.length ? `<h4 style="font-size:12px;color:var(--muted);margin:22px 0 8px">대기 ${ws.length}건</h4>
      <div class="tbl-wrap"><table class="tbl"><tbody>${ws.map((w) =>
        `<tr><td>${esc(w.courseTitle)}</td><td><span class="tag tag-neutral">${esc(w.state)}</span></td></tr>`).join("")}
      </tbody></table></div>` : ""}`);
}

function addEnrollDrawer(preCourseId = courseFilter) {
  const courses = S.state.courses
    .filter((c) => !yearFilter || courseYear(c) === yearFilter)
    .sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term)
      || String(a.subject).localeCompare(b.subject));
  const today = C.iso(new Date());

  const d = drawer("신청 추가", "학번을 입력하면 등록된 학생을 자동으로 찾습니다", `
    <label class="field"><span>강좌</span>
      <select class="inp" id="a-course" style="width:100%">
        <option value="">— 선택 —</option>
        ${courses.map((c) => `<option value="${esc(c.id)}" ${c.id === preCourseId ? "selected" : ""}>
          [${esc(c.term)}] ${esc(c.title)}${c.teachers?.length ? ` · ${esc(c.teachers.join(","))}` : ""}</option>`).join("")}
      </select></label>

    <label class="field"><span>시작 회차</span>
      <select class="inp" id="a-start" style="width:100%"></select>
      <span id="a-startinfo" style="display:block;font-size:12px;color:var(--muted);margin-top:5px"></span></label>

    <label class="field"><span>학번</span>
      <input class="inp" id="a-sid" style="width:100%" inputmode="numeric" placeholder="예: 5139" autocomplete="off"></label>
    <div id="a-who" style="margin:-6px 0 14px;font-size:13px"></div>

    <div id="a-new" hidden>
      <div class="banner banner-warn" style="margin-bottom:12px"><i data-lucide="user-plus"></i>
        <div>등록되지 않은 학번입니다. 아래 정보로 학생을 새로 만듭니다.</div></div>
      <label class="field"><span>성명</span><input class="inp" id="a-name" style="width:100%" autocomplete="off"></label>
      <label class="field"><span>반</span><input class="inp" id="a-class" style="width:100%" placeholder="예: N" autocomplete="off"></label>
    </div>

    <label class="field"><span>결제주체</span>
      <select class="inp" id="a-payer" style="width:100%">
        <option value="">미정</option><option>학부모</option><option>학생</option><option>학부모+학생</option>
      </select></label>
    <label class="field"><span>상태</span>
      <select class="inp" id="a-status" style="width:100%">
        <option value="신청">신청</option><option value="수강">수강 (결제 완료)</option>
      </select></label>
    <label class="field" id="a-paidwrap" hidden><span>결제일</span>
      <input class="inp" type="date" id="a-paid" value="${today}" style="width:100%"></label>

    <div id="a-warn" style="margin-bottom:12px"></div>
    <button class="btn btn-pri" id="a-go" style="width:100%;justify-content:center">추가하기</button>
    <div id="a-log" class="log" style="margin-top:16px;font-size:13px;color:var(--muted)"></div>`);

  const el = (s) => $(s, d);
  const added = [];

  const lookup = () => {
    const sid = el("#a-sid").value.trim();
    const who = el("#a-who"), box = el("#a-new");
    if (!sid) { who.innerHTML = ""; box.hidden = true; return null; }
    const st = S.state.students.find((x) => x.id === sid);
    if (st) {
      who.innerHTML = `<span class="tag tag-teal">${esc(st.name || "이름없음")}</span>
        <span class="dim" style="margin-left:6px">${esc(st.classGroup) || "-"}반${st.status ? ` · ${esc(st.status)}` : ""}</span>`;
      box.hidden = true;
    } else {
      who.innerHTML = "";
      box.hidden = false;
    }
    return st;
  };

  const checkDup = () => {
    const sid = el("#a-sid").value.trim(), cid = el("#a-course").value;
    const w = el("#a-warn");
    if (!sid || !cid) { w.innerHTML = ""; return false; }
    const dup = S.state.enrollments.find((e) => e.studentId === sid && e.courseId === cid);
    if (!dup) { w.innerHTML = ""; return false; }
    w.innerHTML = `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <div>이미 이 강좌에 <b>${esc(dup.status)}</b> 상태로 등록된 학생입니다. 추가하면 상태가 덮어써집니다.</div></div>`;
    window.lucide?.createIcons();
    return true;
  };

  const fillSessions = () => {
    const c = S.state.courses.find((x) => x.id === el("#a-course").value);
    const sel = el("#a-start"), info = el("#a-startinfo");
    const list = c?.sessions || [];
    if (!list.length) {
      sel.innerHTML = '<option value="1">1회차</option>';
      info.textContent = "회차 정보가 없는 강좌입니다.";
      return;
    }
    const today = C.iso(new Date());
    const next = list.find((x) => !x.canceled && x.date >= today) || list[0];
    sel.innerHTML = list.map((x) => `<option value="${x.no}" ${x.no === next.no ? "selected" : ""}>
      ${x.no}회차 · ${C.fmt(x.date)}${x.canceled ? " (휴강)" : ""}</option>`).join("");
    const remain = list.filter((x) => !x.canceled && x.no >= next.no).length;
    info.textContent = `오늘 기준 다음 수업은 ${next.no}회차입니다. 남은 수업 ${remain}회.`;
  };
  fillSessions();

  el("#a-sid").addEventListener("input", () => { lookup(); checkDup(); });
  el("#a-course").addEventListener("change", () => { fillSessions(); checkDup(); });
  el("#a-status").addEventListener("change", () => {
    el("#a-paidwrap").hidden = el("#a-status").value !== "수강";
  });

  el("#a-go").onclick = async (ev) => {
    const cid = el("#a-course").value;
    const sid = el("#a-sid").value.trim();
    const status = el("#a-status").value;
    if (!cid) return toast("강좌를 선택하세요.");
    if (!sid) return toast("학번을 입력하세요.");

    const known = S.state.students.find((x) => x.id === sid);
    const name = known ? known.name : el("#a-name").value.trim();
    if (!known && !name) return toast("새 학생은 성명을 입력해야 합니다.");

    const course = S.state.courses.find((x) => x.id === cid);
    ev.target.disabled = true; ev.target.textContent = "추가하는 중…";
    try {
      if (!known) {
        await S.saveStudent(sid, {
          id: sid, name, classGroup: el("#a-class").value.trim() || null, status: "재원",
        });
      }
      await S.saveEnrollment(`${sid}__${cid}`, {
        id: `${sid}__${cid}`, studentId: sid, courseId: cid,
        term: course.term, year: courseYear(course),
        payer: el("#a-payer").value || null,
        paidAt: status === "수강" ? el("#a-paid").value : null,
        startSession: Number(el("#a-start").value) || 1,
        status, refund: null, canceledAt: null, source: "manual",
      });
      added.unshift(`${name} · ${course.title}`);
      el("#a-log").innerHTML = `<b style="color:var(--ok)">추가 ${added.length}건</b><br>`
        + added.slice(0, 6).map((t) => esc(t)).join("<br>");
      // 연속 입력을 위해 학번만 비우고 강좌는 유지
      el("#a-sid").value = ""; el("#a-name").value = ""; el("#a-class").value = "";
      el("#a-who").innerHTML = ""; el("#a-new").hidden = true; el("#a-warn").innerHTML = "";
      el("#a-sid").focus();
      toast(`${name} 학생을 추가했습니다.`);
    } catch (err) {
      toast("추가하지 못했습니다: " + err.message);
    } finally {
      ev.target.disabled = false; ev.target.textContent = "추가하기";
    }
  };

  el("#a-sid").focus();
}

function refundDrawer(enrollmentId) {
  const e = S.state.enrollments.find((x) => x.id === enrollmentId);
  const c = S.state.courses.find((x) => x.id === e.courseId);
  const s = S.state.students.find((x) => x.id === e.studentId);
  const today = C.iso(new Date());
  const totalSessions = (c?.sessions || []).length;
  const hasBook = (c?.fee?.book || 0) > 0;
  const startNo = e.startSession || 1;

  const opts = ["전액", ...Array.from({ length: totalSessions }, (_, i) => `${i + 1}회수강`)];
  const autoType = C.refundTypeFor(C.sessionsTaken(c, today, startNo));

  const d = drawer("환불 신청", `${s?.name || e.studentId} · ${c?.title || e.courseId}`, `
    <div class="banner banner-info"><i data-lucide="info"></i>
      <div>오늘(${C.fmt(today)}) 기준 이 학생은 <b>${C.sessionsTaken(c, today, startNo)}회</b> 수강했습니다.
      ${startNo > 1 ? `${startNo}회차부터 시작했고, ` : ""}휴강일은 회차에서 제외했습니다.</div></div>
    <label class="field"><span>취소일</span>
      <input class="inp" type="date" id="r-date" value="${today}" style="width:100%"></label>
    <label class="field"><span>환불유형</span>
      <select class="inp" id="r-type" style="width:100%">
        ${opts.map((o) => `<option ${o === autoType ? "selected" : ""}>${o}</option>`).join("")}
      </select></label>
    <label class="field"><span>교재</span>
      <select class="inp" id="r-book" style="width:100%" ${hasBook ? "" : "disabled"}>
        ${hasBook
          ? '<option value="환불">반납 · 교재비 환불</option><option value="수령">수령함 · 교재비 차감</option>'
          : '<option value="없음">교재 없음</option>'}
      </select></label>
    <dl class="dl" style="margin-top:18px">
      <dt>총 결제액</dt><dd>${C.won(c?.fee?.total)}</dd>
      <dt>1회 교습비</dt><dd>${C.won(totalSessions ? Math.round((c?.fee?.tuition || 0) / totalSessions) : null)}</dd>
      <dt>교재비</dt><dd>${hasBook ? C.won(c.fee.book) : "없음"}</dd>
      <dt>환불 예상액</dt><dd class="strong" id="r-amt" style="font-size:17px;color:var(--teal-d)">-</dd>
    </dl>
    <button class="btn btn-pri" id="r-go" style="width:100%;justify-content:center;margin-top:6px">환불 확정</button>
    <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
      확정하면 이 학생은 환불자 명단으로 이동합니다. 되돌리려면 환불자 명단에서 처리하세요.</p>`);

  const read = () => ({
    canceledAt: $("#r-date", d).value || today,
    type: $("#r-type", d).value,
    bookRefund: $("#r-book", d).value,
  });
  const paint = () => { $("#r-amt", d).textContent = C.won(C.refundAmount(c, read())); };
  ["#r-date", "#r-type", "#r-book"].forEach((sel) => {
    const el = $(sel, d);
    el.addEventListener("change", () => {
      if (sel === "#r-date") $("#r-type", d).value = C.refundTypeFor(C.sessionsTaken(c, el.value, startNo));
      paint();
    });
  });
  paint();

  $("#r-go", d).onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "처리 중…";
    try {
      await S.saveEnrollment(e.id, { status: "환불", refund: read() });
      closeDrawer();
      toast("환불 처리했습니다. 환불자 명단에서 확인하세요.");
    } catch (err) {
      toast("처리하지 못했습니다: " + err.message);
      ev.target.disabled = false; ev.target.textContent = "환불 확정";
    }
  };
}

async function exportExcel(rows, btn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "저장 중…"; }
  try {
    const XLSX = await loadSheetJs();
    const head = ["반", "그룹", "학번", "성명", "기수", "강좌", "시작회차", "결제주체", "결제일", "상태"];
    const body = rows.map(({ e, s, c }) => [s?.classGroup ?? "", s?.group ?? "", e.studentId,
      s?.name ?? "", e.term ?? "", c?.title ?? "", e.startSession || 1,
      e.payer ?? "", e.paidAt ?? "", C.normStatus(e.status)]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = [6, 6, 8, 10, 7, 26, 9, 11, 12, 10].map((w) => ({ wch: w }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "특강학생명단");
    XLSX.writeFile(wb, `특강학생명단_${C.iso(new Date())}.xlsx`);
  } catch (err) {
    toast("저장하지 못했습니다: " + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

// ── 신청명단 엑셀 불러오기 ──────────────────────────────────────
async function loadSheetJs() {
  if (window.XLSX) return window.XLSX;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    s.onload = res; s.onerror = () => rej(new Error("SheetJS 로드 실패"));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

function openRosterUpload() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls";
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
      const hi = grid.findIndex((r) => (r || []).some((c) => String(c).trim() === "학번"));
      if (hi < 0) throw new Error("'학번' 헤더를 찾을 수 없습니다. 신청명단 원본 파일인지 확인하세요.");
      const head = grid[hi].map((x) => String(x ?? "").trim());
      const col = (name) => head.indexOf(name);
      const courseCols = head.map((h, i) => ({ h, i }))
        .filter(({ h, i }) => h && i > col("결제방법"));
      const parsed = [];
      for (let r = hi + 1; r < grid.length; r++) {
        const row = grid[r] || []; const sid = String(row[col("학번")] ?? "").trim();
        if (!sid) continue;
        courseCols.forEach(({ h, i }) => {
          if (!String(row[i] ?? "").trim()) return;
          parsed.push({
            studentId: sid, name: String(row[col("이름")] ?? "").trim(),
            classGroup: String(row[col("반")] ?? "").trim(),
            payer: String(row[col("결제방법")] ?? "").trim() || null,
            courseTitle: h,
          });
        });
      }
      previewRoster(parsed, file.name);
    } catch (err) { toast(err.message); }
  };
  inp.click();
}

function previewRoster(parsed, filename) {
  const rows = parsed.map((p) => ({ ...p, course: findCourseByTitle(p.courseTitle) }));
  const okRows = rows.filter((r) => r.course);
  const bad = rows.filter((r) => !r.course);
  const news = okRows.filter((r) => !S.state.enrollments
    .some((e) => e.studentId === r.studentId && e.courseId === r.course.id));

  const d = drawer("신청명단 불러오기", filename, `
    ${bad.length ? `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <div>강좌명이 매칭되지 않은 ${bad.length}건은 제외됩니다: ${esc([...new Set(bad.map((b) => b.courseTitle))].join(", "))}</div></div>` : ""}
    <dl class="dl">
      <dt>읽은 건수</dt><dd>${rows.length}건</dd>
      <dt>강좌 매칭</dt><dd>${okRows.length}건</dd>
      <dt>신규 추가</dt><dd class="strong">${news.length}건</dd>
      <dt>기존 유지</dt><dd>${okRows.length - news.length}건</dd>
    </dl>
    <div class="banner banner-info"><i data-lucide="info"></i>
      <div>신규 ${news.length}건이 <b>신청</b> 상태로 추가됩니다. 기존 건의 상태는 바뀌지 않습니다.</div></div>
    <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl"><tbody>
      ${news.slice(0, 100).map((r) => `<tr><td>${esc(r.classGroup)}</td><td class="strong">${esc(r.name)}</td>
        <td class="dim">${esc(r.studentId)}</td><td>${esc(r.course.title)}</td></tr>`).join("")
        || '<tr><td class="dim">추가할 신규 건이 없습니다.</td></tr>'}
    </tbody></table></div>
    <button class="btn btn-pri" id="applyRoster" style="width:100%;justify-content:center;margin-top:16px"
      ${news.length ? "" : "disabled"}>${news.length}건 추가하기</button>`);

  $("#applyRoster", d).onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "추가하는 중…";
    try {
      await S.bulkSet("enrollments", news.map((r) => ({
        id: `${r.studentId}__${r.course.id}`, studentId: r.studentId, courseId: r.course.id,
        term: r.course.term, year: courseYear(r.course),
        payer: r.payer, paidAt: null, status: "신청",
        startSession: 1, refund: null, source: "roster-upload",
      })));
      const newStudents = [...new Map(news.map((r) => [r.studentId,
        { id: r.studentId, name: r.name, classGroup: r.classGroup }])).values()]
        .filter((s) => !S.state.students.some((x) => x.id === s.id));
      if (newStudents.length) await S.bulkSet("students", newStudents);
      closeDrawer(); toast(`${news.length}건을 추가했습니다.`);
    } catch (err) { toast("추가하지 못했습니다: " + err.message); ev.target.disabled = false; }
  };
}

// ════════════════════════════════════════════════════════════════
// 3. 환불자 명단
// ════════════════════════════════════════════════════════════════
export function viewRefunds() {
  const rows = S.state.enrollments.filter((e) => e.status === "환불")
    .filter((e) => (!yearFilter || enrollYear(e) === yearFilter)
      && (!termFilter || e.term === termFilter))
    .map((e) => {
      const c = S.state.courses.find((x) => x.id === e.courseId);
      return { e, c, s: S.state.students.find((x) => x.id === e.studentId), amt: C.refundAmount(c, e.refund) };
    })
    .sort((a, b) => {
      const da = a.e.refund?.canceledAt || "", db2 = b.e.refund?.canceledAt || "";
      if (!da !== !db2) return da ? -1 : 1;          // 취소일 없는 건은 맨 아래로
      return da.localeCompare(db2)
        || String(a.s?.name ?? "").localeCompare(String(b.s?.name ?? ""), "ko");
    });

  const totalAmt = rows.reduce((a, r) => a + (r.amt || 0), 0);
  const full = rows.filter((r) => r.e.refund?.type === "전액").length;
  const settled = rows.filter((r) => r.e.refund?.settledAt).length;
  const pendingAmt = rows.filter((r) => !r.e.refund?.settledAt).reduce((a, r) => a + (r.amt || 0), 0);

  host().innerHTML = `
  <div class="page-head">
    <div><h1>환불자 명단</h1><p>취소일 순으로 정렬됩니다. 총 ${rows.length}건${
      rows.filter((r) => !r.e.refund?.canceledAt).length
        ? ` · 취소일 미기재 ${rows.filter((r) => !r.e.refund?.canceledAt).length}건은 아래쪽에 표시` : ""}.</p></div>
    ${filterBar(termFilter)}
  </div>
  <dl class="kpis">
    <div class="kpi alert"><dt>환불 건수</dt><dd>${rows.length}<small>건</small></dd></div>
    <div class="kpi"><dt>전액 환불</dt><dd>${full}<small>건</small></dd></div>
    <div class="kpi"><dt>처리 완료</dt><dd>${settled}<small>건</small></dd></div>
    <div class="kpi ${rows.length - settled ? "alert" : ""}"><dt>미처리</dt><dd>${rows.length - settled}<small>건</small></dd></div>
    <div class="kpi"><dt>미처리 금액</dt><dd style="font-size:19px">${C.won(pendingAmt)}</dd></div>
    <div class="kpi"><dt>환불 예상액 합계</dt><dd style="font-size:19px">${C.won(totalAmt)}</dd></div>
  </dl>
  <div class="banner banner-info"><i data-lucide="info"></i>
    <div>환불 예상액은 <b>전액</b>이면 총액 그대로, <b>N회수강</b>이면 총액에서 진행한 회차분 교습비와
    수령한 교재비를 뺀 값입니다. 실제 지급액은 원장님 결재 기준을 따르세요.</div></div>
  <section class="card"><div class="tbl-wrap">${rows.length ? `<table class="tbl">
    <thead><tr><th>처리</th><th>취소일</th><th>기수</th><th>반</th><th>학번</th><th>성명</th><th>취소 강좌</th>
      <th>환불유형</th><th>교재</th><th class="num">환불 예상액</th><th>최종환불일</th></tr></thead>
    <tbody>${rows.map(({ e, c, s, amt }) => {
      const done = !!e.refund?.settledAt;
      return `<tr${done ? ' style="opacity:.6"' : ""}>
      <td><input type="checkbox" data-settle="${esc(e.id)}" ${done ? "checked" : ""}
        aria-label="환불 처리 완료" style="width:16px;height:16px;cursor:pointer;accent-color:var(--teal)"></td>
      <td>${e.refund?.canceledAt ? C.fmt(e.refund.canceledAt) : '<span class="dim">-</span>'}</td>
      <td><span class="tag tag-peri">${esc(e.term)}</span></td>
      <td>${esc(s?.classGroup) || "-"}</td><td class="dim">${esc(e.studentId)}</td>
      <td class="strong">${esc(s?.name) || "-"}</td>
      <td>${esc(c?.title) || esc(e.courseId)}</td>
      <td>${e.refund?.type === "전액" ? '<span class="tag tag-danger">전액</span>'
        : `<span class="tag tag-warn">${esc(e.refund?.type) || "-"}</span>`}</td>
      <td>${esc(e.refund?.bookRefund) || '<span class="dim">-</span>'}</td>
      <td class="num strong">${C.won(amt)}</td>
      <td>${done ? `<span class="tag tag-ok">${C.fmt(e.refund.settledAt)}</span>`
        : '<span class="dim">미처리</span>'}</td></tr>`;
    }).join("")}</tbody></table>`
    : emptyBox("환불 건이 없습니다.", "")}
  </div></section>`;

  host().querySelectorAll("[data-settle]").forEach((cb) => cb.addEventListener("change", async () => {
    const e = S.state.enrollments.find((x) => x.id === cb.dataset.settle);
    const on = cb.checked;
    if (!on && !confirm("최종 환불일을 지웁니다. 계속할까요?")) { cb.checked = true; return; }
    try {
      await S.saveEnrollment(e.id, {
        refund: { ...(e.refund || {}), settledAt: on ? C.iso(new Date()) : null },
      });
      toast(on ? "환불 처리 완료로 기록했습니다." : "최종 환불일을 지웠습니다.");
    } catch (err) { toast("변경하지 못했습니다: " + err.message); cb.checked = !on; }
  }));
}

// ════════════════════════════════════════════════════════════════
// 4. 대기자 명단
// ════════════════════════════════════════════════════════════════
const WAIT_STATES = ["유지", "무응답", "안읽음", "취소", "배정"];
const WAIT_TAG = { 배정: "tag-ok", 취소: "tag-neutral", 유지: "tag-teal" };

/** 강의명 문자열 → 강좌 문서 (표기 흔들림 흡수) */
function findCourseByTitle(title) {
  if (!title) return null;
  const norm = (t) => String(t).replace(/\s|［.*?］|\[.*?\]/g, "");
  const key = norm(title);
  return S.state.courses.find((c) => norm(c.title) === key)
    || S.state.courses.find((c) => norm(c.title).includes(key) || key.includes(norm(c.title)))
    || null;
}

export function viewWaitlist() {
  const rows = S.state.waitlist
    .filter((w) => {
      const c = S.state.courses.find((x) => x.id === w.courseId);
      return (!yearFilter || !c || courseYear(c) === yearFilter)
        && (!termFilter || c?.term === termFilter);
    })
    .sort((a, b) => String(a.registeredAt ?? "").localeCompare(String(b.registeredAt ?? "")));
  // 현황표의 대기 KPI(calc.countsFor)와 동일 기준
  const active = rows.filter((w) => ["유지", "무응답", "안읽음"].includes(w.state));
  const courses = new Set(active.map((w) => w.courseId || w.courseTitle));

  host().innerHTML = `
  <div class="page-head">
    <div><h1>대기자 명단</h1><p>등록 순서대로 배정합니다. 대기 중 ${active.length}명 · 전체 ${rows.length}건.</p></div>
    <div class="toolbar">
      <button class="btn btn-pri" id="w-add"><i data-lucide="plus"></i>대기자 추가</button>
      <button class="btn" id="w-upload"><i data-lucide="upload"></i>명단 불러오기</button>
    </div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">${filterBar(termFilter)}</div>
  <dl class="kpis">
    <div class="kpi accent"><dt>대기 중</dt><dd>${active.length}<small>명</small></dd></div>
    <div class="kpi"><dt>대상 강좌</dt><dd>${courses.size}<small>개</small></dd></div>
    <div class="kpi"><dt>배정 완료</dt><dd>${rows.filter((w) => w.state === "배정").length}<small>명</small></dd></div>
    <div class="kpi"><dt>취소</dt><dd>${rows.filter((w) => w.state === "취소").length}<small>명</small></dd></div>
  </dl>
  <section class="card">
    <div class="card-head"><h2>전체 대기 ${rows.length}건</h2>
      <span class="sub">안내 발송일을 입력하고, 결원이 생기면 배정하세요</span></div>
    <div class="tbl-wrap">${rows.length ? `<table class="tbl">
      <thead><tr><th>등록시각</th><th>반</th><th>학번</th><th>이름</th><th>대기 강좌</th>
        <th>안내 발송</th><th>처리</th><th>비고</th><th></th></tr></thead>
      <tbody>${rows.map((w) => {
        const done = w.state === "배정";
        const opts = [...new Set([...WAIT_STATES, w.state].filter(Boolean))];
        return `<tr${done ? ' style="opacity:.6"' : ""}>
        <td class="dim">${esc(String(w.registeredAt || "").slice(0, 16)) || "-"}</td>
        <td>${esc(w.classGroup) || "-"}</td><td class="dim">${esc(w.studentId)}</td>
        <td class="strong">${esc(w.name)}</td>
        <td>${esc(w.courseTitle)}${w.courseId ? "" : ' <span class="tag tag-danger">미연결</span>'}</td>
        <td><input type="date" class="inp" style="padding:4px 8px;width:140px"
          value="${esc(w.notifiedAt || "")}" data-notify="${esc(w.id)}"></td>
        <td><select class="inp" style="padding:4px 8px" data-state="${esc(w.id)}">
          ${opts.map((s) => `<option ${w.state === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
        </select></td>
        <td class="dim">${esc(w.memo) || ""}</td>
        <td>${done
          ? `<span class="tag tag-ok">${w.assignedAt ? C.fmt(w.assignedAt) + " 배정" : "배정됨"}</span>`
          : `<button class="btn btn-sm btn-pri" data-assign="${esc(w.id)}" ${w.courseId ? "" : "disabled"}>배정</button>`}</td>
      </tr>`;
      }).join("")}</tbody></table>` : emptyBox("대기자가 없습니다.", "위 버튼으로 추가하거나 엑셀을 올리세요.")}
    </div>
  </section>`;

  $("#w-add").onclick = () => waitAddDrawer();
  $("#w-upload").onclick = openWaitUpload;

  host().querySelectorAll("[data-notify]").forEach((inp) => inp.addEventListener("change", async () => {
    await S.saveWait(inp.dataset.notify, { notifiedAt: inp.value || null });
    toast(inp.value ? "안내 발송일을 기록했습니다." : "안내 발송일을 지웠습니다.");
  }));

  host().querySelectorAll("[data-state]").forEach((sel) => sel.addEventListener("change", async () => {
    const w = S.state.waitlist.find((x) => x.id === sel.dataset.state);
    if (sel.value === "배정") {
      sel.value = w.state;                       // 배정은 확인 창을 거쳐 처리
      assignDrawer(w.id);
      return;
    }
    await S.saveWait(w.id, { state: sel.value });
    toast("처리 상태를 변경했습니다.");
  }));

  host().querySelectorAll("[data-assign]").forEach((b) =>
    b.addEventListener("click", () => assignDrawer(b.dataset.assign)));
}

/** 대기자 → 명단 배정 확인 창 */
function assignDrawer(waitId) {
  const w = S.state.waitlist.find((x) => x.id === waitId);
  const c = S.state.courses.find((x) => x.id === w.courseId);
  const dup = S.state.enrollments.find((e) => e.studentId === w.studentId && e.courseId === w.courseId);

  const d = drawer("대기자 배정", `${w.name} · ${c?.title || w.courseTitle}`, `
    ${dup ? `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <div>이미 이 강좌에 <b>${esc(C.normStatus(dup.status))}</b> 상태로 등록된 학생입니다. 진행하면 덮어써집니다.</div></div>` : ""}
    <dl class="dl">
      <dt>학번</dt><dd>${esc(w.studentId)}</dd>
      <dt>반</dt><dd>${esc(w.classGroup) || "-"}</dd>
      <dt>기수</dt><dd>${esc(c?.term) || "-"}</dd>
      <dt>과목</dt><dd>${esc(c?.subject) || "-"}</dd>
      <dt>요일·시간</dt><dd>${esc([c?.day1, c?.time1].filter(Boolean).join(" ")) || "-"}</dd>
      <dt>수강료</dt><dd>${C.won(c?.fee?.total)}</dd>
    </dl>
    <label class="field"><span>시작 회차</span>
      <select class="inp" id="w-start" style="width:100%"></select>
      <span id="w-startinfo" style="display:block;font-size:12px;color:var(--muted);margin-top:5px"></span></label>
    <label class="field"><span>상태</span>
      <select class="inp" id="w-status" style="width:100%">
        <option value="신청">신청 (결제 전)</option><option value="수강">수강 (결제 완료)</option>
      </select></label>
    <button class="btn btn-pri" id="w-go" style="width:100%;justify-content:center;margin-top:6px">명단으로 배정</button>
    <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
      배정하면 특강학생명단에 추가되고, 대기 상태는 '배정'으로 바뀝니다.</p>`);

  const sel = $("#w-start", d), info = $("#w-startinfo", d);
  const list = c?.sessions || [];
  if (!list.length) {
    sel.innerHTML = '<option value="1">1회차</option>';
    info.textContent = "회차 정보가 없는 강좌입니다.";
  } else {
    const today = C.iso(new Date());
    const next = list.find((x) => !x.canceled && x.date >= today) || list[0];
    sel.innerHTML = list.map((x) => `<option value="${x.no}" ${x.no === next.no ? "selected" : ""}>
      ${x.no}회차 · ${C.fmt(x.date)}${x.canceled ? " (휴강)" : ""}</option>`).join("");
    info.textContent = `오늘 기준 다음 수업은 ${next.no}회차입니다. 남은 수업 ${
      list.filter((x) => !x.canceled && x.no >= next.no).length}회.`;
  }

  $("#w-go", d).onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "배정 중…";
    try {
      await S.assignWait({ ...w, term: c?.term || null }, {
        courseId: w.courseId,
        startSession: Number(sel.value) || 1,
        status: $("#w-status", d).value,
      });
      closeDrawer();
      toast(`${w.name} 학생을 명단으로 배정했습니다.`);
    } catch (err) {
      toast("배정하지 못했습니다: " + err.message);
      ev.target.disabled = false; ev.target.textContent = "명단으로 배정";
    }
  };
}

/** 대기자 직접 추가 */
function waitAddDrawer() {
  const courses = S.state.courses
    .filter((c) => !yearFilter || courseYear(c) === yearFilter)
    .sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term));
  const now = new Date();
  const localNow = `${C.iso(now)}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const d = drawer("대기자 추가", "결원 발생 시 등록 순서대로 배정됩니다", `
    <label class="field"><span>대기 강좌</span>
      <select class="inp" id="n-course" style="width:100%">
        <option value="">— 선택 —</option>
        ${courses.map((c) => `<option value="${esc(c.id)}">[${esc(c.term)}] ${esc(c.title)}</option>`).join("")}
      </select></label>
    <label class="field"><span>등록시각</span>
      <input class="inp" type="datetime-local" id="n-at" value="${localNow}" style="width:100%"></label>
    <label class="field"><span>학번</span>
      <input class="inp" id="n-sid" style="width:100%" inputmode="numeric" autocomplete="off"></label>
    <div id="n-who" style="margin:-6px 0 14px;font-size:13px"></div>
    <label class="field"><span>이름</span><input class="inp" id="n-name" style="width:100%" autocomplete="off"></label>
    <label class="field"><span>반</span><input class="inp" id="n-class" style="width:100%" autocomplete="off"></label>
    <label class="field"><span>비고</span><input class="inp" id="n-memo" style="width:100%" autocomplete="off"></label>
    <button class="btn btn-pri" id="n-go" style="width:100%;justify-content:center">추가하기</button>
    <div id="n-log" style="margin-top:16px;font-size:13px;color:var(--muted)"></div>`);

  const el = (s) => $(s, d);
  const added = [];
  el("#n-sid").addEventListener("input", () => {
    const st = S.state.students.find((x) => x.id === el("#n-sid").value.trim());
    el("#n-who").innerHTML = st
      ? `<span class="tag tag-teal">${esc(st.name || "")}</span> <span class="dim" style="margin-left:6px">${esc(st.classGroup) || "-"}반</span>`
      : "";
    if (st) { el("#n-name").value = st.name || ""; el("#n-class").value = st.classGroup || ""; }
  });

  el("#n-go").onclick = async (ev) => {
    const cid = el("#n-course").value, sid = el("#n-sid").value.trim(), name = el("#n-name").value.trim();
    if (!cid) return toast("대기 강좌를 선택하세요.");
    if (!sid) return toast("학번을 입력하세요.");
    if (!name) return toast("이름을 입력하세요.");
    const c = S.state.courses.find((x) => x.id === cid);
    ev.target.disabled = true; ev.target.textContent = "추가하는 중…";
    try {
      await S.saveWait(`${sid}__${cid}`, {
        id: `${sid}__${cid}`, studentId: sid, name,
        classGroup: el("#n-class").value.trim() || null,
        courseId: cid, courseTitle: c.title,
        registeredAt: (el("#n-at").value || "").replace("T", " "),
        notifiedAt: null, state: "유지",
        memo: el("#n-memo").value.trim() || null, source: "manual",
      });
      added.unshift(`${name} · ${c.title}`);
      el("#n-log").innerHTML = `<b style="color:var(--ok)">추가 ${added.length}건</b><br>`
        + added.slice(0, 6).map((t) => esc(t)).join("<br>");
      ["#n-sid", "#n-name", "#n-class", "#n-memo"].forEach((s) => { el(s).value = ""; });
      el("#n-who").innerHTML = ""; el("#n-sid").focus();
      toast(`${name} 학생을 대기자로 추가했습니다.`);
    } catch (err) {
      toast("추가하지 못했습니다: " + err.message);
    } finally {
      ev.target.disabled = false; ev.target.textContent = "추가하기";
    }
  };
  el("#n-sid").focus();
}

/** 대기자 명단 엑셀 업로드 */
function openWaitUpload() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".xlsx,.xls";
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      const XLSX = await loadSheetJs();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
      const hi = grid.findIndex((r) => (r || []).some((c) => String(c).trim() === "학번"));
      if (hi < 0) throw new Error("'학번' 헤더를 찾을 수 없습니다. 대기자 접수 명단 양식인지 확인하세요.");
      const head = grid[hi].map((x) => String(x ?? "").trim());
      const col = (n) => head.indexOf(n);
      const parsed = [];
      for (let r = hi + 1; r < grid.length; r++) {
        const row = grid[r] || [];
        const sid = String(row[col("학번")] ?? "").trim();
        if (!sid) continue;
        const title = String(row[col("특강명")] ?? "").trim();
        parsed.push({
          studentId: sid,
          name: String(row[col("이름")] ?? "").trim(),
          classGroup: String(row[col("반")] ?? "").trim() || null,
          season: col("과정") >= 0 ? String(row[col("과정")] ?? "").trim() || null : null,
          registeredAt: String(row[col("등록시간")] ?? "").trim().slice(0, 16),
          courseTitle: title,
          course: findCourseByTitle(title),
        });
      }
      previewWaitUpload(parsed, file.name);
    } catch (err) { toast(err.message); }
  };
  inp.click();
}

function previewWaitUpload(parsed, filename) {
  const ok = parsed.filter((p) => p.course);
  const bad = parsed.filter((p) => !p.course);
  const news = ok.filter((p) => !S.state.waitlist.some((w) => w.studentId === p.studentId && w.courseId === p.course.id));

  const d = drawer("대기자 명단 불러오기", filename, `
    ${bad.length ? `<div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <div>강좌명이 매칭되지 않은 ${bad.length}건은 제외됩니다: ${esc([...new Set(bad.map((b) => b.courseTitle))].join(", "))}</div></div>` : ""}
    <dl class="dl">
      <dt>읽은 건수</dt><dd>${parsed.length}건</dd>
      <dt>강좌 매칭</dt><dd>${ok.length}건</dd>
      <dt>신규 추가</dt><dd class="strong">${news.length}건</dd>
      <dt>이미 등록</dt><dd>${ok.length - news.length}건</dd>
    </dl>
    <div class="tbl-wrap" style="max-height:260px;overflow:auto"><table class="tbl"><tbody>
      ${news.slice(0, 100).map((p) => `<tr><td>${esc(p.classGroup)}</td><td class="strong">${esc(p.name)}</td>
        <td class="dim">${esc(p.studentId)}</td><td>${esc(p.course.title)}</td></tr>`).join("")
        || '<tr><td class="dim">추가할 신규 건이 없습니다.</td></tr>'}
    </tbody></table></div>
    <button class="btn btn-pri" id="w-apply" style="width:100%;justify-content:center;margin-top:16px"
      ${news.length ? "" : "disabled"}>${news.length}건 추가하기</button>`);

  $("#w-apply", d).onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "추가하는 중…";
    try {
      await S.bulkSet("waitlist", news.map((p) => ({
        id: `${p.studentId}__${p.course.id}`, studentId: p.studentId, name: p.name,
        classGroup: p.classGroup, season: p.season,
        courseId: p.course.id, courseTitle: p.course.title,
        registeredAt: p.registeredAt || null, notifiedAt: null,
        state: "유지", memo: null, source: "excel-upload",
      })));
      closeDrawer(); toast(`${news.length}건을 추가했습니다.`);
    } catch (err) { toast("추가하지 못했습니다: " + err.message); ev.target.disabled = false; }
  };
}

// ════════════════════════════════════════════════════════════════
// 5. 수업계획 및 신청일정 (달력)
// ════════════════════════════════════════════════════════════════
const EV_CATS = {
  신청: "ev-apply", 계획서: "ev-plan", 청구: "ev-bill",
  개강: "ev-open", 휴가: "ev-vac", 기타: "ev-etc",
};
function guessCat(label) {
  const t = String(label || "");
  if (/신청/.test(t)) return "신청";
  if (/계획서|원고|게시/.test(t)) return "계획서";
  if (/청구/.test(t)) return "청구";
  if (/개강|종강/.test(t)) return "개강";
  if (/휴가|출발|복귀|더프/.test(t)) return "휴가";
  return "기타";
}
const catOf = (ev) => (EV_CATS[ev.cat] ? ev.cat : guessCat(ev.label));

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth() + 1;   // 1~12

const eventsOf = (year) => (S.state.schedule?.[String(year)] || []).slice();
const saveYear = (year, list) => S.saveConfig("schedule", {
  [String(year)]: list.slice().sort((a, b) => a.date.localeCompare(b.date)),
});

/** 기간 일정을 날짜별로 펼침. 반환: { 날짜: [{ev, idx, isStart}] } */
function expandByDate(list) {
  const map = {};
  list.forEach((ev, idx) => {
    if (!ev.date) return;
    const end = ev.end && ev.end >= ev.date ? ev.end : ev.date;
    let cur = C.parse(ev.date), guard = 0;
    while (C.iso(cur) <= end && guard++ < 400) {
      const key = C.iso(cur);
      (map[key] ||= []).push({ ev, idx, isStart: key === ev.date });
      cur.setDate(cur.getDate() + 1);
    }
  });
  return map;
}

const rangeText = (ev) => (ev.end && ev.end !== ev.date
  ? `${C.fmt(ev.date)} ~ ${C.fmt(ev.end)}` : C.fmt(ev.date));

export function viewSchedule() {
  const years = Object.keys(S.state.schedule || {}).sort();
  const today = C.iso(new Date());
  const items = eventsOf(calYear);
  const byDate = expandByDate(items);

  // 달력 셀 구성 (일요일 시작)
  const first = new Date(calYear, calMonth - 1, 1);
  const startIdx = first.getDay();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(calYear, calMonth - 1, 1 - startIdx + i);
    cells.push({ date: C.iso(d), out: d.getMonth() !== calMonth - 1, dow: d.getDay() });
    if (i >= 34 && d.getMonth() !== calMonth - 1 && (i + 1) % 7 === 0) break;
  }
  const mPrefix = `${calYear}-${String(calMonth).padStart(2, "0")}`;
  const overlaps = (e, prefix) => {
    const end = e.end && e.end >= e.date ? e.end : e.date;
    return e.date.slice(0, 7) <= prefix && end.slice(0, 7) >= prefix;
  };
  const monthItems = items.filter((e) => overlaps(e, mPrefix));
  const prevYearSame = eventsOf(calYear - 1)
    .filter((e) => overlaps(e, `${calYear - 1}-${String(calMonth).padStart(2, "0")}`));
  const next = items.find((e) => e.date >= today);

  host().innerHTML = `
  <div class="page-head">
    <div><h1>수업계획 및 신청일정</h1>
      <p>날짜를 누르면 일정을 추가·수정할 수 있습니다. 여러 날에 걸친 일정은 종료일을 넣으세요.${
        next ? ` 다음 일정: <b>${esc(next.label)}</b> ${C.fmt(next.date)} ${C.dday(next.date, today) || ""}` : ""}</p></div>
    <div class="toolbar">
      <div class="cal-nav">
        <button class="btn btn-sm" id="c-prev" aria-label="이전 달"><i data-lucide="chevron-left"></i></button>
        <b>${calYear}년 ${calMonth}월</b>
        <button class="btn btn-sm" id="c-next" aria-label="다음 달"><i data-lucide="chevron-right"></i></button>
      </div>
      <button class="btn btn-sm" id="c-today">오늘</button>
      <select class="inp" id="c-year" style="padding:6px 10px">
        ${[...new Set([...years, String(calYear)])].sort().map((y) =>
          `<option ${String(calYear) === y ? "selected" : ""}>${y}</option>`).join("")}
      </select>
    </div>
  </div>
  <div class="legend">
    ${Object.entries(EV_CATS).map(([k, cls]) => `<span class="ev ${cls}" style="display:inline-block;width:auto;margin:0">${k}</span>`).join("")}
  </div>
  <div class="cal">
    ${["일", "월", "화", "수", "목", "금", "토"].map((d, i) =>
      `<div class="cal-h ${i === 0 ? "sun" : i === 6 ? "sat" : ""}">${d}</div>`).join("")}
    ${cells.map((c) => {
      const evs = byDate[c.date] || [];
      return `<div class="cal-c ${c.out ? "out" : ""} ${c.date === today ? "today" : ""}" data-day="${c.date}">
        <div class="cal-d ${c.dow === 0 ? "sun" : c.dow === 6 ? "sat" : ""}">${+c.date.slice(8, 10)}</div>
        ${evs.map(({ ev, isStart }) => {
          // 시작일 또는 주의 첫날에만 제목을 쓰고, 나머지 날은 색 띠로 이어 표시
          const showLabel = isStart || c.dow === 0;
          const span = ev.end && ev.end !== ev.date;
          return showLabel
            ? `<button class="ev ${EV_CATS[catOf(ev)]}" data-ev="${c.date}"
                 title="${esc(ev.label)} · ${esc(rangeText(ev))}">${span && !isStart ? "↳ " : ""}${esc(ev.label)}</button>`
            : `<button class="ev ${EV_CATS[catOf(ev)]}" data-ev="${c.date}" aria-label="${esc(ev.label)} 계속"
                 title="${esc(ev.label)} · ${esc(rangeText(ev))}" style="height:7px;padding:0"></button>`;
        }).join("")}
      </div>`;
    }).join("")}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
    <section class="card card-pad">
      <h2 style="font-size:13px;margin:0 0 10px">${calYear}년 ${calMonth}월 일정 ${monthItems.length}건</h2>
      ${monthItems.length ? monthItems.map((e) => `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0">
        <span class="tl-date" style="min-width:112px">${rangeText(e)}</span>
        <span style="font-weight:600;font-size:13px">${esc(e.label)}</span></div>`).join("")
        : '<p style="color:var(--muted);margin:0;font-size:13px">등록된 일정이 없습니다.</p>'}
    </section>
    <section class="card card-pad">
      <h2 style="font-size:13px;margin:0 0 10px">${calYear - 1}년 ${calMonth}월 (전년 비교)</h2>
      ${prevYearSame.length ? prevYearSame.map((e) => `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;opacity:.75">
        <span class="tl-date" style="min-width:112px">${rangeText(e)}</span>
        <span style="font-weight:600;font-size:13px">${esc(e.label)}</span></div>`).join("")
        : '<p style="color:var(--muted);margin:0;font-size:13px">전년 기록이 없습니다.</p>'}
    </section>
  </div>`;

  const move = (delta) => {
    let m = calMonth + delta, y = calYear;
    if (m > 12) { m = 1; y++; } if (m < 1) { m = 12; y--; }
    calMonth = m; calYear = y; render("schedule");
  };
  $("#c-prev").onclick = () => move(-1);
  $("#c-next").onclick = () => move(1);
  $("#c-today").onclick = () => {
    const n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth() + 1; render("schedule");
  };
  $("#c-year").onchange = (ev) => { calYear = Number(ev.target.value); render("schedule"); };

  host().querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    dayDrawer(b.dataset.ev.split("|")[0]);
  }));
  host().querySelectorAll("[data-day]").forEach((c) =>
    c.addEventListener("click", () => dayDrawer(c.dataset.day)));
}

/** 날짜별 일정 편집 */
function dayDrawer(date) {
  const year = Number(date.slice(0, 4));
  const list = eventsOf(year);
  const mine = list.map((e, i) => ({ e, i })).filter(({ e }) => {
    const end = e.end && e.end >= e.date ? e.end : e.date;
    return e.date <= date && date <= end;
  });

  const d = drawer(`${C.fmt(date)} 일정`, `${year}년 · 이 날 포함 ${mine.length}건`, `
    <div id="d-list" style="margin-bottom:18px">
      ${mine.length ? mine.map(({ e, i }) => `<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line-s)">
        <span class="ev ${EV_CATS[catOf(e)]}" style="display:inline-block;width:auto;margin:0;flex:none">${esc(catOf(e))}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${esc(e.label)}</div>
          ${e.end && e.end !== e.date ? `<div class="dim" style="font-size:11px">${esc(rangeText(e))}</div>` : ""}
        </div>
        <button class="btn btn-sm" data-edit="${i}">수정</button>
        <button class="btn btn-sm btn-danger" data-del="${i}">삭제</button>
      </div>`).join("")
      : '<p style="color:var(--muted);margin:0;font-size:13px">등록된 일정이 없습니다.</p>'}
    </div>

    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px" id="d-formtitle">일정 추가</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label class="field" style="margin:0"><span>시작일</span>
        <input class="inp" type="date" id="d-date" value="${date}" style="width:100%"></label>
      <label class="field" style="margin:0"><span>종료일 (선택)</span>
        <input class="inp" type="date" id="d-end" style="width:100%"></label>
    </div>
    <p id="d-span" style="font-size:12px;color:var(--muted);margin:6px 0 14px">하루 일정입니다. 여러 날에 걸치면 종료일을 넣으세요.</p>
    <label class="field"><span>내용</span>
      <input class="inp" id="d-label" style="width:100%" placeholder="예: 1차 신청 마감" autocomplete="off"></label>
    <label class="field"><span>분류</span>
      <select class="inp" id="d-cat" style="width:100%">
        ${Object.keys(EV_CATS).map((k) => `<option>${k}</option>`).join("")}
      </select></label>
    <button class="btn btn-pri" id="d-save" style="width:100%;justify-content:center">추가하기</button>`);

  let editIdx = null;
  const el = (s) => $(s, d);

  const paintSpan = () => {
    const a = el("#d-date").value, b = el("#d-end").value;
    const info = el("#d-span");
    if (!b || b === a) { info.textContent = "하루 일정입니다. 여러 날에 걸치면 종료일을 넣으세요."; return; }
    if (b < a) { info.innerHTML = '<span style="color:var(--danger)">종료일이 시작일보다 앞섭니다.</span>'; return; }
    const days = Math.round((C.parse(b) - C.parse(a)) / 86400000) + 1;
    info.textContent = `${C.fmt(a)} ~ ${C.fmt(b)} · ${days}일 일정`;
  };
  el("#d-date").addEventListener("change", paintSpan);
  el("#d-end").addEventListener("change", paintSpan);

  el("#d-label").addEventListener("input", () => {
    if (editIdx === null) el("#d-cat").value = guessCat(el("#d-label").value);
  });

  d.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    editIdx = Number(b.dataset.edit);
    const e = list[editIdx];
    el("#d-date").value = e.date;
    el("#d-end").value = e.end && e.end !== e.date ? e.end : "";
    el("#d-label").value = e.label;
    el("#d-cat").value = catOf(e);
    el("#d-formtitle").textContent = "일정 수정";
    el("#d-save").textContent = "수정 저장";
    paintSpan();
    el("#d-label").focus();
  }));

  d.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const i = Number(b.dataset.del);
    if (!confirm(`'${list[i].label}' 일정을 삭제합니다. 계속할까요?`)) return;
    try {
      await saveYear(year, list.filter((_, k) => k !== i));
      closeDrawer(); toast("일정을 삭제했습니다.");
    } catch (err) { toast("삭제하지 못했습니다: " + err.message); }
  }));

  el("#d-save").onclick = async (ev) => {
    const newDate = el("#d-date").value;
    const endRaw = el("#d-end").value;
    const label = el("#d-label").value.trim();
    if (!newDate) return toast("시작일을 선택하세요.");
    if (!label) return toast("내용을 입력하세요.");
    if (endRaw && endRaw < newDate) return toast("종료일이 시작일보다 앞섭니다.");
    const rec = { date: newDate, label, cat: el("#d-cat").value };
    if (endRaw && endRaw !== newDate) rec.end = endRaw;

    ev.target.disabled = true; ev.target.textContent = "저장 중…";
    try {
      const newYear = Number(newDate.slice(0, 4));
      if (editIdx !== null && newYear !== year) {
        await saveYear(year, list.filter((_, k) => k !== editIdx));
        await saveYear(newYear, [...eventsOf(newYear), rec]);
      } else if (editIdx !== null) {
        await saveYear(year, list.map((e, k) => (k === editIdx ? rec : e)));
      } else {
        await saveYear(newYear, [...eventsOf(newYear), rec]);
      }
      closeDrawer();
      toast(editIdx !== null ? "일정을 수정했습니다." : "일정을 추가했습니다.");
    } catch (err) {
      toast("저장하지 못했습니다: " + err.message);
      ev.target.disabled = false; ev.target.textContent = editIdx !== null ? "수정 저장" : "추가하기";
    }
  };
  el("#d-label").focus();
}

// ════════════════════════════════════════════════════════════════
// 6. 수업일 계산 (주간 매트릭스 · 직접 색칠)
// ════════════════════════════════════════════════════════════════
const BLOCKS = [
  { key: "A", from: 3, to: 7, title: "3월 ~ 7월" },
  { key: "B", from: 8, to: 11, title: "8월 ~ 11월" },
];
const STATUS_BRUSH = ["모의고사", "정기휴가", "휴강", "미운영"];
const STATUS_CLASS = { 모의고사: "s-mock", 정기휴가: "s-vac", 휴강: "s-off", 미운영: "s-none" };

let calYearSel = new Date().getFullYear();
let calBrush = null;             // null이면 보기 전용
let calEdits = {};               // 저장 전 임시 변경 { 날짜: 값 | null }

const yearData = (y) => (S.state.calendars || {})[String(y)] || {};
const storedCells = (y) => yearData(y).cells || {};
const cellVal = (y, date) => (
  Object.prototype.hasOwnProperty.call(calEdits, date) ? calEdits[date] : storedCells(y)[date]
);
const termClass = (v) => `t${Math.max(TERMS.indexOf(v), 0)}`;
const valClass = (v) => (!v ? "s-empty" : STATUS_CLASS[v] || termClass(v));

export function viewCalc() {
  const cal = S.state.calendars || {};
  const years = Object.keys(cal).filter((k) => /^\d{4}$/.test(k)).sort();
  const legacy = !years.length && Object.keys(cal).length > 0;
  const y = calYearSel;
  const today = C.iso(new Date());
  const notes = yearData(y).cellNotes || {};
  const dirty = Object.keys(calEdits).length;

  const brushBtn = (v, label) => {
    const cls = valClass(v);
    return `<button class="${cls} ${calBrush === v ? "on" : ""}" data-brush="${esc(v ?? "")}">${esc(label)}</button>`;
  };

  const renderBlock = (b) => {
    const weeks = C.weeksOfRange(y, b.from, b.to);
    const usedTerms = new Set();
    const counts = {};

    const body = C.DAYS.map((dow, di) => {
      const tds = weeks.map((w) => {
        const date = w.dates[dow];
        const v = cellVal(y, date);
        if (v && TERMS.includes(v)) {
          usedTerms.add(v);
          counts[v] = counts[v] || {};
          (counts[v][dow] = counts[v][dow] || []).push(date);
        }
        const note = notes[date];
        return `<td class="${valClass(v)} ${date === today ? "mx-today" : ""} ${calBrush !== null ? "mx-paint" : ""}"
          data-d="${date}" title="${C.fmt(date)}${v ? " · " + esc(v) : ""}${note ? " · " + esc(note) : ""}">
          ${+date.slice(5, 7)}/${+date.slice(8, 10)}
          ${note ? `<span class="mx-note">${esc(note.replace(/\s*\d{1,2}:\d{2}.*$/, ""))}</span>` : ""}
        </td>`;
      }).join("");
      return { di, dow, tds };
    });

    const terms = TERMS.filter((t) => usedTerms.has(t));
    const rows = body.map(({ di, dow, tds }) => `<tr>
      <td class="dow ${di === 6 ? "sun" : di === 5 ? "sat" : ""}">${dow}</td>
      ${tds}
      ${terms.map((t) => {
        const list = counts[t]?.[dow] || [];
        return `<td class="cnt ${termClass(t)}" title="${esc(t)} ${dow}요일 ${list.length}회 — ${
          list.map((d) => C.fmt(d)).join(", ") || "없음"}">${list.length}회</td>`;
      }).join("")}
    </tr>`).join("");

    // 주차를 '월' 단위로 묶은 헤더 (기수가 아니라 주차 기준)
    const monthRuns = [];
    weeks.forEach((w) => {
      const m = w.label.split("월")[0] + "월";
      const last = monthRuns[monthRuns.length - 1];
      if (last && last.m === m) last.span++;
      else monthRuns.push({ m, span: 1 });
    });
    const head = `<tr><th class="dow" rowspan="2">요일</th>
        ${monthRuns.map((r) => `<th class="mth" colspan="${r.span}">${esc(r.m)}</th>`).join("")}
        ${terms.map((t) => `<th class="${termClass(t)}" rowspan="2">${esc(t)}<br>회차</th>`).join("")}
      </tr><tr>${weeks.map((w) => `<th>${esc(w.short.split(" ")[1])}</th>`).join("")}</tr>`;

    const dates = (kind) => Object.entries({ ...storedCells(y), ...calEdits })
      .filter(([d, v]) => v === kind && d >= C.iso(new Date(y, b.from - 1, 1))
        && d <= C.iso(new Date(y, b.to, 0)))
      .map(([d]) => d).sort();

    return `<section style="margin-bottom:24px">
      <h2 style="font-size:14px;font-weight:800;letter-spacing:-.02em;margin:0 0 8px">
        ${esc(b.title)} <span style="font-weight:600;color:var(--muted);font-size:12px">· ${weeks.length}주</span></h2>
      <div class="mx-wrap"><table class="mx">
        <thead>${head}</thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="card card-pad" style="margin-top:10px">
        <h3 style="font-size:12px;color:var(--muted);margin:0 0 8px">비고</h3>
        ${[["모의고사", "s-mock"], ["정기휴가", "s-vac"], ["휴강", "s-off"]].map(([k, cls]) => {
          const list = dates(k);
          return `<div style="display:flex;gap:8px;align-items:baseline;padding:3px 0;font-size:12px">
            <span class="ev ${cls}" style="display:inline-block;width:auto;margin:0;flex:none;min-width:58px;text-align:center">${k}</span>
            <span>${list.length ? list.map((d) => C.fmt(d)).join(", ") : '<span class="dim">없음</span>'}</span>
          </div>`;
        }).join("")}
      </div>
    </section>`;
  };

  host().innerHTML = `
  <div class="print-title">${y}년 수업일 계산 · 강남대성기숙 QUETTA</div>
  <div class="page-head">
    <div><h1>수업일 계산</h1>
      <p>주차별 수업 가능일과 모의고사·휴가·휴강을 한눈에 봅니다. 색칠 도구를 고르면 날짜를 직접 지정할 수 있습니다.</p></div>
    <div class="toolbar">
      <button class="btn" id="cal-fee"><i data-lucide="calculator"></i>교습비 계산</button>
      <button class="btn" id="cal-pdf"><i data-lucide="printer"></i>PDF 저장</button>
    </div>
  </div>

  ${legacy ? `<div class="banner banner-warn no-print"><i data-lucide="alert-triangle"></i>
    <div>예전 형식의 일정 데이터가 남아 있습니다. 아래 표에서 직접 색칠하면 새 형식으로 저장됩니다.</div></div>` : ""}

  <div class="card card-pad no-print" style="margin-bottom:16px">
    <div class="brush">
      <span style="font-size:12px;font-weight:700;color:var(--muted);margin-right:4px">색칠</span>
      <button class="${calBrush === null ? "on" : ""}" data-brush="__off"
        style="background:var(--line-s);color:var(--muted)">보기 전용</button>
      ${TERMS.map((t) => brushBtn(t, t)).join("")}
      ${STATUS_BRUSH.map((v) => brushBtn(v, v)).join("")}
      <button class="s-empty ${calBrush === "" ? "on" : ""}" data-brush=""
        style="border:1px dashed var(--line)">지우기</button>
      <span style="flex:1"></span>
      ${dirty ? `<span class="tag tag-warn">저장 안 됨 ${dirty}칸</span>
        <button class="btn btn-sm" id="cal-undo">되돌리기</button>
        <button class="btn btn-sm btn-pri" id="cal-save">저장</button>` : ""}
    </div>
  </div>

  <div id="cal-print">${BLOCKS.map(renderBlock).join("")}</div>

  <section class="card card-pad no-print">
    <h3 style="font-size:12px;color:var(--muted);margin:0 0 8px">메모</h3>
    <textarea class="memo" id="cal-memo" placeholder="시험 일정, 방학 등 참고 사항">${esc(yearData(y).note || "")}</textarea>
    <button class="btn btn-sm no-print" id="cal-memo-save" style="margin-top:8px">메모 저장</button>
  </section>`;

  // ── 이벤트 ──
  $("#cal-fee").onclick = feeDrawer;
  $("#cal-pdf").onclick = () => window.print();

  host().querySelectorAll("[data-brush]").forEach((b) => b.addEventListener("click", () => {
    const v = b.dataset.brush;
    calBrush = v === "__off" ? null : v;
    render("calc");
  }));

  if (calBrush !== null) {
    host().querySelectorAll("td[data-d]").forEach((td) => {
      const apply = () => {
        const date = td.dataset.d;
        calEdits[date] = calBrush === "" ? null : calBrush;
        td.className = `${valClass(calEdits[date])} ${date === C.iso(new Date()) ? "mx-today" : ""} mx-paint`;
        const tag = host().querySelector(".brush .tag");
        if (tag) tag.textContent = `저장 안 됨 ${Object.keys(calEdits).length}칸`;
        else render("calc");
      };
      td.addEventListener("mousedown", (e) => { e.preventDefault(); apply(); });
      td.addEventListener("mouseenter", (e) => { if (e.buttons === 1) apply(); });
    });
  }

  if ($("#cal-save")) {
    $("#cal-save").onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = "저장 중…";
      try {
        const next = { ...storedCells(y) };
        Object.entries(calEdits).forEach(([d, v]) => { if (v) next[d] = v; else delete next[d]; });
        await S.saveConfig("calendars", {
          [String(y)]: { ...yearData(y), cells: Object.fromEntries(Object.entries(next).sort()) },
        });
        calEdits = {}; toast("일정을 저장했습니다.");
      } catch (e) {
        toast("저장하지 못했습니다: " + e.message);
        ev.target.disabled = false; ev.target.textContent = "저장";
      }
    };
    $("#cal-undo").onclick = () => { calEdits = {}; render("calc"); };
  }

  $("#cal-memo-save").onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      await S.saveConfig("calendars", { [String(y)]: { ...yearData(y), note: $("#cal-memo").value } });
      toast("메모를 저장했습니다.");
    } catch (e) { toast("저장하지 못했습니다: " + e.message); }
    finally { ev.target.disabled = false; }
  };
}

/** 교습비 계산 */
function feeDrawer() {
  const y = calYearSel;
  const cells = { ...storedCells(y), ...calEdits };
  const t0 = TERMS.includes(currentTerm()) ? currentTerm() : TERMS[1];

  const d = drawer("교습비 계산", "196원 × 수업시간(분) × 회차", `
    <label class="field"><span>기수</span>
      <select class="inp" id="f-term" style="width:100%">
        ${TERMS.map((t) => `<option ${t === t0 ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>
    <label class="field"><span>요일</span>
      <select class="inp" id="f-day" style="width:100%">
        ${C.DAYS.map((x) => `<option>${x}</option>`).join("")}
      </select></label>
    <label class="field"><span>회차</span>
      <input class="inp" type="number" id="f-cnt" min="1" max="30" style="width:100%">
      <span id="f-src" style="display:block;font-size:12px;color:var(--muted);margin-top:5px"></span></label>
    <label class="field"><span>1회 수업시간 (분)</span>
      <input class="inp" type="number" id="f-min" min="10" step="10" value="170" style="width:100%"></label>
    <label class="field"><span>교재비 (원)</span>
      <input class="inp" type="number" id="f-book" min="0" step="1000" value="0" style="width:100%"></label>
    <dl class="dl" style="margin-top:18px">
      <dt>교습비</dt><dd class="strong" id="f-tui">-</dd>
      <dt>총액</dt><dd class="strong" id="f-tot" style="font-size:17px;color:var(--teal-d)">-</dd>
    </dl>`);

  const el = (s) => $(s, d);
  const autoCount = () => {
    const t = el("#f-term").value, dow = el("#f-day").value;
    const n = Object.entries(cells).filter(([date, v]) =>
      v === t && C.dayName(date) === dow).length;
    el("#f-cnt").value = n || 8;
    el("#f-src").textContent = n ? `${y}년 일정표 집계 ${n}회` : "색칠된 날짜가 없어 직접 입력하세요.";
    paint();
  };
  const paint = () => {
    const tui = C.tuitionOf(Number(el("#f-min").value), Number(el("#f-cnt").value));
    el("#f-tui").textContent = C.won(tui);
    el("#f-tot").textContent = C.won((tui || 0) + Number(el("#f-book").value || 0));
  };
  ["#f-term", "#f-day"].forEach((s) => el(s).addEventListener("change", autoCount));
  ["#f-cnt", "#f-min", "#f-book"].forEach((s) => el(s).addEventListener("input", paint));
  autoCount();
}

// ════════════════════════════════════════════════════════════════
// 데이터 관리 — 전체 백업 · 삭제
// ════════════════════════════════════════════════════════════════
export function dataDrawer() {
  const scopeYears = allYears();

  const d = drawer("데이터 관리", "백업을 먼저 받은 뒤 삭제하세요", `
    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px">1. 전체 백업</h4>
    <label class="field"><span>범위</span>
      <select class="inp" id="bk-scope" style="width:100%">
        ${scopeYears.map((y) => `<option value="${y}" ${y === yearFilter ? "selected" : ""}>${y}년만</option>`).join("")}
        <option value="all">전체 연도</option>
      </select></label>
    <button class="btn btn-pri" id="bk-go" style="width:100%;justify-content:center">
      <i data-lucide="download"></i>엑셀로 백업 받기</button>
    <p style="font-size:12px;color:var(--muted);margin:8px 0 22px">
      현황표 · 학생명단 · 환불명단 · 대기자 · 학생정보 · 수업일 · 일정을 시트별로 담은 파일 하나가 받아집니다.</p>

    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px;padding-top:16px;border-top:1px solid var(--line-s)">
      2. 학생 정보 삭제</h4>
    <label class="field"><span>범위</span>
      <select class="inp" id="del-scope" style="width:100%">
        ${scopeYears.map((y) => `<option value="${y}" ${y === yearFilter ? "selected" : ""}>${y}년만</option>`).join("")}
        <option value="all">전체 연도</option>
      </select></label>
    <div id="del-plan" class="log" style="font-size:13px;margin-bottom:14px"></div>
    <div class="banner banner-info"><i data-lucide="info"></i>
      <div><b>현황표는 남습니다.</b> 삭제 직전에 강좌별 인원·수강·신청·취소·환불 최종 집계를
      강좌에 새겨두므로, 지난해 수강 현황을 계속 확인할 수 있습니다.</div></div>
    <div class="banner banner-warn"><i data-lucide="alert-triangle"></i>
      <div><b>되돌릴 수 없습니다.</b> 백업 파일을 먼저 열어 내용이 제대로 담겼는지 확인하세요.</div></div>
    <label class="field"><span>확인 문구 — <b>삭제합니다</b> 를 그대로 입력</span>
      <input class="inp" id="del-confirm" style="width:100%" autocomplete="off" placeholder="삭제합니다"></label>
    <div class="bar" style="height:8px;background:var(--line-s);border-radius:99px;overflow:hidden;margin:6px 0">
      <i id="del-bar" style="display:block;height:100%;background:var(--danger);width:0;transition:width .25s"></i></div>
    <p id="del-stat" style="font-size:12px;color:var(--muted);margin:0 0 12px"></p>
    <button class="btn btn-danger" id="del-go" style="width:100%;justify-content:center" disabled>학생 정보 삭제</button>
    <p style="font-size:12px;color:var(--muted);margin:12px 0 0">
      강좌·수업일·일정 설정은 그대로 유지됩니다.</p>`);

  const el = (x) => $(x, d);

  /** 삭제 대상 계산 */
  const plan = () => {
    const sc = el("#del-scope").value;
    const inScope = (y) => sc === "all" || String(y) === sc;
    const courses = S.state.courses.filter((c) => inScope(courseYear(c)));
    const cids = new Set(courses.map((c) => c.id));
    const enrolls = S.state.enrollments.filter((e) => inScope(enrollYear(e)) || cids.has(e.courseId));
    const waits = S.state.waitlist.filter((w) => cids.has(w.courseId));
    // 남는 수강 건에 등장하지 않는 학생만 삭제합니다.
    const removedIds = new Set(enrolls.map((e) => e.id));
    const keepStudent = new Set(S.state.enrollments
      .filter((e) => !removedIds.has(e.id)).map((e) => e.studentId));
    const students = S.state.students.filter((s2) => !keepStudent.has(s2.id));
    return { courses, enrolls, waits, students };
  };

  const paintPlan = () => {
    const p = plan();
    el("#del-plan").innerHTML = `
      <div><span>수강·환불 내역</span><b>${p.enrolls.length}건 삭제</b></div>
      <div><span>대기자</span><b>${p.waits.length}건 삭제</b></div>
      <div><span>학생 정보</span><b>${p.students.length}건 삭제</b></div>
      <div><span>강좌</span><b style="color:var(--teal-d)">${p.courses.length}건 유지 (집계 보관)</b></div>`;
    const ok = el("#del-confirm").value.trim() === "삭제합니다"
      && (p.enrolls.length + p.waits.length + p.students.length) > 0;
    el("#del-go").disabled = !ok;
    if (!el("#del-stat").textContent) el("#del-stat").textContent = "";
  };
  el("#del-scope").addEventListener("change", paintPlan);
  el("#del-confirm").addEventListener("input", paintPlan);
  paintPlan();

  el("#bk-go").onclick = (ev) => backupExcel(el("#bk-scope").value, ev.currentTarget);

  el("#del-go").onclick = async (ev) => {
    const p = plan();
    const total = p.enrolls.length + p.waits.length + p.students.length;
    if (!confirm(`수강 ${p.enrolls.length} · 대기 ${p.waits.length} · 학생 ${p.students.length}건을 영구 삭제합니다.\n강좌 ${p.courses.length}건은 최종 집계와 함께 남습니다.\n\n정말 진행할까요?`)) return;
    ev.target.disabled = true;
    let done = 0;
    const tick = (n) => {
      el("#del-bar").style.width = `${Math.round(((done + n) / (total + p.courses.length)) * 100)}%`;
    };
    try {
      // ① 강좌에 최종 집계 새기기
      el("#del-stat").textContent = "최종 집계를 강좌에 기록하는 중…";
      for (const c of p.courses) {
        const n = C.countsFor(c.id, S.state.enrollments, S.state.waitlist, c);
        await S.saveCourse(c.id, {
          finalCounts: {
            active: n.active, attending: n.attending, applied: n.applied,
            canceled: n.canceled, refunded: n.refunded, waiting: n.waiting,
          },
          archivedAt: C.iso(new Date()),
        });
        done += 1; tick(0);
      }
      // ② 학생 관련 데이터 삭제
      const jobs = [
        ["enrollments", p.enrolls.map((x) => x.id), "수강·환불 내역"],
        ["waitlist", p.waits.map((x) => x.id), "대기자"],
        ["students", p.students.map((x) => x.id), "학생 정보"],
      ];
      for (const [col, ids, label] of jobs) {
        if (!ids.length) continue;
        await S.deleteDocs(col, ids, (n) => {
          el("#del-stat").textContent = `${label} ${n}/${ids.length} 삭제 중…`;
          tick(n);
        });
        done += ids.length;
      }
      el("#del-bar").style.width = "100%";
      el("#del-stat").textContent = `완료 · ${total}건 삭제, 강좌 ${p.courses.length}건 보관`;
      el("#del-confirm").value = "";
      toast("학생 정보를 삭제했습니다. 현황표는 그대로 남아 있습니다.");
      paintPlan();
    } catch (err) {
      el("#del-stat").textContent = `실패: ${err.code || err.message}`;
      ev.target.disabled = false;
    }
  };
}

/** 전체 백업 — 시트 여러 장을 담은 엑셀 하나 */
async function backupExcel(scope, btn) {
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "만드는 중…";
  try {
    const XLSX = await loadSheetJs();
    const inYear = (y) => scope === "all" || String(y) === String(scope);
    const { courses, students, enrollments, waitlist } = S.state;
    const wb = XLSX.utils.book_new();
    const add = (name, rows, widths) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    const cs = courses.filter((c) => inYear(courseYear(c)))
      .sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term)
        || String(a.subject).localeCompare(b.subject));

    // ── 현황표 (집계 포함) ──
    add("현황표", [["연도", "기수", "과목", "강의명", "담당", "요일", "시간", "강의실",
      "인원", "수강", "신청", "취소", "환불", "대기", "정원",
      "회차", "개강", "종강", "교습비", "교재비", "총액", "결제액", "교재명"],
      ...cs.map((c) => {
        const n = C.countsFor(c.id, enrollments, waitlist, c);
        return [courseYear(c), c.term, c.subject, c.title, (c.teachers || []).join(","),
          c.day1, c.time1, c.room,
          n.active, n.attending, n.applied, n.canceled, n.refunded, n.waiting, c.cap1,
          (c.sessions || []).length, c.sessions?.[0]?.date || "",
          c.sessions?.[c.sessions.length - 1]?.date || "",
          c.fee?.tuition, c.fee?.book, c.fee?.total,
          (n.attending || 0) * (c.fee?.total || 0), c.textbook?.title];
      })],
      [6, 6, 6, 26, 14, 7, 14, 8, 6, 6, 6, 6, 6, 6, 6, 6, 12, 12, 10, 9, 10, 12, 20]);

    const es = enrollments.filter((e) => inYear(enrollYear(e)))
      .sort((a, b) => String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true }));
    const nameOf = (id) => students.find((x) => x.id === id) || {};
    const titleOf = (id) => courses.find((x) => x.id === id)?.title || id;

    // ── 학생명단 (신청·수강·취소) ──
    add("학생명단", [["연도", "기수", "학번", "성명", "반", "그룹", "강좌", "시작회차",
      "결제주체", "결제일", "상태"],
      ...es.filter((e) => C.normStatus(e.status) !== "환불").map((e) => {
        const st = nameOf(e.studentId);
        return [enrollYear(e), e.term, e.studentId, st.name, st.classGroup, st.group,
          titleOf(e.courseId), e.startSession || 1, e.payer, e.paidAt, C.normStatus(e.status)];
      })], [6, 6, 8, 10, 5, 5, 26, 8, 11, 12, 8]);

    // ── 환불명단 ──
    add("환불명단", [["연도", "기수", "취소일", "학번", "성명", "반", "강좌",
      "환불유형", "교재", "환불예상액", "최종환불일"],
      ...es.filter((e) => C.normStatus(e.status) === "환불")
        .sort((a, b) => String(a.refund?.canceledAt ?? "").localeCompare(String(b.refund?.canceledAt ?? "")))
        .map((e) => {
          const st = nameOf(e.studentId);
          const c = courses.find((x) => x.id === e.courseId);
          return [enrollYear(e), e.term, e.refund?.canceledAt, e.studentId, st.name, st.classGroup,
            c?.title || e.courseId, e.refund?.type, e.refund?.bookRefund,
            C.refundAmount(c, e.refund), e.refund?.settledAt];
        })], [6, 6, 12, 8, 10, 5, 26, 10, 8, 12, 12]);

    // ── 대기자 ──
    const ws2 = waitlist.filter((w) => {
      const c = courses.find((x) => x.id === w.courseId);
      return !c || inYear(courseYear(c));
    });
    add("대기자", [["등록시각", "학번", "이름", "반", "대기강좌", "안내발송", "처리", "비고"],
      ...ws2.map((w) => [w.registeredAt, w.studentId, w.name, w.classGroup,
        w.courseTitle, w.notifiedAt, w.state, w.memo])], [18, 8, 10, 5, 26, 12, 8, 20]);

    // ── 학생정보 ──
    add("학생정보", [["학번", "성명", "반", "그룹", "기숙사", "수험번호", "전형", "상태"],
      ...students.slice().sort((a, b) => String(a.id).localeCompare(String(b.id), "ko", { numeric: true }))
        .map((s2) => [s2.id, s2.name, s2.classGroup, s2.group, s2.dorm, s2.examNo, s2.admissionType, s2.status])],
      [8, 10, 5, 5, 9, 10, 12, 8]);

    // ── 수업일 ──
    const cal = S.state.calendars || {};
    const calRows = [["연도", "날짜", "요일", "구분"]];
    Object.entries(cal).filter(([k]) => /^\d{4}$/.test(k) && inYear(k))
      .forEach(([yy, v]) => Object.entries(v.cells || {}).sort()
        .forEach(([dt, val]) => calRows.push([yy, dt, C.dayName(dt), val])));
    add("수업일", calRows, [6, 12, 6, 10]);

    // ── 일정 ──
    const sc2 = S.state.schedule || {};
    const scRows = [["연도", "시작일", "종료일", "내용", "분류"]];
    Object.entries(sc2).filter(([k]) => inYear(k))
      .forEach(([yy, list]) => (list || []).forEach((e) =>
        scRows.push([yy, e.date, e.end || "", e.label, e.cat || ""])));
    add("일정", scRows, [6, 12, 12, 30, 8]);

    const tag = scope === "all" ? "전체" : `${scope}년`;
    XLSX.writeFile(wb, `QUETTA특강_백업_${tag}_${C.iso(new Date())}.xlsx`);
    toast("백업 파일을 내려받았습니다.");
  } catch (err) {
    toast("백업하지 못했습니다: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
}

/** 로그인 PIN 변경 */
export function pinDrawer() {
  const pinMode = !!fixedLoginId;                 // PIN 방식일 때만 숫자 전용
  const NAME = pinMode ? `PIN ${pinLength}자리` : "비밀번호";
  const d = drawer(`${pinMode ? "PIN" : "비밀번호"} 변경`,
    pinMode ? `현재 비밀번호로 확인한 뒤 ${pinLength}자리 숫자로 바꿉니다`
            : "현재 비밀번호로 확인한 뒤 새 비밀번호로 바꿉니다", `
    <label class="field"><span>현재 비밀번호</span>
      <input class="inp" type="password" id="p-cur" style="width:100%" autocomplete="current-password"></label>
    <label class="field"><span>새 ${NAME}</span>
      <input class="inp" type="password" id="p-new" autocomplete="new-password"
             ${pinMode ? `inputmode="numeric" maxlength="${pinLength}"` : ""}
             style="width:100%${pinMode ? ";letter-spacing:6px;text-align:center" : ""}"></label>
    <label class="field"><span>새 ${NAME} 확인</span>
      <input class="inp" type="password" id="p-new2" autocomplete="new-password"
             ${pinMode ? `inputmode="numeric" maxlength="${pinLength}"` : ""}
             style="width:100%${pinMode ? ";letter-spacing:6px;text-align:center" : ""}"></label>
    <p id="p-msg" style="font-size:12px;color:var(--muted);margin:0 0 14px">
      ${pinMode ? "숫자만 입력됩니다. " : "Firebase 규칙상 최소 6자 이상이어야 합니다. "}
      바꾼 뒤에는 브라우저에 저장된 비밀번호도 새 값으로 갱신하세요.</p>
    <button class="btn btn-pri" id="p-go" style="width:100%;justify-content:center">변경하기</button>`);

  const el = (x) => $(x, d);
  if (pinMode) {
    ["#p-new", "#p-new2"].forEach((sel) => el(sel).addEventListener("input", () => {
      el(sel).value = el(sel).value.replace(/\D/g, "").slice(0, pinLength);
    }));
  }

  el("#p-go").onclick = async (ev) => {
    const cur = el("#p-cur").value;
    const a = el("#p-new").value, b = el("#p-new2").value;
    const msg = el("#p-msg");
    if (!cur) return toast("현재 비밀번호를 입력하세요.");
    if (pinMode && a.length !== pinLength) return toast(`새 PIN을 ${pinLength}자리로 입력하세요.`);
    if (!pinMode && a.length < 6) return toast("새 비밀번호는 6자 이상이어야 합니다.");
    if (a !== b) return toast("새로 입력한 두 칸이 서로 다릅니다.");

    ev.target.disabled = true; ev.target.textContent = "변경 중…";
    try {
      await S.changePin(cur, a);
      msg.innerHTML = '<b style="color:var(--ok)">변경했습니다. 브라우저에 저장된 비밀번호도 새 값으로 갱신하세요.</b>';
      el("#p-cur").value = ""; el("#p-new").value = ""; el("#p-new2").value = "";
      toast("PIN을 변경했습니다.");
    } catch (err) {
      const map = {
        "auth/invalid-credential": "현재 비밀번호가 맞지 않습니다.",
        "auth/wrong-password": "현재 비밀번호가 맞지 않습니다.",
        "auth/weak-password": "너무 짧습니다. 최소 6자 이상이어야 합니다.",
        "auth/requires-recent-login": "보안을 위해 다시 로그인한 뒤 시도하세요.",
        "auth/too-many-requests": "시도가 많아 잠시 막혔습니다. 잠시 후 다시 시도하세요.",
      };
      msg.innerHTML = `<b style="color:var(--danger)">${esc(map[err.code] || err.message)}</b>`;
    } finally {
      ev.target.disabled = false; ev.target.textContent = "변경하기";
    }
  };
  el("#p-cur").focus();
}

// ── 라우팅 ──────────────────────────────────────────────────────
const VIEWS = {
  dashboard: viewDashboard, students: viewStudents, refunds: viewRefunds,
  waitlist: viewWaitlist, schedule: viewSchedule, calc: viewCalc,
};
let current = "dashboard";

export function render(name = current) {
  current = name;
  if (!S.state.ready) {
    host().innerHTML = `<div class="empty"><b>데이터를 불러오는 중입니다.</b>잠시만 기다려 주세요.</div>`;
    return;
  }
  ensureTermFilter();
  paintYearPicker();
  VIEWS[name]?.();
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  host().querySelectorAll("[data-term]").forEach((b) => b.addEventListener("click", () => {
    termFilter = b.dataset.term || null; render();
  }));

  window.lucide?.createIcons();
}
export const currentView = () => current;
