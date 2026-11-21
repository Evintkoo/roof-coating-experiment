# Plan 04 spikes: Q1-Q4 answers (Indonesian weather data sources)

Date 2026-11-21. Real requests made from this machine; saved samples (small only) are in `docs/spikes/plan-04/`. Wording:

- **read**: the page or response was opened and the value quoted from it.
- **measured**: obtained by a real request or file download in this spike.
- **not documented**: the official page does not say; any statement is an observation, not a citation.

All requests used a generic User-Agent (`roof-coating-research-client/1.0`), no `user=` parameter, no personal data.

## Verdict in one paragraph

Q1, Q3 and Q4 pass. **Q2 fails as the plan states it**: the two IWEC2 files are not on climate.onebuilding.org (it hosts TMYx, not IWEC2), and IWEC2 itself is an ASHRAE-copyrighted, paid dataset. A free, current, same-format alternative (TMYx 2011-2025, EPW) exists for all five sites. The plan says "if a Q fails, stop and report, no fallback on a guess"; nothing downstream of Task 2 is built here, and the decision is Evint's (see "Decision needed" at the end). Tasks 2 and 3 do not depend on it.

## Q1: NASA POWER hourly API

**Endpoint (measured, HTTP 200).** `GET https://power.larc.nasa.gov/api/temporal/hourly/point` with `parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_LW_DWN,T2M,RH2M,WS2M,PRECTOTCORR`, `community=RE`, `latitude`, `longitude`, `start=YYYYMMDD`, `end=YYYYMMDD`, `format=JSON`, `time-standard=utc`. Service version `v2.10.5` (response header `x-app-version`, `header.api.version`); sources `MERRA2`, `SYN1DEG`, `POWER`. OpenAPI saved as `power_hourly_openapi.json` (parameters: `start end latitude longitude community parameters format units(default metric) user header time-standard(default lst) site-elevation wind-elevation wind-surface`). A 6-parameter request is within the documented cap of 15 parameters (read, docs page).

**Response shape (measured).** GeoJSON `Feature`: `geometry.coordinates = [lon, lat, elevation_m]`; `properties.parameter.<NAME>.<YYYYMMDDHH> = number`; `header {title, api, sources, fill_value, time_standard, start, end}`; `parameters.<NAME> {units, longname}`; `messages []`. Samples: `power_jakarta_2023-01-01_02_lst.json` (48 h, all six parameters, default LST), `power_jakarta_2023-01-01_utc_sw_t2m.json`.

**Units (measured, from `parameters` in the response).** `ALLSKY_SFC_SW_DWN` and `ALLSKY_SFC_LW_DWN`: `Wh/m^2` per hour, which equals the hourly mean in W/m^2 (one hour, so a factor of 1). `T2M` C, `RH2M` %, `WS2M` m/s, `PRECTOTCORR` mm/hour. Sanity: Jakarta LW 400-420 W/m^2 gives `T_sky = (LW/sigma)^0.25 = 291-293 K`, plausible against T2M 26 C. Ten-year ranges at all sites: SW 0-1072 W/m^2, LW 326-516, RH 28-100, WS2M 0-8.3.

