import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { basename } from "node:path"
import { parse } from "yaml"
import {
  type MaterialRanges,
  type Materials,
  parseMaterialRanges,
  parseMaterials,
  parseWeather,
  type WeatherConfig,
} from "../core/config"
import { ConfigError, DataError } from "../core/errors"
import { emit } from "./logging"

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch {
    throw new DataError(path, "config file missing or unreadable")
  }
}

async function loadYaml<T>(
  path: string,
  kind: string,
  parseFn: (raw: unknown) => T,
): Promise<T> {
  const text = await readText(path)
  let raw: unknown
  try {
    raw = parse(text)
  } catch {
    throw new ConfigError(path, "YAML syntax error")
  }
  const cfg = parseFn(raw)
  const n_constants =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? Object.keys(raw).length
      : 0
  emit("config.loaded", "info", {
    kind,
    path: basename(path),
    n_constants,
    sha256: createHash("sha256").update(text).digest("hex"),
  })
  return cfg
}

export const loadMaterialRanges = (path: string): Promise<MaterialRanges> =>
  loadYaml(path, "material_ranges", parseMaterialRanges)

export const loadMaterials = (path: string): Promise<Materials> =>
  loadYaml(path, "materials", parseMaterials)

export const loadWeather = (path: string): Promise<WeatherConfig> =>
  loadYaml(path, "weather", parseWeather)

/** SHA-256 (hex) over the raw bytes of the files, in the given order. */
export async function configSha256(paths: readonly string[]): Promise<string> {
  const h = createHash("sha256")
  for (const p of paths) {
    try {
      h.update(await readFile(p))
    } catch {
      throw new DataError(p, "config file missing or unreadable")
    }
  }
  return h.digest("hex")
}
