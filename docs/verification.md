# Evidence Inspectra v0.1

Pemeriksaan 8 Oktober 2026. Evidence lokal privat dan output tes di-ignore.

| Pemeriksaan | Evidence aktual | Hasil |
| --- | --- | --- |
| Sumber POLIFORM | `docs/evidence/poliform/inventory.json`, `render/render.json` | SHA-256 sumber cocok dengan copy privat; export Word 22 halaman; 121 inline images |
| Sumber RH | `docs/evidence/rh/inventory.json`, `render/render.json` | SHA-256 sumber cocok dengan copy privat; export Word 18 halaman; 97 inline images |
| Dokumen asli | Hash ulang kedua file di Downloads vs `templates/catalog.json` | Cocok; export memakai salinan read-only |
| Struktur header | XML header aktif + pypdf text extraction per halaman | `QC INSPECTION REPORT` ditemukan pada 22/22 + 18/18 halaman |
| Body dan pagination | Contact sheets seluruh halaman + full-page inspection p1, p11–18 RH, p17/21/22 POLIFORM | Pola foto dua kolom dan tabel ISSUE/CAUSE/REPAIR/CAP terlihat; split issue RH p11/p12, p15/p16, p16/p17 dicatat |
| Backend/API | `.artifacts/backend-tests.xml`, perintah `pytest tests -q` | 8/8 lulus: migration, SQLite restart persistence, CRUD, upload validasi, delete confirmation, revision, review, report byte-identical, foto tunggal dan caption antar pasangan |
| Frontend | `npm run build` di `frontend/` | TypeScript strict dan Vite production build lulus, 20 modul |
| Browser alur kerja | Playwright CLI pada `http://127.0.0.1:8000/` | Buat customer/produk/inspection, PO autosave, foto dua section, issue/preset, review dan download DOCX teruji. Delete inspection uji juga kembali ke daftar tanpa 404 |
| DOCX POLIFORM baru | `.artifacts/report-qa/poliform-sample.docx`, `poliform-issue-render/render.json`, `page-3.png` | Word COM membuka 3 halaman; tabel Gap satu baris judul, enam foto 2×3, CAUSE/REPAIR/CAP satu tabel pada halaman 3 |
| DOCX RH baru | `.artifacts/report-qa/rh-sample.docx`, `rh-issue-render/render.json`, `page-3.png` | Word COM membuka 3 halaman; tabel enam foto dan CAP tetap satu halaman |
| Struktur ISSUE | `tests/test_workflow.py` | Lima row luar, photo row merged, enam drawing, label footer benar |
| PWA desktop | Playwright CLI di origin produksi 8127, service worker cache `qc-report-shell-v3` | Setelah server dihentikan dan browser disetel offline, reload merender shell; JS/CSS punya `workerStart > 0`, UI menampilkan status terputus tanpa angka laporan palsu |
| Runtime | `GET /api/health` pada 8000 | HTTP 200, SQLite connected, inspections/docx true; `offline_pwa=false` dengan sengaja |

Bundled `render_docx.py` gagal karena `soffice.exe` tidak ada di PATH Windows;
fallback read-only Word COM + PDFium menghasilkan halaman yang benar-benar dilihat.
`tools/render_reference.ps1` membuka input read-only dan memverifikasi hash tetap.
Foto QA pada sampel adalah fixture sintetis. Jumlah foto dan pcs pada laporan
nyata harus berasal dari inspeksi yang diisi QC; generator tidak menyalin gambar
atau jumlah temuan dari dokumen lama.

Temuan dari tools: `fastapi==0.142.2`, `sqlmodel==0.0.48`, `alembic==1.20.0`,
`vite==8.3.3`, `typescript==7.0.2`, `react==19.3.0`. npm registry dan resolver
Python diperiksa pada 7 Oktober 2026; package-lock serta requirements.lock adalah
pin aktual. Warnings pytest: Starlette menandai integrasi TestClient/httpx deprecated;
hasil 8 test tetap PASS dalam scope ini.

Shared DEV-INFRA repository audit telah dijalankan lokal terhadap commit awal:
`.artifacts/shared-audit/result.json` berisi `status=pass`, `dirty=false`,
79 file diperiksa, 3 tautan lokal, dan nol temuan. Caller workflow di proyek
memakai reusable workflow DEV-INFRA pada SHA yang sama dengan `infra-ref`;
implementasi shared tidak disalin. Audit ini hanya higiene repo; tes aplikasi
dan verifikasi Word tetap bukti terpisah. Run hosted
[`37729822347`](https://github.com/Luciansvon/App-pembuat-laporan-qc/actions/runs/37729822347)
selesai `success`; artifact yang diunduh berisi `status=pass`, commit `e9e137b`,
`dirty=false`, 80 file, 3 tautan lokal, nol temuan.

PWA pernah dipasang dan dibuka pada emulator MuMu Android 15 dengan `adb reverse`.
Tombol kamera memanggil kamera native, tetapi frame kamera abu-abu dan tidak ada
foto tersimpan. Ini tidak membuktikan APK mandiri, capture selesai, HTTPS LAN,
offline edit/replay atau ketahanan setelah restart HP. Tanpa server, shell PWA
tampil tetapi form dan data perlu server lokal. `offline_pwa=false` tetap akurat.

## Uji layout, preview dan tombol pada 8 Oktober 2026

| Pemeriksaan | Bukti lokal | Hasil |
| --- | --- | --- |
| DOCX enam foto dengan tiga caption | `.artifacts/qa-six-caption-page.jpg`, fixture `pytest-24` | Word COM menghasilkan 2 halaman; enam foto, tiga caption terpusat, CAUSE/REPAIR/CAP dan conclusion tetap pada halaman issue |
| DOCX foto tunggal dan Drawing + Dimension | `.artifacts/preview-one-photo.jpg`, `.artifacts/preview-combined.jpg` | Foto tunggal terpusat; Drawing dan Dimension satu bingkai, caption tepat setelah pasangan foto |
| Endpoint preview | POST preview dan GET halaman terhadap database fixture | HTTP 200, page_count 2, JPEG halaman pertama terbaca; revisi divalidasi |
| UI dev dan EXE | Browser pada port 5173 dan EXE pada 8765 | Tab, foto penuh, tambah customer/produk/inspeksi, unggah, caption, validasi, preview, navigasi halaman, unduh DOCX memberi hasil terlihat; error console browser kosong |
| EXE Inspectra dengan ikon pengguna | `.artifacts/desktop/Inspectra.exe`, SHA-256 `980045BC200C2949294A9330B688B6912FFCA7D4BF5617F5DB68E4CA0A298ED7` | Build PyInstaller 40,103,045 byte; health SQLite connected; aplikasi bernama Inspectra, unggah foto dan preview Word 1 halaman teruji pada database QA terpisah. |

Pembersihan temporary audit tambahan pada dokumen Issue Baru ditolak oleh automatic
approval review untuk aksi hapus. Hanya `docs/evidence/additional-issues/` yang
tersisa secara lokal dan di-ignore; schema dan konfigurasi menggunakan RH.
