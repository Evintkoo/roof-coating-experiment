import {
  type IndonesiaConfig,
  parseIndonesiaConfig,
  parseSites,
  type SiteConfig,
} from "../core/indonesia/series"
import { loadYaml } from "./config"

export const loadSites = (path: string): Promise<SiteConfig[]> =>
  loadYaml(path, "sites", parseSites)

export const loadIndonesiaConfig = (path: string): Promise<IndonesiaConfig> =>
  loadYaml(path, "indonesia", parseIndonesiaConfig)
