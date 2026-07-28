// 화면 렌더링
import * as S from "./store.js";
import * as C from "./calc.js";

const $ = (s, r = document) => r.querySelector(s);
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g,
  (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])));
const host = () => $("#view");
const TERMS = ["제로", "1기", "2기", "3기", "4기"];
let termFilter = null;

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

const termChips = (active) => `<div class="chips">
  <button class="chip ${active === null ? "on" : ""}" data-term="">전체</button>
  ${TERMS.map((t) => `<button class="chip ${active === t ? "on" : ""}" data-term="${t}">${t}</button>`).join("")}
</div>`;

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
    a.applied += n.applied; a.paid += n.paid; a.unpaid += n.unpaid;
    a.refunded += n.refunded; a.waiting += n.waiting;
    a.revenue += n.paid * (c.fee?.total || 0);
    return a;
  }, { applied: 0, paid: 0, unpaid: 0, refunded: 0, waiting: 0, revenue: 0 });

  host().innerHTML = `
  <div class="page-head">
    <div><h1>현황표</h1><p>기수별 개설 강좌와 신청·결제 현황입니다.</p></div>
    ${termChips(termFilter)}
  </div>
  <dl class="kpis">
    <div class="kpi"><dt>개설 강좌</dt><dd>${list.length}<small>개</small></dd></div>
    <div class="kpi accent"><dt>신청</dt><dd>${sum.applied}<small>명</small></dd></div>
    <div class="kpi"><dt>결제완료</dt><dd>${sum.paid}<small>명</small></dd></div>
    <div class="kpi ${sum.unpaid ? "alert" : ""}"><dt>미결제</dt><dd>${sum.unpaid}<small>명</small></dd></div>
    <div class="kpi"><dt>환불</dt><dd>${sum.refunded}<small>건</small></dd></div>
    <div class="kpi"><dt>대기</dt><dd>${sum.waiting}<small>명</small></dd></div>
    <div class="kpi"><dt>결제액</dt><dd style="font-size:19px">${C.won(sum.revenue)}</dd></div>
  </dl>
  <section class="card">
    <div class="card-head"><h2>강좌 목록</h2><span class="sub">행을 누르면 상세가 열립니다</span></div>
    <div class="tbl-wrap">${list.length ? `<table class="tbl">
      <thead><tr>
        <th>기수</th><th>과목</th><th>강의명</th><th>담당</th><th>요일·시간</th><th>강의실</th>
        <th class="num">신청</th><th class="num">결제</th><th class="num">미결제</th>
        <th class="num">환불</th><th class="num">대기</th><th>정원</th><th>개강</th><th>회차</th><th>출석부</th>
      </tr></thead><tbody>
      ${list.map((c) => {
        const n = C.countsFor(c.id, enrollments, waitlist);
        const cap = c.cap1 || c.cap2 || null;
        const pct = cap ? Math.min(Math.round((n.applied / cap) * 100), 130) : 0;
        const cls = !cap ? "" : n.applied > cap ? "over" : n.applied === cap ? "full" : "";
        const open = (c.sessions || [])[0]?.date;
        return `<tr class="clickable" data-course="${esc(c.id)}">
          <td><span class="tag tag-peri">${esc(c.term)}</span></td>
          <td>${esc(c.subject)}</td>
          <td class="strong">${esc(c.title)}</td>
          <td>${esc((c.teachers || []).join(", "))}</td>
          <td>${esc([c.day1, c.time1].filter(Boolean).join(" "))}</td>
          <td>${esc(c.room) || '<span class="dim">-</span>'}</td>
          <td class="num strong">${n.applied}</td>
          <td class="num">${n.paid}</td>
          <td class="num">${n.unpaid ? `<span class="tag tag-warn">${n.unpaid}</span>` : '<span class="dim">0</span>'}</td>
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
  const roster = S.state.enrollments.filter((e) => e.courseId === id && e.status !== "환불")
    .map((e) => ({ e, s: S.state.students.find((s) => s.id === e.studentId) }));

  drawer(c.title, `${c.term} · ${(c.teachers || []).join(", ")}`, `
    <dl class="dl">
      <dt>강좌 ID</dt><dd><code>${esc(c.id)}</code></dd>
      <dt>요일·시간</dt><dd>${esc([c.day1, c.time1].filter(Boolean).join(" "))}${mins ? ` <span class="dim">(${mins}분)</span>` : ""}</dd>
      <dt>강의실</dt><dd>${esc(c.room) || "-"}</dd>
      <dt>교습비</dt><dd>${C.won(c.fee?.tuition)}${mins && c.sessions?.length ? ` <span class="dim">· 계산값 ${C.won(C.tuitionOf(mins, c.sessions.length))}</span>` : ""}</dd>
      <dt>교재</dt><dd>${esc(c.textbook?.title) || "없음"}${c.fee?.book ? ` · ${C.won(c.fee.book)}` : ""}</dd>
      <dt>총액</dt><dd class="strong">${C.won(c.fee?.total)}</dd>
      <dt>현황</dt><dd>신청 ${n.applied} · 결제 ${n.paid} · 미결제 ${n.unpaid} · 환불 ${n.refunded} · 대기 ${n.waiting}</dd>
      ${c.note ? `<dt>특이사항</dt><dd>${esc(c.note)}</dd>` : ""}
    </dl>
    <h4 style="font-size:12px;color:var(--muted);margin:0 0 8px">수업 일정 (${(c.sessions || []).length}회)</h4>
    <div class="daylist">${(c.sessions || []).map((s) =>
      `<span class="day ${s.canceled ? "skip" : ""}">${s.no}회 ${C.fmt(s.date)}</span>`).join("") || '<span class="dim">등록된 회차 없음</span>'}</div>
    <h4 style="font-size:12px;color:var(--muted);margin:22px 0 8px">수강생 ${roster.length}명</h4>
    <div class="tbl-wrap"><table class="tbl"><tbody>
      ${roster.map(({ e, s }) => `<tr>
        <td>${esc(s?.classGroup) || "-"}</td><td class="strong">${esc(s?.name) || e.studentId}</td>
        <td class="dim">${esc(e.studentId)}</td>
        <td>${e.status === "결제완료" ? '<span class="tag tag-ok">결제완료</span>' : '<span class="tag tag-warn">미결제</span>'}</td>
      </tr>`).join("") || '<tr><td class="dim">등록된 수강생이 없습니다.</td></tr>'}
    </tbody></table></div>`);
}

// ════════════════════════════════════════════════════════════════
// 2. 특강학생명단
// ════════════════════════════════════════════════════════════════
let q = "", statusFilter = "", courseFilter = "";

export function viewStudents() {
  const { enrollments, students, courses } = S.state;
  const rows = enrollments
    .filter((e) => e.status !== "환불")
    .map((e) => ({ e, s: students.find((x) => x.id === e.studentId), c: courses.find((x) => x.id === e.courseId) }))
    .filter(({ e, s, c }) => {
      if (termFilter && e.term !== termFilter) return false;
      if (statusFilter && e.status !== statusFilter) return false;
      if (courseFilter && e.courseId !== courseFilter) return false;
      if (!q) return true;
      const hay = `${s?.name || ""} ${e.studentId} ${s?.classGroup || ""} ${c?.title || ""}`;
      return hay.toLowerCase().includes(q.toLowerCase());
    })
    .sort((a, b) => String(a.s?.classGroup).localeCompare(String(b.s?.classGroup))
      || String(a.s?.name).localeCompare(String(b.s?.name)));

  const courseOpts = courses.filter((c) => !termFilter || c.term === termFilter)
    .map((c) => `<option value="${esc(c.id)}" ${courseFilter === c.id ? "selected" : ""}>${esc(c.term)} · ${esc(c.title)}</option>`).join("");

  host().innerHTML = `
  <div class="page-head">
    <div><h1>특강학생명단</h1><p>학생 × 강좌 단위로 조회합니다. 총 ${rows.length}건.</p></div>
    <div class="toolbar">
      <button class="btn" id="upload"><i data-lucide="upload"></i>신청명단 불러오기</button>
      <button class="btn" id="xlsx"><i data-lucide="download"></i>엑셀파일로 저장</button>
    </div>
  </div>
  <div class="toolbar" style="margin-bottom:14px">
    ${termChips(termFilter)}
    <input class="inp" id="q" placeholder="이름 · 학번 · 반 검색" value="${esc(q)}" style="width:200px">
    <select class="inp" id="st">
      <option value="">결제상태 전체</option>
      <option value="결제완료" ${statusFilter === "결제완료" ? "selected" : ""}>결제완료</option>
      <option value="미결제" ${statusFilter === "미결제" ? "selected" : ""}>미결제</option>
    </select>
    <select class="inp" id="cf"><option value="">강좌 전체</option>${courseOpts}</select>
  </div>
  <section class="card"><div class="tbl-wrap">${rows.length ? `<table class="tbl">
    <thead><tr><th>반</th><th>그룹</th><th>학번</th><th>성명</th><th>기수</th><th>강좌</th>
      <th>결제주체</th><th>결제일</th><th>상태</th><th></th></tr></thead>
    <tbody>${rows.map(({ e, s, c }) => `<tr class="clickable" data-sid="${esc(e.studentId)}">
      <td>${esc(s?.classGroup) || "-"}</td><td>${esc(s?.group) || "-"}</td>
      <td class="dim">${esc(e.studentId)}</td><td class="strong">${esc(s?.name) || "-"}</td>
      <td><span class="tag tag-peri">${esc(e.term)}</span></td>
      <td>${esc(c?.title) || '<span class="tag tag-danger">미연결</span>'}</td>
      <td>${esc(e.payer) || '<span class="dim">-</span>'}</td>
      <td>${e.paidAt ? C.fmt(e.paidAt) : '<span class="dim">-</span>'}</td>
      <td>${e.status === "결제완료" ? '<span class="tag tag-ok">결제완료</span>' : '<span class="tag tag-warn">미결제</span>'}</td>
      <td>${e.status === "결제완료"
        ? `<button class="btn btn-sm btn-danger" data-refund="${esc(e.id)}">환불 신청</button>`
        : `<button class="btn btn-sm" data-pay="${esc(e.id)}">결제확인</button>`}</td>
    </tr>`).join("")}</tbody></table>`
    : emptyBox("조건에 맞는 학생이 없습니다.", "검색어나 필터를 바꿔보세요.")}
  </div></section>`;

  $("#q").oninput = (ev) => { q = ev.target.value; render("students"); $("#q").focus(); };
  $("#st").onchange = (ev) => { statusFilter = ev.target.value; render("students"); };
  $("#cf").onchange = (ev) => { courseFilter = ev.target.value; render("students"); };
  $("#xlsx").onclick = (ev) => exportExcel(rows, ev.currentTarget);
  $("#upload").onclick = openRosterUpload;
  host().querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    const e = S.state.enrollments.find((x) => x.id === b.dataset.pay);
    await S.saveEnrollment(e.id, { status: "결제완료", paidAt: C.iso(new Date()) });
    toast("결제완료로 변경했습니다.");
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
  const total = es.filter((e) => e.status === "결제완료")
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
        const badge = e.status === "환불" ? '<span class="tag tag-danger">환불</span>'
          : e.status === "결제완료" ? '<span class="tag tag-ok">결제완료</span>'
          : '<span class="tag tag-warn">미결제</span>';
        return `<tr><td><span class="tag tag-peri">${esc(e.term)}</span></td>
          <td class="strong">${esc(c?.title) || esc(e.courseId)}</td>
          <td>${badge}</td><td class="dim">${e.paidAt ? C.fmt(e.paidAt) : ""}</td></tr>`;
      }).join("") || '<tr><td class="dim">이력이 없습니다.</td></tr>'}
    </tbody></table></div>
    ${ws.length ? `<h4 style="font-size:12px;color:var(--muted);margin:22px 0 8px">대기 ${ws.length}건</h4>
      <div class="tbl-wrap"><table class="tbl"><tbody>${ws.map((w) =>
        `<tr><td>${esc(w.courseTitle)}</td><td><span class="tag tag-neutral">${esc(w.state)}</span></td></tr>`).join("")}
      </tbody></table></div>` : ""}`);
}

function refundDrawer(enrollmentId) {
  const e = S.state.enrollments.find((x) => x.id === enrollmentId);
  const c = S.state.courses.find((x) => x.id === e.courseId);
  const s = S.state.students.find((x) => x.id === e.studentId);
  const today = C.iso(new Date());
  const totalSessions = (c?.sessions || []).length;
  const hasBook = (c?.fee?.book || 0) > 0;

  const opts = ["전액", ...Array.from({ length: totalSessions }, (_, i) => `${i + 1}회수강`)];
  const autoType = C.refundTypeFor(C.sessionsTaken(c, today));

  const d = drawer("환불 신청", `${s?.name || e.studentId} · ${c?.title || e.courseId}`, `
    <div class="banner banner-info"><i data-lucide="info"></i>
      <div>오늘(${C.fmt(today)}) 기준 <b>${C.sessionsTaken(c, today)}회</b> 진행된 강좌입니다.
      휴강일은 회차에서 제외했습니다.</div></div>
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
      if (sel === "#r-date") $("#r-type", d).value = C.refundTypeFor(C.sessionsTaken(c, el.value));
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
    const head = ["반", "그룹", "학번", "성명", "기수", "강좌", "결제주체", "결제일", "상태"];
    const body = rows.map(({ e, s, c }) => [s?.classGroup ?? "", s?.group ?? "", e.studentId,
      s?.name ?? "", e.term ?? "", c?.title ?? "", e.payer ?? "", e.paidAt ?? "", e.status]);
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    ws["!cols"] = [6, 6, 8, 10, 7, 26, 11, 12, 10].map((w) => ({ wch: w }));
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
  const match = (title) => S.state.courses.find((c) =>
    c.title.replace(/\s|［.*?］|\[.*?\]/g, "") === title.replace(/\s|［.*?］|\[.*?\]/g, ""))
    || S.state.courses.find((c) => c.title.includes(title) || title.includes(c.title));
  const rows = parsed.map((p) => ({ ...p, course: match(p.courseTitle) }));
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
      <div>신규 ${news.length}건이 <b>미결제</b> 상태로 추가됩니다. 기존 건의 결제 상태는 바뀌지 않습니다.</div></div>
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
        term: r.course.term, payer: r.payer, paidAt: null, status: "미결제",
        refund: null, source: "roster-upload",
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
    .sort((a, b) => String(b.e.refund?.canceledAt).localeCompare(String(a.e.refund?.canceledAt)));

  const totalAmt = rows.reduce((a, r) => a + (r.amt || 0), 0);
  const full = rows.filter((r) => r.e.refund?.type === "전액").length;
  const bookBack = rows.filter((r) => r.e.refund?.bookRefund === "환불").length;

  host().innerHTML = `
  <div class="page-head">
    <div><h1>환불자 명단</h1><p>환불 처리된 수강 건입니다. 총 ${rows.length}건.</p></div>
    ${termChips(termFilter)}
  </div>
  <dl class="kpis">
    <div class="kpi alert"><dt>환불 건수</dt><dd>${rows.length}<small>건</small></dd></div>
    <div class="kpi"><dt>전액 환불</dt><dd>${full}<small>건</small></dd></div>
    <div class="kpi"><dt>1회수강 차감</dt><dd>${rows.length - full}<small>건</small></dd></div>
    <div class="kpi"><dt>교재 회수</dt><dd>${bookBack}<small>건</small></dd></div>
    <div class="kpi"><dt>환불 예상액</dt><dd style="font-size:19px">${C.won(totalAmt)}</dd></div>
  </dl>
  <div class="banner banner-info"><i data-lucide="info"></i>
    <div>환불 예상액은 <b>전액</b>이면 총액 그대로, <b>1회수강</b>이면 총액에서 1회분 교습비와 수령한 교재비를 뺀 값입니다. 실제 지급액은 원장님 결재 기준을 따르세요.</div></div>
  <section class="card"><div class="tbl-wrap">${rows.length ? `<table class="tbl">
    <thead><tr><th>취소일</th><th>기수</th><th>반</th><th>학번</th><th>성명</th><th>취소 강좌</th>
      <th>환불유형</th><th>교재</th><th class="num">환불 예상액</th></tr></thead>
    <tbody>${rows.map(({ e, c, s, amt }) => `<tr>
      <td>${e.refund?.canceledAt ? C.fmt(e.refund.canceledAt) : '<span class="dim">-</span>'}</td>
      <td><span class="tag tag-peri">${esc(e.term)}</span></td>
      <td>${esc(s?.classGroup) || "-"}</td><td class="dim">${esc(e.studentId)}</td>
      <td class="strong">${esc(s?.name) || "-"}</td>
      <td>${esc(c?.title) || esc(e.courseId)}</td>
      <td>${e.refund?.type === "전액" ? '<span class="tag tag-danger">전액</span>'
        : `<span class="tag tag-warn">${esc(e.refund?.type) || "-"}</span>`}</td>
      <td>${esc(e.refund?.bookRefund) || '<span class="dim">-</span>'}</td>
      <td class="num strong">${C.won(amt)}</td></tr>`).join("")}</tbody></table>`
    : emptyBox("환불 건이 없습니다.", "")}
  </div></section>`;
}

// ════════════════════════════════════════════════════════════════
// 4. 대기자 명단
// ════════════════════════════════════════════════════════════════
const WAIT_STATES = ["유지", "무응답", "안읽음", "취소", "배정"];

export function viewWaitlist() {
  const rows = S.state.waitlist
    .filter((w) => !termFilter || S.state.courses.find((c) => c.id === w.courseId)?.term === termFilter)
    .sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt)));
  const active = rows.filter((w) => ["유지", "무응답", "안읽음"].includes(w.state));
  const byCourse = {};
  active.forEach((w) => { (byCourse[w.courseTitle] ||= []).push(w); });

  host().innerHTML = `
  <div class="page-head">
    <div><h1>대기자 명단</h1><p>결원이 생기면 등록 순서대로 승계합니다. 대기 중 ${active.length}명.</p></div>
    ${termChips(termFilter)}
  </div>
  <dl class="kpis">
    <div class="kpi accent"><dt>대기 중</dt><dd>${active.length}<small>명</small></dd></div>
    <div class="kpi"><dt>대상 강좌</dt><dd>${Object.keys(byCourse).length}<small>개</small></dd></div>
    <div class="kpi"><dt>취소</dt><dd>${rows.filter((w) => w.state === "취소").length}<small>명</small></dd></div>
    <div class="kpi"><dt>배정 완료</dt><dd>${rows.filter((w) => w.state === "배정").length}<small>명</small></dd></div>
  </dl>
  <section class="card">
    <div class="card-head"><h2>전체 대기 ${rows.length}건</h2>
      <span class="sub">상태를 바꾸거나 수강생으로 승계할 수 있습니다</span></div>
    <div class="tbl-wrap">${rows.length ? `<table class="tbl">
      <thead><tr><th>순번</th><th>등록시각</th><th>반</th><th>학번</th><th>이름</th><th>대기 강좌</th>
        <th>안내발송</th><th>처리</th><th>비고</th><th></th></tr></thead>
      <tbody>${rows.map((w) => `<tr>
        <td class="dim">${w.no ?? ""}</td>
        <td class="dim">${esc(String(w.registeredAt || "").slice(0, 16))}</td>
        <td>${esc(w.classGroup) || "-"}</td><td class="dim">${esc(w.studentId)}</td>
        <td class="strong">${esc(w.name)}</td>
        <td>${esc(w.courseTitle)}${w.courseId ? "" : ' <span class="tag tag-danger">미연결</span>'}</td>
        <td class="dim">${w.notifiedAt ? C.fmt(w.notifiedAt) : "-"}</td>
        <td><select class="inp" style="padding:4px 8px" data-state="${esc(w.id)}">
          ${WAIT_STATES.map((s) => `<option ${w.state === s ? "selected" : ""}>${s}</option>`).join("")}
        </select></td>
        <td class="dim">${esc(w.memo) || ""}</td>
        <td><button class="btn btn-sm btn-pri" data-promote="${esc(w.id)}"
          ${w.courseId && w.state !== "배정" ? "" : "disabled"}>승계</button></td>
      </tr>`).join("")}</tbody></table>` : emptyBox("대기자가 없습니다.", "")}
    </div>
  </section>`;

  host().querySelectorAll("[data-state]").forEach((sel) => sel.addEventListener("change", async () => {
    await S.saveWait(sel.dataset.state, { state: sel.value });
    toast("처리 상태를 변경했습니다.");
  }));
  host().querySelectorAll("[data-promote]").forEach((b) => b.addEventListener("click", async () => {
    const w = S.state.waitlist.find((x) => x.id === b.dataset.promote);
    if (!confirm(`${w.name} 학생을 '${w.courseTitle}' 수강생으로 옮깁니다. 계속할까요?`)) return;
    try { await S.promoteWait(w); toast("수강생으로 승계했습니다. 결제 안내를 발송하세요."); }
    catch (e) { toast(e.message); }
  }));
}

// ════════════════════════════════════════════════════════════════
// 5. 수업계획 및 신청일정
// ════════════════════════════════════════════════════════════════
let scheduleYear = String(new Date().getFullYear());

export function viewSchedule() {
  const sc = S.state.schedule || {};
  const years = Object.keys(sc).sort();
  if (!years.includes(scheduleYear)) scheduleYear = years[years.length - 1] || scheduleYear;
  const today = C.iso(new Date());
  const items = (sc[scheduleYear] || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const next = items.find((i) => i.date >= today);

  host().innerHTML = `
  <div class="page-head">
    <div><h1>수업계획 및 신청일정</h1><p>강의계획서 요청부터 개강까지의 준비 일정입니다.</p></div>
    <div class="chips">${years.map((y) =>
      `<button class="chip ${y === scheduleYear ? "on" : ""}" data-year="${y}">${y}</button>`).join("")}</div>
  </div>
  ${next && scheduleYear === String(new Date().getFullYear()) ? `<div class="card card-pad" style="margin-bottom:16px">
    <div style="font-size:12px;color:var(--muted);font-weight:600">다음 일정</div>
    <div style="font-size:19px;font-weight:800;letter-spacing:-.02em;margin-top:4px">
      ${esc(next.label)} <span class="tl-dday">${C.dday(next.date, today)}</span></div>
    <div style="color:var(--muted);font-size:13px;margin-top:2px">${C.fmt(next.date)}</div>
  </div>` : ""}
  <section class="card card-pad">${items.length ? `<div class="tl">
    ${items.map((i) => {
      const past = i.date < today;
      const dd = C.dday(i.date, today);
      return `<div class="tl-row ${past ? "past" : ""} ${i === next ? "soon" : ""}">
        <div class="tl-date">${C.fmt(i.date)}</div>
        <div class="tl-label">${esc(i.label)}${!past && dd ? `<span class="tl-dday">${dd}</span>` : ""}</div>
      </div>`;
    }).join("")}</div>` : emptyBox("등록된 일정이 없습니다.", "")}
  </section>`;

  host().querySelectorAll("[data-year]").forEach((b) =>
    b.addEventListener("click", () => { scheduleYear = b.dataset.year; render("schedule"); }));
}

// ════════════════════════════════════════════════════════════════
// 6. 수업일 계산
// ════════════════════════════════════════════════════════════════
const calcForm = { term: "3기", weekday: "화", start: "", count: 8, minutes: 170, book: 0 };

export function viewCalc() {
  const cals = S.state.calendars || {};
  const terms = Object.keys(cals).length ? Object.keys(cals) : ["1기", "2기", "3기", "4기"];
  if (!terms.includes(calcForm.term)) calcForm.term = terms[0];
  const cal = cals[calcForm.term];
  const ex = C.exceptDates(cal);
  const sessions = C.buildSessions({
    startDate: calcForm.start, weekday: calcForm.weekday,
    count: Number(calcForm.count), excepts: ex,
  });
  const real = sessions.filter((s) => !s.skipped);
  const tuition = C.tuitionOf(Number(calcForm.minutes), real.length);
  const total = (tuition || 0) + Number(calcForm.book || 0);
  const exList = [...ex.entries()].sort();

  host().innerHTML = `
  <div class="page-head">
    <div><h1>수업일 계산</h1><p>개강일과 요일을 넣으면 모의고사·정기휴가·휴강을 빼고 회차와 교습비를 계산합니다.</p></div>
  </div>
  <div class="calc-grid">
    <section class="card card-pad">
      <label class="field"><span>기수</span>
        <select class="inp" id="f-term" style="width:100%">
          ${terms.map((t) => `<option ${calcForm.term === t ? "selected" : ""}>${t}</option>`).join("")}
        </select></label>
      <label class="field"><span>요일</span>
        <select class="inp" id="f-day" style="width:100%">
          ${C.DAYS.map((d) => `<option ${calcForm.weekday === d ? "selected" : ""}>${d}</option>`).join("")}
        </select></label>
      <label class="field"><span>개강일</span>
        <input class="inp" type="date" id="f-start" value="${esc(calcForm.start)}" style="width:100%"></label>
      <label class="field"><span>목표 회차</span>
        <input class="inp" type="number" id="f-count" min="1" max="20" value="${calcForm.count}" style="width:100%"></label>
      <label class="field"><span>1회 수업시간 (분)</span>
        <input class="inp" type="number" id="f-min" min="10" step="10" value="${calcForm.minutes}" style="width:100%"></label>
      <label class="field"><span>교재비 (원)</span>
        <input class="inp" type="number" id="f-book" min="0" step="1000" value="${calcForm.book}" style="width:100%"></label>
      <p style="font-size:12px;color:var(--muted);margin:4px 0 0">
        교습비 = 196원 × 수업시간(분) × 회차</p>
    </section>

    <div>
      <dl class="kpis" style="margin-bottom:12px">
        <div class="kpi accent"><dt>실제 회차</dt><dd>${real.length}<small>회</small></dd></div>
        <div class="kpi"><dt>건너뛴 주</dt><dd>${sessions.length - real.length}<small>주</small></dd></div>
        <div class="kpi"><dt>교습비</dt><dd style="font-size:19px">${C.won(tuition)}</dd></div>
        <div class="kpi"><dt>총액</dt><dd style="font-size:19px">${C.won(total)}</dd></div>
      </dl>
      <section class="card card-pad" style="margin-bottom:12px">
        <h2 style="font-size:14px;margin:0 0 4px">수업일</h2>
        ${calcForm.start ? `<div class="daylist">${sessions.map((s) =>
          `<span class="day ${s.skipped ? "skip" : ""}" title="${esc(s.reason || "")}">
            ${s.skipped ? s.reason : s.no + "회"} ${C.fmt(s.date)}</span>`).join("")}</div>
          ${real.length ? `<p style="font-size:12px;color:var(--muted);margin:12px 0 0">
            ${C.fmt(real[0].date)} 개강 · ${C.fmt(real[real.length - 1].date)} 종강</p>` : ""}`
          : '<p style="color:var(--muted);margin:6px 0 0">개강일을 선택하면 회차가 계산됩니다.</p>'}
      </section>
      <section class="card card-pad">
        <h2 style="font-size:14px;margin:0 0 8px">${esc(calcForm.term)} 제외일</h2>
        ${exList.length ? `<div class="daylist">${exList.map(([d, k]) =>
          `<span class="day skip">${k} ${C.fmt(d)}</span>`).join("")}</div>`
          : '<p style="color:var(--muted);margin:0">등록된 제외일이 없습니다.</p>'}
        ${cal?.footnote ? `<p style="font-size:12px;color:var(--muted);white-space:pre-line;margin:14px 0 0">${esc(cal.footnote)}</p>` : ""}
      </section>
    </div>
  </div>`;

  const bind = (id, key, ev = "change") => $(id).addEventListener(ev, (e) => {
    calcForm[key] = e.target.value; render("calc");
  });
  bind("#f-term", "term"); bind("#f-day", "weekday"); bind("#f-start", "start");
  bind("#f-count", "count", "input"); bind("#f-min", "minutes", "input"); bind("#f-book", "book", "input");
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
  VIEWS[name]?.();
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("on", b.dataset.view === name));
  host().querySelectorAll("[data-term]").forEach((b) => b.addEventListener("click", () => {
    termFilter = b.dataset.term || null; render();
  }));
  window.lucide?.createIcons();
}
export const currentView = () => current;
