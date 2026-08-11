import * as S from "./store.js?v=6";
import { render, toast, dataDrawer, pinDrawer } from "./views.js?v=6";
import { fixedLoginId, pinLength, autoLogin } from "./config.js?v=6";

const $ = (s) => document.querySelector(s);
let subscribed = false;

// ── 로그인 화면 구성 ────────────────────────────────────────────
const usePin = !!fixedLoginId;
let pinMode = usePin;                 // 비상 통로로 끄면 일반 로그인
const pwEl = $("#pw");

function applyPinMode(on) {
  pinMode = on;
  $("#idField").hidden = on;
  $("#altLogin").hidden = !on;
  $("#email").value = on ? fixedLoginId : "";
  $("#gateSub").textContent = on
    ? `행정실 PIN ${pinLength}자리를 입력하세요.`
    : "이메일과 비밀번호로 로그인하세요.";
  $("#pwLabel").textContent = on ? `PIN ${pinLength}자리` : "비밀번호";
  if (on) {
    pwEl.setAttribute("inputmode", "numeric");
    pwEl.setAttribute("maxlength", String(pinLength));
    pwEl.setAttribute("placeholder", "•".repeat(pinLength));
    Object.assign(pwEl.style, { letterSpacing: "6px", textAlign: "center", fontSize: "18px" });
  } else {
    pwEl.removeAttribute("inputmode");
    pwEl.removeAttribute("maxlength");
    pwEl.setAttribute("placeholder", "");
    Object.assign(pwEl.style, { letterSpacing: "", textAlign: "", fontSize: "" });
    $("#email").focus();
  }
  pwEl.value = "";
}

if (usePin) {
  applyPinMode(true);
  pwEl.addEventListener("input", () => {
    if (!pinMode) return;
    pwEl.value = pwEl.value.replace(/\D/g, "").slice(0, pinLength);
    if (pwEl.value.length === pinLength) submitIfReady();
  });
  $("#altLogin").addEventListener("click", () => {
    autoTried = true;                 // 자동 로그인 중단
    applyPinMode(false);
  });
}

// ── 저장된 PIN 자동 로그인 ──────────────────────────────────────
const NOAUTO_KEY = "quetta.noauto";
let autoTried = false;

function submitIfReady() {
  const btn = $("#gateForm button[type=submit]");
  if (!pinMode || btn.disabled) return;           // 일반 로그인·잠금 중이면 대기
  if ($("#pw").value.length !== pinLength) return;
  $("#gateForm").requestSubmit
    ? $("#gateForm").requestSubmit()
    : $("#gateForm").dispatchEvent(new Event("submit", { cancelable: true }));
}

function tryAutoLogin() {
  if (!usePin || !pinMode || !autoLogin || autoTried) return;
  autoTried = true;
  // 방금 로그아웃했다면 자동 로그인하지 않습니다.
  try {
    if (sessionStorage.getItem(NOAUTO_KEY)) { sessionStorage.removeItem(NOAUTO_KEY); return; }
  } catch { /* 무시 */ }
  submitIfReady();
}
// 브라우저 자동 입력은 조금 늦게 채워지므로 두 번 확인합니다.
window.addEventListener("load", () => {
  setTimeout(tryAutoLogin, 300);
  setTimeout(() => { autoTried = false; tryAutoLogin(); }, 900);
});

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
  const btn = $("#gateForm button[type=submit]");
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
  if (pinMode && pwv.length !== pinLength) {
    return showGate(`PIN ${pinLength}자리를 모두 입력하세요.`);
  }
  if (!pinMode && !$("#email").value.trim()) {
    return showGate("이메일을 입력하세요.");
  }

  const btn = e.target.querySelector("button[type=submit]");
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
      "auth/invalid-credential": pinMode ? "PIN이 맞지 않습니다." : "이메일 또는 비밀번호가 맞지 않습니다.",
      "auth/wrong-password": pinMode ? "PIN이 맞지 않습니다." : "이메일 또는 비밀번호가 맞지 않습니다.",
      "auth/user-not-found": pinMode ? "PIN이 맞지 않습니다." : "이메일 또는 비밀번호가 맞지 않습니다.",
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
  try { sessionStorage.setItem(NOAUTO_KEY, "1"); } catch { /* 무시 */ }
  await S.logout();
  location.reload();
});

document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => render(b.dataset.view)));
$("#dataMgr").addEventListener("click", () => dataDrawer());
$("#pinChange").addEventListener("click", () => pinDrawer());

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
