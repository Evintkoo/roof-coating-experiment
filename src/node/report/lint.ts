// Build-time lint of the generated report page (plan 07 FR-2): anchors resolve, ids are unique, every interactive element in the
// static markup has an accessible name, every `data-hook` has a handler registered. Pure string work, no DOM: it reads the tags the
// builder wrote. Controls that scripts create at run time are not in the markup; the browser QA (`bun run qa`) covers those.

export type LintRule = "anchor" | "duplicate_id" | "control_name" | "hook"
export type LintIssue = { rule: LintRule; id: string }

type Tag = {
  name: string
  attrs: Record<string, string>
  start: number
  end: number
  close: boolean
}

const VOID = new Set([
  "input",
  "img",
  "br",
  "hr",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "source",
  "track",
  "wbr",
])
const TAG_RE = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g
const ATTR_RE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g

function attrsOf(src: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of src.matchAll(ATTR_RE))
    out[(m[1] as string).toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ""
  return out
}

/** The page without script, style and comment bodies (their text is not markup). */
function markupOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>")
}

function tagsOf(markup: string): Tag[] {
  const out: Tag[] = []
  for (const m of markup.matchAll(TAG_RE))
    out.push({
      name: (m[2] as string).toLowerCase(),
      attrs: attrsOf(m[3] as string),
      start: m.index as number,
      end: (m.index as number) + m[0].length,
      close: m[1] === "/",
    })
  return out
}

/** The text between an opening tag and its closing tag, without elements marked `aria-hidden="true"`. */
function innerText(markup: string, tags: Tag[], at: number): string {
  const open = tags[at] as Tag
  let depth = 1
  let hiddenDepth = 0
  let text = ""
  let cursor = open.end
  for (let i = at + 1; i < tags.length && depth > 0; i++) {
    const t = tags[i] as Tag
    if (hiddenDepth === 0) text += markup.slice(cursor, t.start)
    cursor = t.end
    if (VOID.has(t.name)) {
      if (!t.close && hiddenDepth === 0 && t.name === "img")
        text += ` ${t.attrs.alt ?? ""} `
      continue
    }
    if (!t.close) {
      depth++
      if (hiddenDepth > 0 || t.attrs["aria-hidden"] === "true") hiddenDepth++
    } else {
      if (hiddenDepth > 0) hiddenDepth--
      depth--
    }
  }
  return text
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const INTERACTIVE = new Set([
  "button",
  "select",
  "textarea",
  "summary",
  "input",
  "a",
])

/** Lint one built page. `hooks` are the `data-hook` names that have a registered handler. Empty result = clean. */
export function lintPage(html: string, hooks: readonly string[]): LintIssue[] {
  const markup = markupOf(html)
  const tags = tagsOf(markup)
  const issues: LintIssue[] = []
  const ids = new Map<string, number>()
  for (const t of tags)
    if (!t.close && t.attrs.id !== undefined)
      ids.set(t.attrs.id, (ids.get(t.attrs.id) ?? 0) + 1)

  for (const [id, n] of ids)
    if (n > 1) issues.push({ rule: "duplicate_id", id })

  const named = new Set<string>()
  tags.forEach((t, i) => {
    if (t.close) return
    // anchors
    if (
      t.name === "a" &&
      t.attrs.href !== undefined &&
      t.attrs.href.startsWith("#")
    ) {
      const target = t.attrs.href.slice(1)
      if (
        target === "" ||
        (!ids.has(target) &&
          !tags.some((x) => x.name === "a" && x.attrs.name === target))
      )
        issues.push({ rule: "anchor", id: target === "" ? "#" : target })
    }
    // hooks
    const hook = t.attrs["data-hook"]
    if (hook !== undefined && !hooks.includes(hook))
      issues.push({ rule: "hook", id: hook })
    // accessible names
    const role = t.attrs.role
    const interactive =
      (INTERACTIVE.has(t.name) &&
        !(t.name === "a" && t.attrs.href === undefined) &&
        !(t.name === "input" && t.attrs.type === "hidden")) ||
      role === "button" ||
      role === "link"
    if (!interactive) return
    const label = (t.attrs["aria-label"] ?? "").trim()
    const by = (t.attrs["aria-labelledby"] ?? "").split(/\s+/).filter(Boolean)
    let ok =
      label !== "" ||
      by.some((b) => ids.has(b)) ||
      (t.attrs.title ?? "").trim() !== ""
    if (!ok && t.name === "input") {
      const type = t.attrs.type ?? "text"
      if (["submit", "button", "reset"].includes(type))
        ok = (t.attrs.value ?? "").trim() !== ""
      else if (type === "image") ok = (t.attrs.alt ?? "").trim() !== ""
      else {
        const id = t.attrs.id
        ok = tags.some(
          (l, k) =>
            !l.close &&
            l.name === "label" &&
            id !== undefined &&
            l.attrs.for === id &&
            innerText(markup, tags, k) !== "",
        )
        if (!ok)
          // a wrapping label
          ok = tags.some((l, k) => {
            if (l.close || l.name !== "label" || l.start > t.start) return false
            let depth = 1
            for (let j = k + 1; j < tags.length; j++) {
              const x = tags[j] as Tag
              if (VOID.has(x.name)) {
                if (x === t) return innerText(markup, tags, k) !== ""
                continue
              }
              depth += x.close ? -1 : 1
              if (depth === 0) return false
            }
            return false
          })
      }
    } else if (!ok && t.name === "select" && t.attrs.id !== undefined) {
      const id = t.attrs.id
      ok = tags.some(
        (l, k) =>
          !l.close &&
          l.name === "label" &&
          l.attrs.for === id &&
          innerText(markup, tags, k) !== "",
      )
    } else if (!ok && t.name === "textarea" && t.attrs.id !== undefined) {
      const id = t.attrs.id
      ok = tags.some(
        (l, k) =>
          !l.close &&
          l.name === "label" &&
          l.attrs.for === id &&
          innerText(markup, tags, k) !== "",
      )
    } else if (!ok && !VOID.has(t.name)) ok = innerText(markup, tags, i) !== ""
    if (!ok) {
      const what = `${t.name}${t.attrs.id ? `#${t.attrs.id}` : t.attrs.class ? `.${t.attrs.class.split(/\s+/)[0]}` : `@${t.start}`}`
      if (!named.has(what)) issues.push({ rule: "control_name", id: what })
      named.add(what)
    }
  })
  return issues
}

/** The `data-hook` names the page scripts select: a hook counts as registered when a script mentions `data-hook="name"` (or `[data-hook=name]`). */
export function registeredHooks(...scripts: string[]): string[] {
  const out = new Set<string>()
  for (const s of scripts)
    for (const m of s.matchAll(/data-hook\s*=\s*\\?["']?([\w-]+)/g))
      out.add(m[1] as string)
  return [...out]
}
