# tests/corpus/id-photo — sources

Test inputs for the /id-photo/ regression harness and e2e (brief Step 4 "Corpus"). Never shipped (check-dist
asserts it). Allowed sources only: US federal-government works (public domain) and Commons CC0/PD-self. Every
file below is a US House official portrait or a NASA portrait, public domain as a work of the US federal
government, taken from Wikimedia Commons (the spike corpus, spikes/photo/corpus/SOURCES.json).
Transform: EXIF orientation applied, long edge ≤ 1,200 px (Pillow 12.2.0, LANCZOS), JPEG q88 (lower only if a
file would exceed 220 KB). truth.json holds the manual annotations of the spike, scaled to these files.

| File | Page | License | Author | Transform |
|---|---|---|---|---|
| `p01.jpg` | https://commons.wikimedia.org/wiki/File:Pete_Aguilar_117th_congress.jpeg | Public domain | House Creative Services, Franmarie Metzler | 3200×4000 → 960×1200, lanczos, JPEG q88 (182,743 B) |
| `p02.jpg` | https://commons.wikimedia.org/wiki/File:Colin_Allred,_official_portrait,_117th_Congress.jpg | Public domain | Ike Hayman | 3350×4185 → 961×1200, lanczos, JPEG q88 (165,298 B) |
| `p03.jpg` | https://commons.wikimedia.org/wiki/File:Don_Bacon_117th_Congress.jpg | Public domain | US House of Representatives | 3360×4200 → 960×1200, lanczos, JPEG q88 (186,411 B) |
| `p04.jpg` | https://commons.wikimedia.org/wiki/File:Stephanie_Bice_117th_U.S_Congress.jpg | Public domain | House Creative Committee | 3360×4200 → 960×1200, lanczos, JPEG q86 (217,348 B) |
| `p05.jpg` | https://commons.wikimedia.org/wiki/File:Lauren_Boebert_117th_U.S_Congress.jpg | Public domain | House Creative Services | 2080×2600 → 960×1200, lanczos, JPEG q86 (208,914 B) |
| `p06.jpg` | https://commons.wikimedia.org/wiki/File:Sanford_Bishop_117th_Congress.jpg | Public domain | House Creative Services | 1638×2048 → 960×1200, lanczos, JPEG q88 (197,945 B) |
| `p07.jpg` | https://commons.wikimedia.org/wiki/File:Andre_Douglas_white_background.jpg | Public domain | NASA crew office | 2457×3276 → 900×1200, lanczos, JPEG q88 (148,955 B) |
| `p08.jpg` | https://commons.wikimedia.org/wiki/File:Christopher_Williams_white_background.jpg | Public domain | NASA crew office | 2560×3413 → 900×1200, lanczos, JPEG q88 (120,739 B) |
| `p09.jpg` | https://commons.wikimedia.org/wiki/File:Deniz_Burnham_white_background.jpg | Public domain | NASA crew office | 1572×2097 → 900×1200, lanczos, JPEG q88 (100,854 B) |
| `p10.jpg` | https://commons.wikimedia.org/wiki/File:Jessica_Wittner_white_background.jpg | Public domain | NASA crew office | 2184×3276 → 800×1200, lanczos, JPEG q88 (151,309 B) |
| `p11.jpg` | https://commons.wikimedia.org/wiki/File:Jonny_Kim_official_portrait.jpg | Public domain | Bill Stafford | 3840×4800 → 960×1200, lanczos, JPEG q88 (190,626 B) |
| `p12.jpg` | https://commons.wikimedia.org/wiki/File:Yi_So-yeon_(NASA_-_JSC2008-E-004174).jpg | Public domain | This image or video was catalogued by Lyndon B. Johnson Space Center of the United States National Aeronautics and Space | 1600×1750 → 1097×1200, lanczos, JPEG q88 (206,860 B) |

Total: 2,078,002 B (cap 2.5 MB; each ≤ 220 KB).
