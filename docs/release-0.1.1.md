# Inspectra 0.1.1 desktop beta

Audit dan perbaikan: 11 Oktober 2026. Fokus Windows EXE; Android tetap di luar rilis ini.

## Perbaikan

- Autosave Overview dan Issue menyelesaikan satu request sebelum menyimpan edit berikutnya. Edit baru tetap menahan navigasi sampai request miliknya selesai.
- Setiap draf issue mempunyai status pending sendiri. Menyimpan issue lain tidak membebaskan draf yang gagal. QC dapat memperbaiki, mencoba ulang, atau membatalkan draf tersebut.
- Reload/menutup tab browser meminta konfirmasi selama penyimpanan atau draf masih pending.
- Autosave metadata mempertahankan axis standar di luar L/W/D/H, sesuai kontrak axis yang fleksibel.
- Nomor harian memakai maksimum suffix numerik, sehingga nomor 1000 tidak membuat nomor berikutnya konflik dengan 999.
- PATCH pengukuran menghitung kembali range dari individual readings yang tersimpan. Range manual tidak dapat menyembunyikan reading di luar toleransi.
- Semua payload domain menolak NaN/Infinity. Error validasi berisi lokasi field dan pesan tanpa mengirim ulang input privat atau angka yang tidak bisa diserialisasi.
- UI menampilkan detail error field dan upload; respons error non-JSON pada unduhan mempunyai fallback HTTP yang terbaca.
- Versi backend/frontend menjadi 0.1.1 dan cache shell PWA menjadi v7.

## Bukti lokal

Evidence privat disimpan di `.artifacts/bugfix-2026-10-11/`, di luar Git.

| Pemeriksaan | Evidence | Hasil |
| --- | --- | --- |
| Sebelum perbaikan | `baseline-tests.xml`, `reproduced.log`, `reproduced-json-number.log` | 15 tes lama lolos; tes baru membuktikan konflik nomor, PASS palsu akibat range override, serta nonfinite/string dan raw JSON error |
| Backend final | `backend-tests.xml`, `backend-tests.log` | 25/25; termasuk persistence, foto/report integrity, nomor 999→1000→1001, individual readings, angka tidak valid, stale preview |
| Frontend | `frontend-tests.log`, `frontend-build.log` | 4/4 tes pesan error; TypeScript strict dan Vite production build berhasil |
| Dependency frontend production | `npm-audit.json` | Nol advisory pada dependency production yang diperiksa; bukan audit keamanan seluruh aplikasi |
| Browser autosave | `browser-autosave.json` | Request pertama diberi delay 1,5 detik; edit berikutnya dibuat saat request berjalan. Navigasi tetap terkunci dan edit terbaru tersimpan. Draf issue gagal tetap tersimpan di form meskipun issue kedua sukses |

Starlette memberikan satu deprecation warning untuk TestClient/httpx; tidak ada kegagalan test.
Tidak ada angka coverage yang diklaim karena coverage belum diukur.

## Infrastruktur dan batas penerimaan

DEV-INFRA lokal diperiksa pada `4ebd5df21a9e71d4b19ecfd9e48cfaab79293b67`.
Repository audit dan artifact identity tersedia; generic React/FastAPI build/test serta publisher executable belum tersedia di snapshot itu. Project menggunakan caller hygiene yang sudah ada dan input manifest ke implementasi artifact identity shared, tanpa menyalin workflow shared.

EXE portable tetap beta dan belum ditandatangani digital. Preview persis membutuhkan Microsoft Word pada Windows. Pemeriksaan browser terhadap server paket membuktikan UI/API paket; jendela native WebView2 dan dialog simpan native perlu dipisahkan dari bukti browser. Offline write/replay PWA, Android mandiri, dan device acceptance belum diterima.

Rujukan error contract yang diperiksa: [FastAPI Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/). Konfigurasi download desktop tetap memakai `ALLOW_DOWNLOADS` dari [pywebview API](https://pywebview.flowrl.com/api/).
