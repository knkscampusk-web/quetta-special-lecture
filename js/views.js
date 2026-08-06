// 화면 렌더링
import * as S from "./store.js";
import * as C from "./calc.js";

const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g,
  (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])));
const host = () => $("#view");
const TERMS = ["제로", "1기", "2기", "3기", "4기"];
let termFilter = null;
let termInit = false;

/** 기수별 수업 기간 (최초 개강 ~ 마지막 회차) */
function termRanges() {
  const r = {};
  S.state.courses.forEach((c) => {
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

const emptyBox = (title, hint) =>
  `<div class="empty"><b>${esc(title)}</b>${hint ? esc(hint) : ""}</div>`;

// ════════════════════════════════════════════════════════════════
// 1. 현황표
// ════════════════════════════════════════════════════════════════
export function viewDashboard() {
  const { courses, enrollments, waitlist } = S.state;
  const list = (termFilter ? courses.filter((c) => c.term === termFilter) : courses)
    .slice().sort((a, b) => TERMS.indexOf(a.term) - TERMS.indexOf(b.term)
      || String(a.subject).localeCompare(b.subject));

  const sum = list.reduce((a, c) => {
    const n = C.countsFor(c.id, enrollments, waitlist);
    a.active += n.active; a.attending += n.attending; a.applied += n.applied;
    a.canceled += n.canceled; a.refunded += n.refunded; a.waiting += n.waiting;
    a.revenue += n.attending * (c.fee?.total || 0);
    return a;
  }, { active: 0, attending: 0, applied: 0, canceled: 0, refunded: 0, waiting: 0, revenue: 0 });

  host().innerHTML = `
  <div class="page-head">
    <div><h1>현황표</h1><p>기수별 개설 강좌와 신청·수강 현황입니다.</p></div>
    ${termChips(termFilter)}
  </div>
  <dl class="kpis">
    <div class="kpi"><dt>개설 강좌</dt><dd>${list.length}<small>개</small></dd></div>
    <div class="kpi accent"><dt>인원</dt><dd>${sum.active}<small>명</small></dd></div>
    <div class="kpi"><dt>수강</dt><dd>${sum.attending}<small>명</small></dd></div>
    <div class="kpi ${sum.applied ? "alert" : ""}"><dt>신청</dt><dd>${sum.applied}<small>명</small></dd></div>
    <div class="kpi"><dt>취소</dt><dd>${sum.canceled}<small>건</small></dd></div>
    <div class="kpi"><dt>환불</dt><dd>${sum.refunded}<small>건</small></dd></div>
    <div class="kpi"><dt>대기</dt><dd>${sum.waiting}<small>명</small></dd></div>
    <div class="kpi"><dt>결제액</dt><dd style="font-size:19px">${C.won(sum.revenue)}</dd></div>
  </dl>
  <section class="card">
    <div class="card-head"><h2>강좌 목록</h2><span class="sub">행을 누르면 상세가 열립니다</span></div>
    <div class="tbl-wrap">${list.length ? `<table class="tbl">
      <thead><tr>
        <th>기수</th><th>과목</th><th>강의명</th><th>담당</th><th>요일·시간</th><th>강의실</th>
        <th class="num">인원</th><th class="num">수강</th><th class="num">신청</th>
        <th class="num">취소</th><th class="num">환불</th><th class="num">대기</th>
        <th>정원</th><th>개강</th><th>회차</th><th>출석부</th>
      </tr></thead><tbody>
      ${list.map((c) => {
        const n = C.countsFor(c.id, enrollments, waitlist);
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
          <td>${esc(c.room) || '<span class="dim">-</span>'}</td>
          <td class="num strong">${n.active}</td>
          <td class="num">${n.attending}</td>
          <td class="num">${n.applied ? `<span class="tag tag-warn">${n.applied}</span>` : '<span class="dim">0</span>'}</td>
          <td class="num">${n.canceled || '<span class="dim">0</span>'}</td>
          <td class="num">${n.refunded || '<span class="dim">0</span>'}</td>
          <td class="num">${n.waiting || '<span class="dim">0</span>'}</td>
          <td>${cap ? `<span class="gauge"><i class="${cls}" style="width:${pct}%"></i></span> <span class="dim">${cap}</span>` : '<span class="dim">-</span>'}</td>
          <td>${open ? C.fmt(open) : '<span class="dim">-</span>'}</td>
          <td class="num">${(c.sessions || []).length}</td>
          <td>${c.attendanceUrl ? `<a href="${esc(c.attendanceUrl)}" target="_blank" rel="noopener">열기</a>` : '<span class="dim">-</span>'}</td>
        </tr>`;
      }).join("")}
      </tbody></table>` : emptyBox("표시할 강좌가 없습니다.", "기수 필터를 바꾸거나 데이터를 먼저 적재하세요.")}
    </div>
  </section>`;
  host().querySelectorAll("[data-course]").forEach((tr) =>
    tr.addEventListener("click", () => courseDrawer(tr.dataset.course)));
}

function courseDrawer(id) {
  const c = S.state.courses.find((x) => x.id === id);
  if (!c) return;
  const n = C.countsFor(id, S.state.enrollments, S.state.waitlist);
  const mins = C.minutesOf(c.time1);
  const roster = S.state.enrollments.filter((e) => e.courseId === id && C.ACTIVE.includes(C.normStatus(e.status)))
    .map((e) => ({ e, s: S.state.students.find((s) => s.id === e.studentId) }))
    .sort((a, b) => String(a.e.studentId).localeCompare(String(b.e.studentId), "ko", { numeric: true }));

  drawer(c.title, `${c.term} · ${(c.teachers || []).join(", ")}`, `
    <dl class="dl">
      <dt>강좌 ID</dt><dd><code>${esc(c.id)}</code></dd>
      <dt>요일·시간</dt><dd>${esc([c.day1, c.time1].filter(Boolean).join(" "))}${mins ? ` <span class="dim">(${mins}분)</span>` : ""}</dd>
      <dt>강의실</dt><dd>${esc(c.room) || "-"}</dd>
      <dt>교습비</dt><dd>${C.won(c.fee?.tuition)}${mins && c.sessions?.length ? ` <span class="dim">· 계산값 ${C.won(C.tuitionOf(mins, c.sessions.length))}</span>` : ""}</dd>
      <dt>교재</dt><dd>${esc(c.textbook?.title) || "없음"}${c.fee?.book ? ` · ${C.won(c.fee.book)}` : ""}</dd>
      <dt>총액</dt><dd class="strong">${C.won(c.fee?.total)}</dd>
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
      if (termFilter && e.term !== termFilter) return false;
      if (courseFilter && e.courseId !== courseFilter) return false;
      if (!q) return true;
      const hay = `${s?.name || ""} ${e.studentId} ${s?.classGroup || ""} ${c?.title || ""}`;
      return hay.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => String(a.e.studentId).localeCompare(String(b.e.studentId), "ko", { numeric: true })
      || String(a.s?.name ?? "").localeCompare(String(b.s?.name ?? ""), "ko"));

  const courseOpts = courses.filter((c) => !termFilter || c.term === termFilter)
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
    ${termChips(termFilter)}
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
  const courses = S.state.courses.slice()
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
        id: `${sid}__${cid}`, studentId: sid, courseId: cid, term: course.term,
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
        term: r.course.term, payer: r.payer, paidAt: null, status: "신청",
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
    .filter((e) => !termFilter || e.term === termFilter)
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
    ${termChips(termFilter)}
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
    .filter((w) => !termFilter || S.state.courses.find((c) => c.id === w.courseId)?.term === termFilter)
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
  <div class="toolbar" style="margin-bottom:14px">${termChips(termFilter)}</div>
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
  const courses = S.state.courses.slice()
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
// 6. 수업일 계산 (연간 주간 매트릭스)
// ════════════════════════════════════════════════════════════════
const MX_CLASS = {
  모의고사: "s-mock", 정기휴가: "s-vac", 휴강: "s-off", 미운영: "s-none",
};

/** 기수별 문서에서 블록 단위로 묶기 (한 블록 = 기수 2개가 그리드를 공유) */
function calBlocks() {
  const cal = S.state.calendars || {};
  const seen = new Set(), blocks = [];
  Object.values(cal).forEach((v) => {
    if (!v?.grid) return;
    const terms = v.terms?.length ? v.terms : [v.term];
    const key = terms.join("|");
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push({
      terms, weeks: v.weeks || [], grid: v.grid, excepts: v.excepts || {},
      sheetCount: Object.fromEntries(terms.map((t) => [t, cal[t]?.sessionCount || {}])),
      footnote: terms.map((t) => cal[t]?.footnote).find(Boolean) || null,
      legacy: !v.terms,          // 예전 형식(색상 정보 없음) 여부
    });
  });
  return blocks;
}

/** 색상 정보가 없는 예전 데이터용 대체 판정 */
function fallbackStatus(cell, excepts) {
  if (!cell.date) return null;
  const ex = C.exceptDates({ excepts });
  const kind = ex.get(cell.date);
  if (kind === "모의고사") return "모의고사";
  if (kind === "정기휴가") return "정기휴가";
  if (kind === "휴강") return "휴강";
  return "수업";
}

export function viewCalc() {
  const blocks = calBlocks();
  const today = C.iso(new Date());
  const cur = currentTerm();

  if (!blocks.length) {
    host().innerHTML = `
      <div class="page-head"><div><h1>수업일 계산</h1>
        <p>기수별 주간 일정과 수업 가능일을 한눈에 봅니다.</p></div>
        <button class="btn" id="cal-load"><i data-lucide="upload"></i>일정 파일 불러오기</button></div>
      ${emptyBox("일정 데이터가 없습니다.", "calendars.json 을 불러오세요.")}`;
    $("#cal-load").onclick = openCalUpload;
    return;
  }

  const legend = `<div class="legend" style="margin-bottom:14px">
    <span class="ev s-a" style="display:inline-block;width:auto;margin:0">수업일(앞 기수)</span>
    <span class="ev s-b" style="display:inline-block;width:auto;margin:0">수업일(뒤 기수)</span>
    <span class="ev s-mock" style="display:inline-block;width:auto;margin:0">모의고사</span>
    <span class="ev s-vac" style="display:inline-block;width:auto;margin:0">정기휴가</span>
    <span class="ev s-off" style="display:inline-block;width:auto;margin:0">휴강</span>
    <span class="ev s-none" style="display:inline-block;width:auto;margin:0">미운영</span>
  </div>`;

  const renderBlock = (b) => {
    const cols = b.weeks;
    // 기수별 열 구간 (자기 주차 목록 기준)
    const own = b.terms.map((t) => (S.state.calendars[t]?.ownWeeks || []).length);
    const totals = {};
    b.terms.forEach((t) => { totals[t] = {}; });

    const body = C.DAYS.map((dow, di) => {
      const cells = (b.grid[dow] || []).map((cell, ci) => {
        let st = cell.status;
        if (!st && b.legacy) st = fallbackStatus(cell, b.excepts);
        let cls = MX_CLASS[st] || "s-empty";
        if (st === "수업") {
          const oi = b.terms.indexOf(cell.owner);
          cls = oi === 1 ? "s-b" : "s-a";
          const t = cell.owner || b.terms[0];
          totals[t] = totals[t] || {};
          totals[t][dow] = (totals[t][dow] || 0) + 1;
        }
        const isToday = cell.date === today;
        return `<td class="${cls} ${isToday ? "mx-today" : ""}" title="${esc(cols[ci] || "")}${
          cell.date ? " · " + C.fmt(cell.date) : ""}${st ? " · " + st : ""}${cell.note ? " · " + esc(cell.note) : ""}">
          ${cell.date ? `${+cell.date.slice(5, 7)}/${+cell.date.slice(8, 10)}` : ""}
          ${cell.note ? `<span class="mx-note">${esc(cell.note.replace(/\s*\d{1,2}:\d{2}.*$/, ""))}</span>` : ""}
        </td>`;
      }).join("");
      const counts = b.terms.map((t) => {
        const n = totals[t]?.[dow] || 0;
        const sheet = String(b.sheetCount[t]?.[dow] || "").match(/\d+/)?.[0];
        const diff = sheet && String(n) !== sheet;
        return `<td class="cnt">${n}회${diff ? `<small>시트 ${sheet}회</small>` : ""}</td>`;
      }).join("");
      return `<tr>
        <td class="dow ${di === 6 ? "sun" : di === 5 ? "sat" : ""}">${dow}</td>
        ${cells}${counts}</tr>`;
    }).join("");

    return `<section style="margin-bottom:22px">
      <div class="mx-wrap"><table class="mx">
        <thead>
          <tr><th class="dow" rowspan="2">요일</th>
            ${b.terms.map((t, i) => `<th class="grp ${i ? "b" : ""}" colspan="${own[i] || 1}">${esc(t)}${
              t === cur ? " · 진행 중" : ""}</th>`).join("")}
            ${b.terms.map((t, i) => `<th class="grp ${i ? "b" : ""}" rowspan="2">${esc(t)}<br>회차</th>`).join("")}
          </tr>
          <tr>${cols.map((w) => `<th>${esc(w.replace("주차", "주"))}</th>`).join("")}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table></div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)">
        ${["mock:모의고사", "vacation:정기휴가", "closed:휴강"].map((kv) => {
          const [k, label] = kv.split(":");
          const list = b.excepts[k] || [];
          return list.length ? `<div><b style="color:var(--ink)">${label}</b> ${
            list.map((d) => C.fmt(d)).join(", ")}</div>` : "";
        }).join("")}
      </div>
      ${b.footnote ? `<p style="font-size:12px;color:var(--muted);white-space:pre-line;margin:8px 0 0">${esc(b.footnote)}</p>` : ""}
    </section>`;
  };

  host().innerHTML = `
  <div class="page-head">
    <div><h1>수업일 계산</h1>
      <p>기수별 주간 일정입니다. 색으로 수업 가능일·모의고사·휴가·휴강을 구분합니다.</p></div>
    <div class="toolbar">
      <button class="btn" id="cal-load"><i data-lucide="upload"></i>일정 파일 불러오기</button>
      <button class="btn" id="cal-fee"><i data-lucide="calculator"></i>교습비 계산</button>
    </div>
  </div>
  ${legend}
  ${blocks.map(renderBlock).join("")}`;

  $("#cal-load").onclick = openCalUpload;
  $("#cal-fee").onclick = feeDrawer;
}

/** calendars.json 불러오기 */
function openCalUpload() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = ".json,application/json";
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const terms = Object.keys(data);
      if (!terms.length || !data[terms[0]]?.grid) throw new Error("calendars.json 형식이 아닙니다.");
      if (!confirm(`기수 ${terms.join(", ")} 일정을 덮어씁니다. 계속할까요?`)) return;
      await S.saveConfig("calendars", data);
      toast("일정을 갱신했습니다.");
    } catch (e) { toast("불러오지 못했습니다: " + e.message); }
  };
  inp.click();
}

/** 교습비 계산 (회차는 매트릭스 집계값을 기본값으로) */
function feeDrawer() {
  const cal = S.state.calendars || {};
  const terms = Object.keys(cal);
  if (!terms.length) return toast("일정 데이터가 없습니다.");
  const t0 = terms.includes(currentTerm()) ? currentTerm() : terms[0];

  const d = drawer("교습비 계산", "196원 × 수업시간(분) × 회차", `
    <label class="field"><span>기수</span>
      <select class="inp" id="f-term" style="width:100%">
        ${terms.map((t) => `<option ${t === t0 ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>
    <label class="field"><span>요일</span>
      <select class="inp" id="f-day" style="width:100%">
        ${C.DAYS.map((x) => `<option>${x}</option>`).join("")}
      </select></label>
    <label class="field"><span>회차</span>
      <input class="inp" type="number" id="f-cnt" min="1" max="20" style="width:100%">
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
    const v = cal[t];
    const n = (v?.grid?.[dow] || []).filter((c) => c.status === "수업" && c.owner === t).length;
    const sheet = String(v?.sessionCount?.[dow] || "").match(/\d+/)?.[0];
    el("#f-cnt").value = n || sheet || 8;
    el("#f-src").textContent = n
      ? `일정표 집계 ${n}회${sheet && String(n) !== sheet ? ` (시트 기록은 ${sheet}회)` : ""}`
      : sheet ? `시트 기록 ${sheet}회` : "집계값이 없어 직접 입력하세요.";
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
  VIEWS[name]?.();
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  host().querySelectorAll("[data-term]").forEach((b) => b.addEventListener("click", () => {
    termFilter = b.dataset.term || null; render();
  }));
  window.lucide?.createIcons();
}
export const currentView = () => current;