**Time standard (measured + read).** Docs (read): "The Hourly API provides two different time standards Universal Time Coordinated (UTC) and Local Solar Time (LST)" and "Hourly API defaults to providing LST"; LST is built on the fly from the UTC archive with an offset from the 15-degree longitude band and "may not match the actual local time zone". Selection: query parameter `time-standard=utc` or `lst` (invalid value returns HTTP 422 `Input should be 'lst' or 'utc'`; case-insensitive in practice, both `UTC` and `utc` were accepted). **The default is LST, so the request must name `utc` explicitly** (the plan's risk row). Measured for 2023-01-01..03, all five sites: the LST series equals the UTC series shifted by a whole number of hours, **LST = UTC + 7 for Jakarta, Surabaya, Medan, Bandung and UTC + 8 for Makassar** (file `power_site_grid_points.json`). That equals the plan's D1 offsets (WIB +7, WITA +8) for all five sites, including Surabaya (112.75 E, near the band edge). Decision: always request UTC and cut local days with the fixed D1 offset; LST is not used.

**Hour label convention: not documented** (the docs page says nothing on start versus centre of the hour). Observation only: the irradiance-weighted mean hour of the diurnal GHI curve, taken with the label as hour start, lies within about 0.5 to 1.5 h of local solar noon at all five sites, so the label is consistent with hour-start or hour-centre within the noise of tropical cloud. The H1 tolerance (clear-day peak within 3 h of solar noon) covers either reading. Check on the full ten-year data over all five sites: 730 clear days per site (daily GHI above the 80th percentile), **0 of them with the GHI peak more than 3 h from solar noon**.

**Fill value (measured).** `header.fill_value = -999.0`. Zero fill values occurred in the ten-year pulls (see Q3), so the fill-value branch of the validator is exercised only by the fault test F1.

**Maximum request span (measured).** JSON: **5 years succeeds** (about 4.9 MB, 3.3 s), **6 years fails** with HTTP 422 `"please shorten your requested time extent for a JSON formatted data request"`; 10 years fails the same way. The docs page states no extent limit (not documented). Plan chunking by calendar year is safe (about 1 MB, 2.5 s per site-year, 50 site-years about 2-3 min plus sleeps).

**Rate limits (not documented, measured).** The docs state none. About 30 requests in this spike (spaced 1-2 s apart, three of them 4.9 MB) were never throttled (no 429, no `Retry-After`). Plan: sleep at least 1 s between requests, one request at a time, retry with backoff on 5xx and 429.

**Returned grid point and elevation (measured, 2023-01-01).** The API returns the requested lat/lon unchanged and an elevation from its own grid cell:

| Site | Requested lat, lon | Returned elevation (m) | TMYx airport elevation (m) |
|---|---|---|---|
| Jakarta | -6.20, 106.85 | 12.32 | 10.4 |
| Surabaya | -7.25, 112.75 | 18.05 | 3.0 |
| Medan | 3.59, 98.67 | 173.90 | 34.7 (Kualanamu) |
| Makassar | -5.15, 119.43 | 100.99 | 14.3 |
| Bandung | -6.91, 107.61 | 921.68 | 740.0 |

The plan's Bandung 768 m differs from the API's 921.68 m (MERRA-2 grid-cell mean terrain); Medan 173.9 m and Makassar 101 m are also well above the city level (the site sits next to the hills). **Consequence for Task 2:** `sites.yaml` `elevation_m` holds the value the API returned (status `measured` in a comment: it is the elevation of the data, which is what the T2M belongs to), not a city elevation. Medan and Makassar T2M may read a little cool and Bandung about 1-2 K cool against the city; this is recorded as a limit, not corrected (no lapse correction is built).

**Edge effect found for Task 4.** The archive is cut at UTC midnight, so the first local day of 2015 (starts 17:00 UTC on 2014-12-31) and the last (ends 2025-01-01 local) are incomplete: 3652 complete local days of 3654 touched. Plan Task 4 says `localDays` raises `DataError` on an incomplete day; at the series boundary that would fail every run. Either `fetchSiteYear` pads the request with the neighbouring days (fetch 2014-12-31 and 2025-01-01 as well) or `localDays` drops only a partial day at the very start and end of the series (an interior hole stays an error, F2). Task 4 text needs that sentence.

**Licence and attribution (read).** The POWER "Referencing" page states no data licence and no fair-use policy. Required: acknowledge "National Aeronautics and Space Administration (NASA)" and the "Prediction Of Worldwide Energy Resources (POWER)" project; cite service name, version and access date with the template "The data was obtained from the POWER Project's Hourly 2.x.x version on YYYY/MM/DD"; include POWER's Reference and Data Reference; the project asks to be sent a link or reprint of publications and to be told if the data is passed on. This goes in the report footer and in `data/indonesia/SHA256SUMS` provenance (service version `v2.10.5`, access date). The raw cache is gitignored and not redistributed.

## Q2: IWEC2 / EPW cross-check sources

**Failed as stated.** The Indonesia index `https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/IDN_Indonesia/index.html` (measured, HTTP 200, 137 KB) lists only **TMYx** files; a search of every link for `iwec`, `IW2`, `CSWD` finds nothing. The names in the plan (`IDN_JAKARTA-SOEKARNO-HA_967490_IW2`, `IDN_SURABAYA-JUANDA_969350_IW2`) come from a 2016 mailing-list post (secondary): the IWEC2 files exist with those station ids (WMO 967490, 969350, one of 29 Indonesian IWEC2 locations) but are **sold by ASHRAE through White Box Technologies and are ASHRAE-copyrighted** (secondary: ASHRAE bookstore page and list post). No free download was found. The site's own "Sources" page confirms the dataset it hosts is TMYx.

**What exists (measured, files downloaded, HTTP 200, 385-458 KB zips, each with `.epw .stat .ddy .clm .pvsyst .rain .wea`).** TMYx for all five sites, all with a 2011-2025 variant (also 2009-2023, 2007-2021; Bandung also full-period):

| Site | File (under `.../IDN_Indonesia/`) | WMO | EPW lat, lon, tz, elev |
|---|---|---|---|
| Jakarta | `JW_Jawa/IDN_JW_Jakarta-Soekarno-Hatta.Intl.AP.967490_TMYx.2011-2025.zip` | 967490 | -6.1255, 106.659, +7, 10.4 m |
| Surabaya | `JW_Jawa/IDN_JW_Surabaya-Juanda.Intl.AP.969350_TMYx.2011-2025.zip` | 969350 | -7.3747, 112.782, +7, 3.0 m |
| Medan | `SM_Sumatera/IDN_SM_Medan.Kualanamu.Intl.AP.960350_TMYx.2011-2025.zip` | 960350 | 3.64, 98.879, +7, 34.7 m |
| Makassar | `SL_Sulawesi/IDN_SL_Makassar-Hasanuddin.Intl.AP.971800_TMYx.2011-2025.zip` | 971800 | -5.0711, 119.5522, +8, 14.3 m |
| Bandung | `JW_Jawa/IDN_JW_Bandung-Sastranegara.Intl.AP.967810_TMYx.2011-2025.zip` | 967810 | -6.901, 107.576, +7, 740 m |

(`tmyx_location_lines.txt` holds the five EPW `LOCATION` lines.) Each EPW has 8760 rows; COMMENTS 1 reads "NCEI ISD/ERA5 ... Period of Record=2011-2025". TMYx is built from NOAA ISD station data (temperature, humidity, wind) with **solar radiation taken from the ERA5 reanalysis** (read, Sources page: "solar data ... from the ERA5 reanalysis data set ... courtesy of Oikolab"). **Independence caveat for H2:** the plan's wording "IWEC2, derived from station observations" does not hold for TMYx solar: both NASA POWER (MERRA-2 / SYN1DEG) and TMYx (ERA5) irradiance are modelled fields. H2 would compare two independent model products, not model against ground. It still catches unit, time-standard and unit-conversion errors, which is the practical value, but H2's claim text must say "independent reanalysis", not "station observations".

**Licence (read).** The site and the zips state no licence text (home page: "Copyright 2014-2026 Climate.OneBuilding. All Rights Reserved."; citation request "Lawrie, Linda K, Drury B Crawley. 2026. Development of Global Typical Meteorological Years (TMYx). https://climate.onebuilding.org"). Files are free to download. No redistribution grant was found, so the plan's rule stands: EPW files are fetched at test time and **not committed** (only derived monthly means go in fixtures). The citation is required in the report footer.

**Informal preview of H2 (measured, not a frozen threshold).** Monthly mean daily GHI, NASA 2015-2024 against TMYx 2011-2025 (NASA minus EPW over EPW), twelve months each: Jakarta -0.169 to -0.047; Surabaya -0.124 to +0.006; Medan -0.113 to +0.019; Makassar +0.026 to +0.199; Bandung -0.043 to +0.110. Largest absolute value 0.199 (Makassar, January), below `T_ghi_hard = 0.35`. Makassar is systematically high (+8 to +20 %). A TMY month is one chosen year, so month-level scatter of 10 % is expected. `T_ghi` is still to be frozen from the first real run in Task 5.

## Q3: hourly series for 2015-2024 at all five sites

**Pass (measured).** Ten years per site pulled as two 5-year requests, UTC, all six parameters:

| Site | Rows (T2M) | Expected | Fill -999 (any parameter) | Months with mean precipitation above 150 mm (D2) | Mean daily GHI (kWh/m^2) |
|---|---|---|---|---|---|
| Jakarta | 87672 | 87672 | 0 | 6 (Nov-Apr) | 4.74 |
| Surabaya | 87672 | 87672 | 0 | 6 | 5.20 |
| Medan | 87672 | 87672 | 0 | 6 (Jan, Aug-Dec) | 4.72 |
| Makassar | 87672 | 87672 | 0 | 6 | 5.38 |
| Bandung | 87672 | 87672 | 0 | 10 | 4.95 |

87672 = 3653 days x 24 (leap days 2016, 2020, 2024 present). All five sites have both wet and dry months under D2 (150 mm), so the FR-1 dropped-season path is not triggered on real data; Bandung has only two dry months (Jul, Aug), which leaves few dry-season days (about 620 days over ten years), still enough for 20/80th percentile bins. Medan has no clear dry season (monthly means 79-236 mm; the "dry" label for Feb-Jul is relative); the report must say so. Monthly means per site (mm): Jakarta 303 457 286 218 126 101 76 47 83 148 222 238; Surabaya 355 391 258 215 116 72 39 17 38 83 174 375; Medan 159 105 98 79 137 124 110 162 208 230 224 236; Makassar 365 297 236 178 109 90 54 23 34 116 223 411; Bandung 348 461 418 337 226 152 118 69 168 258 402 331.

## Q4: CRRC pairs of D3 and D4

**Confirmed from manufacturer documents (read, PDFs downloaded and text-extracted with `pdftotext -layout`).** Excerpt in `crrc_quotes.txt`.

| Product | Initial SR | Aged SR | Initial TE | Aged TE | Source and caveat |
|---|---|---|---|---|---|
| APOC 252 Sunwhite | 0.90 | 0.77 | 0.87 | 0.90 | APOC summary brochure 646630 (buildsite.com), CRRC table, right column; column header printed "Initial / Weathered" (not "3-year"); id 0646-0005 |
| APOC 248 Arizona-White | 0.88 | 0.65 | 0.87 | 0.88 | same brochure, left column; also prints 0646-0005, so the id is not trusted to separate the two products (as D4 states) |
| Sikalastic-515 AC | 0.83 | 0.69 (3 Year, White) | 0.90 | 0.91 (3 Year, White) | Sika US product data sheet, ASTM C-1549 (SR), C-1371 (TE); SRI 104 initial, 86 at 3 years; 24 wet mil per coat, system rows list 26 mil as the minimum dry film for a 10-year warranty (that is the warranty system, not necessarily the CRRC test thickness) |

So D3's three pairs are confirmed: 0.83 to 0.69 (-16.9 %), 0.88 to 0.65 (-26.1 %), 0.90 to 0.77 (-14.4 %). The Sikalastic row, flagged "unverified summary" in D4, is now **read from the datasheet**. Two caveats stay: the APOC brochure column is labelled "Weathered" and does not itself say "3-year, three US sites" (the CRRC definition of aged values, read in the CRRC programme manual snippets); the CRRC directory entry itself was not opened (search could not reach it), so the brochure and datasheet are manufacturer literature, not the CRRC record. The range `loss in [0.14, 0.26]` in D3 stands as `literature` for US sites, and the report keeps the line "scenario, not an Indonesian measurement" (BLOCKED-9).

## Decision needed (Evint)

1. **Cross-check source.** Options: (a) use the free TMYx 2011-2025 EPW for all five sites, relabel H2 as an independent-reanalysis cross-check (recommended: free, current, five sites instead of two, same EPW parser); (b) buy IWEC2 for Jakarta and Surabaya from ASHRAE/White Box (paid, two sites, station-derived solar is not guaranteed either); (c) drop H2. Until decided, Tasks 4-5 should not hard-code the file names. Plan text to change: Tech Stack row and `File Structure` (`epw.ts` reads TMYx; test name `crossCheckAgainstIwec2` to `crossCheckAgainstTmyx`), H2 wording, Preflight gate (2) host `climate.onebuilding.org` stays.
2. **Plan text changes found by the spike** (no plan file was edited here): Task 1 creates `docs/spikes/plan-04.md` (not `docs/spike-indonesia.md`, per the instruction of this run); Task 4 `localDays` boundary rule (above); `sites.yaml` elevations are the API grid elevations; `fetch-data` must request `time-standard=utc`, chunk by year, and pad one day each side.

## Sources

- NASA POWER hourly point API and OpenAPI: https://power.larc.nasa.gov/api/temporal/hourly/point , https://power.larc.nasa.gov/api/temporal/hourly/openapi.json
- POWER hourly docs: https://power.larc.nasa.gov/docs/services/api/temporal/hourly/ ; referencing: https://power.larc.nasa.gov/docs/referencing/
- TMYx index and sources: https://climate.onebuilding.org/WMO_Region_5_Southwest_Pacific/IDN_Indonesia/index.html , https://climate.onebuilding.org/sources/default.html
- IWEC2 (secondary): https://www.ashrae.org/technical-resources/bookstore/ashrae-international-weather-files-for-energy-calculations-2-0-iwec2 , https://onebuilding.org/archive-part2/bldg-sim-onebuilding.org/2016-August/002378.html
- APOC 248/252 brochure: https://www.buildsite.com/pdf/apoc/APOC-252-Sunwhite-Premium-Elastomeric-Roof-Coating-Summary-Brochure-646630.pdf
- Sikalastic-515 AC data sheet: https://usa.sika.com/dam/dms/us01/0/sikalastic_-515_ac.pdf
