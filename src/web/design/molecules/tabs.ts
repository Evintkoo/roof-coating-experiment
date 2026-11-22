// Report sheet R11: the WAI-ARIA tabs pattern with automatic activation. Markup is built here; `TABS_SCRIPT` is the behaviour.
import { buildError, esc, tag } from "../html"

export type TabsProps = {
  id: string
  label: string
  tabs: readonly { id: string; label: string }[]
  selected?: string
}

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/

export function tabs(p: TabsProps): (panels: readonly string[]) => string {
  if (!ID.test(p.id)) return buildError("Tabs", "id must be a plain identifier")
  if (typeof p.label !== "string" || p.label.trim() === "")
    return buildError("Tabs", "a tab list needs a label")
  if (p.tabs.length < 2)
    return buildError("Tabs", "tabs need at least two tabs")
  const ids = new Set<string>()
  for (const t of p.tabs) {
    if (!ID.test(t.id) || ids.has(t.id))
      return buildError("Tabs", "tab ids must be distinct plain identifiers")
    if (typeof t.label !== "string" || t.label.trim() === "")
      return buildError("Tabs", "a tab needs a label")
    ids.add(t.id)
  }
  const selected = p.selected ?? (p.tabs[0] as { id: string }).id
  if (!ids.has(selected)) return buildError("Tabs", "selected is not a tab")
  return (panels) => {
    if (panels.length !== p.tabs.length)
      return buildError("Tabs", "one panel per tab")
    const buttons = p.tabs
      .map((t) =>
        tag(
          "button",
          {
            type: "button",
            role: "tab",
            class: "tv-tabs__tab",
            id: `${p.id}-tab-${t.id}`,
            "aria-controls": `${p.id}-panel-${t.id}`,
            "aria-selected": t.id === selected,
            tabindex: t.id === selected ? 0 : -1,
            "data-tab": t.id,
          },
          esc(t.label),
        ),
      )
      .join("")
    const bodies = p.tabs
      .map((t, i) =>
        tag(
          "div",
          {
            role: "tabpanel",
            class: "tv-tabs__panel",
            id: `${p.id}-panel-${t.id}`,
            "aria-labelledby": `${p.id}-tab-${t.id}`,
            tabindex: 0,
            hidden: t.id !== selected,
            "data-label": t.label,
          },
          panels[i] as string,
        ),
      )
      .join("")
    return tag(
      "div",
      { class: "tv-tabs", id: p.id, "data-tabs": true },
      tag(
        "div",
        { class: "tv-tabs__list", role: "tablist", "aria-label": p.label },
        buttons,
      ) + bodies,
    )
  }
}

/** Click, Arrow Left and Right (wrapping), Home and End; moves focus and the roving tabindex; fires `tabs-change`. */
export const TABS_SCRIPT = `(function(){
function select(tab,focus){var root=tab.closest("[data-tabs]");var all=root.querySelectorAll('[role="tab"]');for(var i=0;i<all.length;i++){var t=all[i];var on=t===tab;t.setAttribute("aria-selected",on?"true":"false");t.tabIndex=on?0:-1;var p=document.getElementById(t.getAttribute("aria-controls"));if(p)p.hidden=!on}if(focus)tab.focus();root.dispatchEvent(new CustomEvent("tabs-change",{bubbles:true,detail:{id:tab.getAttribute("data-tab")}}))}
document.addEventListener("click",function(ev){var t=ev.target&&ev.target.closest&&ev.target.closest('[role="tab"]');if(t&&t.closest("[data-tabs]"))select(t,false)});
document.addEventListener("keydown",function(ev){var t=ev.target;if(!t||!t.getAttribute||t.getAttribute("role")!=="tab")return;var list=[].slice.call(t.parentElement.querySelectorAll('[role="tab"]'));var i=list.indexOf(t);var n=-1;if(ev.key==="ArrowRight")n=(i+1)%list.length;else if(ev.key==="ArrowLeft")n=(i+list.length-1)%list.length;else if(ev.key==="Home")n=0;else if(ev.key==="End")n=list.length-1;if(n<0)return;ev.preventDefault();select(list[n],true)})})();`
