export type Level = "debug" | "info" | "warn" | "error"
export type EventSink = (
  event: string,
  level: Level,
  fields: Record<string, string | number | boolean>,
) => void

let sink: EventSink | null = null

export function setEventSink(s: EventSink | null): void {
  sink = s
}

/** No-op when no sink is installed; hosts (node logger, browser ring buffer) install one. */
export function emitEvent(
  event: string,
  level: Level,
  fields: Record<string, string | number | boolean>,
): void {
  sink?.(event, level, fields)
}
