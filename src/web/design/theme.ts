// The theme switch (D3, amended): the page opens LIGHT whatever the system colour scheme says; one button switches to DARK and
// back. The choice lives in `data-theme` on <html> and in localStorage under one namespaced key; storage may throw or be empty
// and the page is then simply light. No network, no dependency. Browser and Node safe (strings only).
import { cls, tag } from "./html"

export const THEME_KEY = "spandek:theme"
export const THEME_EVENT = "spandek-theme"

/** Runs in <head> before the first paint: applies the stored theme, light when there is none or storage is blocked. */
export const THEME_INIT_SCRIPT = `(function(){var t="light";try{var s=localStorage.getItem("${THEME_KEY}");if(s==="dark")t="dark"}catch(e){}document.documentElement.setAttribute("data-theme",t)})();`

/** Delegated click handler of the toggle plus the state sync; fires `spandek-theme` on `document` so the figures redraw. */
export const THEME_TOGGLE_SCRIPT = `(function(){var root=document.documentElement;function cur(){return root.getAttribute("data-theme")==="dark"?"dark":"light"}function sync(){var b=document.getElementById("theme-toggle");if(!b)return;var d=cur()==="dark";b.setAttribute("aria-pressed",d?"true":"false");var s=b.querySelector("[data-theme-state]");if(s)s.textContent=d?"On":"Off"}document.addEventListener("click",function(e){var t=e.target;var b=t&&t.closest?t.closest("#theme-toggle"):null;if(!b)return;var n=cur()==="dark"?"light":"dark";root.setAttribute("data-theme",n);try{localStorage.setItem("${THEME_KEY}",n)}catch(x){}sync();document.dispatchEvent(new CustomEvent("${THEME_EVENT}",{detail:n}))});sync()})();`

/** The one control: a toggle button named "Dark mode" with its state as visible text and in aria-pressed. */
export function themeToggle(): string {
  return tag(
    "button",
    {
      type: "button",
      id: "theme-toggle",
      class: cls("tv-button", "tv-button--ghost", "tv-theme-toggle"),
      "aria-pressed": false,
    },
    `<span>Dark mode</span><span class="tv-theme-toggle__state" data-theme-state aria-hidden="true">Off</span>`,
  )
}
