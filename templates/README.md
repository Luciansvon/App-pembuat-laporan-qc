# Templates

`catalog.json` memetakan customer ke template bersih `poliform.docx`, `rh.docx`,
dan `default.docx` dengan status READY. Generator menolak template yang tidak ada
atau belum READY. Header, page setup, field PAGE, dan gaya laporan dipertahankan;
isi report selalu berasal dari inspection baru.

DOCX asli POLIFORM dan RH disimpan lokal di `references/` dan di-ignore karena
berisi data/foto QC lama. SHA-256 keduanya tercatat di `docs/report-schema.md`.
Template bersih tidak mengandung isi atau foto historis. Uji Word output terbaru
tercatat di `docs/verification.md`.

