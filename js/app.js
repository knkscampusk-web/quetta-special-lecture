import * as S from "./store.js?v=4";
import { render, toast, dataDrawer } from "./views.js?v=4";
import { fixedLoginId, pinLength } from "./config.js?v=4";

const $ = (s) => document.querySelector(s);
let subscribed = false;

// ── 로그인 화면 구성 ────────────────────────────────────────────
const usePin = !!fixedLoginId;
if (usePin) {
  $("#idField").hidden = true;
  $("#email").value = fixedLoginId;
  $("#gateSub").textContent = `행정실 PIN ${pinLength}자리를 입력하세요.`;
  $("#pwLabel").textContent = `PIN ${pinLength}자리`;
  const pw = $("#pw");
  pw.setAttribute("inputmode", "numeric");
  pw.setAttribute("maxlength", String(pinLength));
  pw.setAttribute("placeholder", "•".repeat(pinLength));
  pw.style.letterSpacing = "6px";
  pw.style.textAlign = "center";
  pw.style.fontSize = "18px";
  pw.addEventListener("input", () => {
    pw.value = pw.value.replace(/\D/g, "").slice(0, pinLength);
  });
}

// ── 연속 실패 잠금 (자동 대입 공격 지연) ────────────────────────
const LOCK_KEY = "quetta.pin.lock";
const readLock = () => {
  try { return JSON.parse(sessionStorage.getItem(LOCK_KEY)) || { fails: 0, until: 0 }; }
  catch { return { fails: 0, until: 0 }; }
};
const writeLock = (v) => {
  try { sessionStorage.setItem(LOCK_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
};
const lockSeconds = (fails) => (fails >= 10 ? 300 : fails >= 5 ? 30 : 0);

let tick = null;
function paintLock() {
  const { until } = readLock();
  const left = Math.ceil((until - Date.now()) / 1000);
  const btn = $("#gateForm button");
  if (left > 0) {
    btn.disabled = true;
    btn.textContent = `${left}초 후 다시 시도`;
    if (!tick) tick = setInterval(paintLock, 1000);
    return true;
  }
  if (tick) { clearInterval(tick); tick = null; }
  btn.disabled = false;
  btn.textContent = "로그인";
  return false;
}

function showGate(msg) {
  $("#gate").hidden = false;
  $("#shell").hidden = true;
  const box = $("#gateMsg");
  if (msg) { box.textContent = msg; box.hidden = false; } else { box.hidden = true; }
  paintLock();
}

$("#gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (paintLock()) return;

  const pwv = $("#pw").value;
  if (usePin && pwv.length !== pinLength) {
    return showGate(`PIN ${pinLength}자리를 모두 입력하세요.`);
  }

  const btn = e.target.querySelector("button");
  btn.disabled = true; btn.textContent = "확인 중…";
  try {
    await S.login($("#email").value.trim(), pwv);
    writeLock({ fails: 0, until: 0 });
  } catch (err) {
    const st = readLock();
    st.fails += 1;
    const wait = lockSeconds(st.fails);
    st.until = wait ? Date.now() + wait * 1000 : 0;
    writeLock(st);

    const map = {
      "auth/invalid-credential": usePin ? "PIN이 맞지 않습니다." : "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/wrong-password": usePin ? "PIN이 맞지 않습니다." : "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/user-not-found": usePin ? "PIN이 맞지 않습니다." : "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/invalid-email": "로그인 설정이 잘못되었습니다. 관리자에게 문의하세요.",
      "auth/too-many-requests": "시도가 많아 잠시 막혔습니다. 잠시 후 다시 시도하세요.",
      "auth/network-request-failed": "네트워크에 연결할 수 없습니다.",
    };
    const base = map[err.code] || `로그인하지 못했습니다. (${err.code || err.message})`;
    showGate(wait ? `${base} 연속 ${st.fails}회 실패로 ${wait}초간 잠깁니다.` : base);
    $("#pw").value = "";
  } finally {
    if (!paintLock()) { btn.disabled = false; btn.textContent = "로그인"; }
  }
});

$("#logout").addEventListener("click", async () => {
  await S.logout();
  location.reload();
});

document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => render(b.dataset.view)));
$("#dataMgr").addEventListener("click", () => dataDrawer());

S.watchAuth(async (user) => {
  if (!user) { showGate(); return; }
  const ok = await S.isAdmin(user.uid);
  if (!ok) {
    await S.logout();
    showGate("행정실 권한이 없는 계정입니다. 관리자에게 문의하세요.");
    return;
  }
  $("#gate").hidden = true;
  $("#shell").hidden = false;
  $("#whoami").textContent = S.displayId(user.email);
  if (!subscribed) {
    subscribed = true;
    S.onChange(() => render());
    S.subscribeAll();
  }
  render();
  window.lucide?.createIcons();
});

window.addEventListener("unhandledrejection", (e) => {
  if (String(e.reason?.code || "").includes("permission-denied")) {
    toast("권한이 없어 처리하지 못했습니다. 보안 규칙을 확인하세요.");
  }
});
