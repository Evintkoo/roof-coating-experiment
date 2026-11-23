// Report sheet R14: the skip link and the section navigation (left rail on wide screens, a top bar on phones).
import { navLink } from "../atoms/navLink"
import { buildError, esc, tag } from "../html"

export type NavRailProps = {
  brand: string
  items: readonly { id: string; label: string }[]
  /** The id of the current section (at most one). */
  current?: string
  /** The id of the `<main>` the skip link jumps to. */
  mainId: string
  label?: string
}

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/
const C = "NavRail"

export function navRail(p: NavRailProps): string {
  if (!ID.test(p.mainId))
    return buildError(C, "mainId must be a plain identifier")
  if (typeof p.brand !== "string" || p.brand.trim() === "")
    return buildError(C, "a rail needs a brand name")
  if (p.items.length === 0) return buildError(C, "a rail needs items")
  const ids = new Set<string>()
  for (const it of p.items) {
    if (!ID.test(it.id) || ids.has(it.id))
      return buildError(C, "item ids must be distinct plain identifiers")
    ids.add(it.id)
  }
  if (p.current !== undefined && !ids.has(p.current))
    return buildError(C, "current is not one of the items")
  const links = p.items
    .map((it) =>
      navLink({
        label: it.label,
        href: `#${it.id}`,
        state: it.id === p.current ? "current" : "default",
      }),
    )
    .join("")
  return (
    tag("a", { class: "tv-skip", href: `#${p.mainId}` }, "Skip to content") +
    tag(
      "nav",
      { class: "tv-rail", "aria-label": p.label ?? "Sections" },
      tag("span", { class: "tv-rail__brand" }, esc(p.brand)) + links,
    )
  )
}

/**
 * Marks the section being read: the last section whose top has passed a line a third of the way down the viewport gets
 * `aria-current="true"` on its rail link (the page has no current section above the first one). Runs on scroll (once per frame),
 * resize and hash change; no dependency.
 */
export const NAV_SPY_SCRIPT = `(function(){
var links=[].slice.call(document.querySelectorAll(".tv-rail a.tv-navlink[href^='#']"));if(!links.length)return;
var secs=links.map(function(a){return document.getElementById(a.getAttribute("href").slice(1))});
var queued=false;
function update(){queued=false;var line=innerHeight/3,cur=-1;for(var i=0;i<secs.length;i++){var s=secs[i];if(s&&s.getBoundingClientRect().top<=line)cur=i}
for(var j=0;j<links.length;j++){if(j===cur)links[j].setAttribute("aria-current","true");else links[j].removeAttribute("aria-current")}}
function queue(){if(!queued){queued=true;requestAnimationFrame(update)}}
addEventListener("scroll",queue,{passive:true});addEventListener("resize",queue);addEventListener("hashchange",queue);update()})();`
