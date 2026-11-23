// Plan 07 Task 1, FR-2 and H2: the page lint fails on each seeded defect (F1 to F4) and is clean on the real page.
import { expect, test } from "bun:test"
import { cpSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SpandekError } from "../../../src/core/errors"
import { buildReport, EXTRA_SECTIONS } from "../../../src/node/report/html"
import { lintPage, registeredHooks } from "../../../src/node/report/lint"
import { COMPONENT_SCRIPT } from "../../../src/web/design/scripts"
import { REPORT_FIXTURE, reportOpts } from "../../helpers"
import { qaReport } from "../../support/qaPage"

const page = (body: string) =>
  `<!doctype html><html><body><main id="main">${body}</main></body></html>`

test("lintFailsOnSeededDefects", () => {
  // F1 a dead anchor, and a bare "#"
  expect(
    lintPage(page('<a href="#nowhere">x</a><h2 id="a">A</h2>'), []),
  ).toEqual([{ rule: "anchor", id: "nowhere" }])
  expect(lintPage(page('<a href="#">x</a>'), [])).toEqual([
    { rule: "anchor", id: "#" },
  ])
  // F2 duplicate ids
  expect(lintPage(page('<h2 id="a">A</h2><h2 id="a">B</h2>'), [])).toEqual([
    { rule: "duplicate_id", id: "a" },
  ])
  // F3 a button with no text and no aria-label, an empty link, an unlabelled input and select
  expect(lintPage(page('<button type="button" id="go"></button>'), [])).toEqual(
    [{ rule: "control_name", id: "button#go" }],
  )
  expect(
    lintPage(
      page('<a href="/x"><span aria-hidden="true">x</span></a>'),
      [],
    ).map((i) => i.rule),
  ).toEqual(["control_name"])
  expect(
    lintPage(
      page('<input type="text" id="t"><select id="s"></select>'),
      [],
    ).map((i) => i.rule),
  ).toEqual(["control_name", "control_name"])
  // F4 a data-hook with no handler
  expect(lintPage(page('<div data-hook="spin"></div>'), [])).toEqual([
    { rule: "hook", id: "spin" },
  ])
  expect(lintPage(page('<div data-hook="spin"></div>'), ["spin"])).toEqual([])
})

test("lintAcceptsNamedControls", () => {
  const ok = page(
    `<h2 id="h">H</h2><a href="#h">to H</a><button type="button">Go</button><button type="button" aria-label="Close"><svg></svg></button>
<label for="a">Name</label><input id="a" type="text"><label>Other <input type="number"></label><input type="hidden" name="z">
<select id="s" aria-label="Pick"><option>1</option></select><details><summary>More</summary>x</details><button aria-labelledby="h"></button>`,
  )
  expect(lintPage(ok, [])).toEqual([])
})

test("lintCleanOnRealPage", async () => {
  const { html } = await qaReport()
  const hooks = registeredHooks(COMPONENT_SCRIPT)
  expect(lintPage(html, hooks)).toEqual([])
  // not vacuous: the same page with one defect each reports exactly that defect
  const seeded = (from: string, to: string) => {
    expect(html).toContain(from)
    return html.replace(from, to)
  }
  expect(lintPage(seeded('href="#verdict"', 'href="#nowhere"'), hooks)).toEqual(
    [{ rule: "anchor", id: "nowhere" }],
  )
  expect(
    lintPage(seeded('<main id="main"', '<main id="theme-toggle"'), hooks).map(
      (i) => i.rule,
    ),
  ).toContain("duplicate_id")
  expect(
    lintPage(
      seeded("</main>", '<button type="button"></button></main>'),
      hooks,
    ).map((i) => i.rule),
  ).toEqual(["control_name"])
  expect(
    lintPage(seeded("</main>", '<i data-hook="zzz"></i></main>'), hooks),
  ).toEqual([{ rule: "hook", id: "zzz" }])
})

test("registeredHooksAreTheOnesTheScriptsSelect", () => {
  expect(
    registeredHooks(
      'document.querySelector("[data-hook=\\"spin\\"]"); x.closest(\'[data-hook="stop"]\')',
    ),
  ).toEqual(["spin", "stop"])
  expect(registeredHooks("nothing here")).toEqual([])
})

// F1 to F4 through the real build: exit 4, phase report.lint, key = the rule
const seedSection = (html: string) => ({
  id: "seed",
  title: "Seed",
  order: 999,
  render: () =>
    `<section id="seed" class="page-section"><h2>Seed</h2>${html}</section>`,
  data: () => null,
})

test("buildExits4OnEachSeededDefect", async () => {
  const seeds: [string, string][] = [
    ['<a href="#nowhere">dead</a>', "anchor"],
    ['<p id="main">dup</p>', "duplicate_id"],
    ['<button type="button"></button>', "control_name"],
    ['<span data-hook="orphan"></span>', "hook"],
  ]
  for (const [html, rule] of seeds) {
    const run = mkdtempSync(join(tmpdir(), "lint-run-"))
    cpSync(REPORT_FIXTURE, run, { recursive: true })
    EXTRA_SECTIONS.push(seedSection(html))
    try {
      let err: unknown
      try {
        await buildReport(run, join(run, "report.html"), reportOpts())
      } catch (e) {
        err = e
      }
      expect(err, rule).toBeInstanceOf(SpandekError)
      expect((err as SpandekError).code).toBe(4)
      expect((err as SpandekError).phase).toBe("report.lint")
      expect((err as SpandekError).key).toBe(rule)
    } finally {
      EXTRA_SECTIONS.pop()
    }
  }
}, 120_000)
