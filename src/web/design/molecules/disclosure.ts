// Report sheet R8: progressive disclosure on the native <details> element (keyboard and state for free). Closed by default;
// the caller keeps every caveat outside it (H9).
import { buildError, esc, oneOf, tag } from "../html"

export const DISCLOSURE_LEVELS = ["detail"] as const
export type DisclosureLevel = (typeof DISCLOSURE_LEVELS)[number]

export type DisclosureProps = {
  summary: string
  open?: boolean
  level: DisclosureLevel
  id?: string
}

export function disclosure(p: DisclosureProps): (inner: string) => string {
  const level = oneOf("Disclosure", DISCLOSURE_LEVELS, p.level)
  if (typeof p.summary !== "string" || p.summary.trim() === "")
    return buildError("Disclosure", "a disclosure needs a summary")
  if (p.id !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.id))
    return buildError("Disclosure", "id must be a plain identifier")
  return (inner: string) =>
    tag(
      "details",
      {
        class: "tv-disclosure",
        id: p.id,
        open: p.open === true,
        "data-level": level,
      },
      tag("summary", { class: "tv-disclosure__summary" }, esc(p.summary)) +
        tag("div", { class: "tv-disclosure__inner" }, inner),
    )
}

/** Opens every closed ancestor <details> when a link or the address targets an id inside it (a glossary anchor in a closed glossary). */
export const DISCLOSURE_SCRIPT = `(function(){
function reveal(id){var el=id&&document.getElementById(id);if(!el)return;var changed=false;for(var n=el.parentElement;n;n=n.parentElement){if(n.tagName==="DETAILS"&&!n.open){n.open=true;changed=true}}if(changed)el.scrollIntoView()}
function fromHash(){try{reveal(decodeURIComponent(location.hash.slice(1)))}catch(e){}}
addEventListener("hashchange",fromHash);
document.addEventListener("click",function(ev){var a=ev.target&&ev.target.closest&&ev.target.closest('a[href^="#"]');if(a)reveal(decodeURIComponent(a.getAttribute("href").slice(1)))});
fromHash()})();`
