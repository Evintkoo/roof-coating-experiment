const ctx = self as unknown as Worker
ctx.onmessage = (e: MessageEvent) => {
  ctx.postMessage({ echo: e.data })
}
