import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  PROXY_TONES,
  proxyBadge,
} from "../../../../src/web/design/molecules/proxyBadge"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R4 ProxyBadge", ["proxy", "scenario", "nominal"])
})

test("everyToneRendersTheFixedWordingInsideABadge", async () => {
  expect([...PROXY_TONES]).toEqual(["proxy", "scenario", "nominal"])
  const words = {
    proxy: "PROXY",
    scenario: "scenario",
    nominal: "nominal only",
  }
  for (const tone of PROXY_TONES) {
    const html = proxyBadge({ tone })
    const els = await elementsOf(html)
    expect(els.map((e) => e.tag)).toEqual(["span", "span"])
    expect(els[0]?.attrs["data-proxy-badge"]).toBe(tone)
    expect(els[1]?.attrs.class).toBe(`tv-badge tv-badge--${tone}`)
    expect(html).toContain(`>${words[tone]}</span>`)
  }
  expect(proxyBadge({ tone: "scenario", label: "ageing scenario" })).toContain(
    ">ageing scenario<",
  )
})

test("aMissingToneIsATypeError", () => {
  // @ts-expect-error a proxy badge must say which caveat it carries
  expectBuildError(() => proxyBadge({}), "ProxyBadge")
})

test("escapesTheLabelF8AndRejectsUnknownToneAndEmptyLabelF7", async () => {
  const els = await elementsOf(proxyBadge({ tone: "proxy", label: XSS }))
  expect(els.map((e) => e.tag)).toEqual(["span", "span"])
  expectBuildError(() => proxyBadge({ tone: "go" as never }), "ProxyBadge")
  expectBuildError(() => proxyBadge({ tone: "proxy", label: " " }), "Badge")
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(MOLECULE_CSS.proxyBadge)
})
