import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { DataError } from "../core/errors"
import { parseG173, parseNk } from "../core/literature"
import { type ModelContext, makeWlGrid } from "../core/pipeline/context"
import {
  loadControls,
  loadMaterialRanges,
  loadMaterials,
  loadWeather,
} from "./config"
import { verifyData } from "./data"

async function readData(dir: string, name: string): Promise<string> {
  try {
    return await readFile(join(dir, name), "utf8")
  } catch {
    throw new DataError(name, "data file missing or unreadable")
  }
}

/** Verify the literature data, then load every config and table the models need. */
export async function loadContext(
  configDir: string,
  dataDir: string,
): Promise<ModelContext> {
  await verifyData(dataDir)
  const mat = await loadMaterials(join(configDir, "materials.yaml"))
  const weather = await loadWeather(join(configDir, "weather_scenarios.yaml"))
  const ranges = await loadMaterialRanges(
    join(configDir, "material_ranges.yaml"),
  )
  const controls = await loadControls(join(configDir, "controls.yaml"))
  const g173 = parseG173(await readData(dataDir, "g173_global_tilt.csv"))
  const tio2 = parseNk(await readData(dataDir, "tio2_nk.csv"))
  const baso4 = {
    wl_um: Float64Array.of(0.3, 2.5),
    n: Float64Array.of(mat.baso4.n.value, mat.baso4.n.value),
    k: Float64Array.of(0, 0),
  }
  return {
    mat,
    weather,
    ranges,
    g173,
    tio2,
    baso4,
    wlUm: makeWlGrid(),
    controls,
  }
}
