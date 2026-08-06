import * as S from "./store.js";
import { render, toast } from "./views.js";

const $ = (s) => document.querySelector(s);
let subscribed = false;

function showGate(msg) {
  $("#gate").hidden = false;
  $("#shell").hidden = true;
  const box = $("#gateMsg");
  if (msg) { box.textContent = msg; box.hidden = false; } else { box.hidden = true; }
}

$("#gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.disabled = true; btn.textContent = "확인 중…";
  try {
    await S.login($("#email").value.trim(), $("#pw").value);
  } catch (err) {
    const map = {
      "auth/invalid-credential": "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/invalid-email": "아이디에 사용할 수 없는 문자가 있습니다.",
      "auth/user-not-found": "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/wrong-password": "아이디 또는 비밀번호가 맞지 않습니다.",
      "auth/too-many-requests": "시도가 많아 잠시 막혔습니다. 잠시 후 다시 시도하세요.",
      "auth/network-request-failed": "네트워크에 연결할 수 없습니다.",
    };
    showGate(map[err.code] || `로그인하지 못했습니다. (${err.code || err.message})`);
  } finally { btn.disabled = false; btn.textContent = "로그인"; }
});

$("#logout").addEventListener("click", async () => {
  await S.logout();
  location.reload();
});

document.querySelectorAll(".nav-btn").forEach((b) =>
  b.addEventListener("click", () => render(b.dataset.view)));

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
