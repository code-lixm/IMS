const SKIP_BAOBAO_LOGIN_SESSION_KEY = "ims:skipBaobaoLogin";

export function hasSkippedBaobaoLogin() {
  return typeof window !== "undefined"
    && window.sessionStorage.getItem(SKIP_BAOBAO_LOGIN_SESSION_KEY) === "1";
}

export function rememberSkippedBaobaoLogin() {
  window.sessionStorage.setItem(SKIP_BAOBAO_LOGIN_SESSION_KEY, "1");
}

export function forgetSkippedBaobaoLogin() {
  window.sessionStorage.removeItem(SKIP_BAOBAO_LOGIN_SESSION_KEY);
}
