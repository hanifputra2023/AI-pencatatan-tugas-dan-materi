# Implementasi Fitur Scan Foto Materi & AI Smart Rewrite pada Study Note

Fitur ini memungkinkan pengguna untuk memotret papan tulis, buku teks, slide kuliah, atau catatan tulisan tangan, kemudian dianalisis oleh AI (Google Gemini Multimodal Vision) untuk secara otomatis dituliskan kembali (*smart rewrite*) ke dalam editor catatan belajar dengan struktur Markdown yang rapi.

## User Review Required

> [!IMPORTANT]
> Fitur ini menggunakan kapabilitas **Gemini Multimodal Vision** yang sudah terintegrasi pada aplikasi. Pengguna dapat memilih foto dari galeri atau langsung menggunakan kamera, serta memilih mode ekstraksi (*Smart Rewrite Catatan*, *OCR Salin Persis*, atau *Rangkum Intisari*).

## Proposed Changes

---

### 1. Utility Layer (`src/lib/imageCompressor.ts`)
#### [MODIFY] [imageCompressor.ts](file:///c:/xampp/htdocs/program%20AI%20bot/src/lib/imageCompressor.ts)
- Tambahkan dan ekspor fungsi `uriToBase64` lintas platform (Web & Native iOS/Android via `expo-file-system`) agar bisa digunakan bersama oleh semua screen.

---

### 2. Study Note Detail & Editor (`src/screens/StudyNoteDetailScreen.tsx`)
#### [MODIFY] [StudyNoteDetailScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/StudyNoteDetailScreen.tsx)
- Tambahkan tombol **"📷 Scan Foto Materi (AI)"** di header input editor dan di area *Studio Fitur AI Pintar*.
- Buat Modal Interaktif **"Scan & Rewrite Materi AI"**:
  - Pilihan sumber gambar: **Kamera** (Ambil Foto Langsung) atau **Galeri** (Pilih Foto).
  - Pratinjau foto terpilih dengan tombol ganti/hapus.
  - Pilihan Mode AI Rewrite:
    1. **✨ Smart Note Rewrite (Rekomendasi)**: Mengubah materi di foto menjadi catatan terstruktur rapi (Heading, Bullet Points, Bold Terminology, Rumus).
    2. **📋 OCR Transkripsi Persis**: Menyalin teks secara harfiah apa adanya.
    3. **📌 Rangkuman Intisari**: Meringkas poin-poin esensial dari materi foto.
  - Kolom instruksi tambahan opsional (misal: *"Fokus jelaskan rumus no 3"*).
  - Integrasi pemanggilan `sendMessageToGemini` dengan attachment gambar (base64) & prompt akademik terarah.
  - Review hasil analisis AI sebelum dimasukkan:
    - Opsi **"Terapkan (Ganti Isi)"**
    - Opsi **"Tambahkan ke Bawah (Append)"** jika catatan sudah ada isinya.
    - Otomatis mengisi Judul Catatan dan mencocokkan Mata Kuliah jika masih kosong.

---

### 3. Study Notes Home / List (`src/screens/StudyNotesScreen.tsx`)
#### [MODIFY] [StudyNotesScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/StudyNotesScreen.tsx)
- Tambahkan tombol pintas cepat **"📷 Scan Foto"** di bagian atas tab Catatan, sehingga pengguna dapat langsung membuat catatan baru dari hasil foto sekali klik.

---

## Verification Plan

### Manual Verification
1. **Buka Editor Catatan (Buat Baru)**:
   - Klik tombol **"📷 Scan Foto Materi (AI)"**.
   - Pilih foto materi/buku/papan tulis dari galeri atau kamera.
   - Pilih mode *Smart Note Rewrite* dan klik **"Mulai Analisis"**.
   - Verifikasi hasil rewrite tampil rapi dengan Markdown (judul, poin, tebal).
   - Klik **"Terapkan ke Catatan"** dan pastikan kolom teks terisi dengan sempurna serta judul terisi otomatis.
2. **Uji Opsi Append (Tambahkan ke Bawah)**:
   - Tambahkan teks awal, lalu scan foto kedua dan pilih "Tambahkan ke Bawah".
   - Pastikan teks awal tidak terhapus dan materi baru disematkan di bawahnya.
3. **Uji di Web & Mobile Responsiveness**:
   - Pastikan modal scan foto tampil proporsional di layar Desktop, Tablet, dan Mobile.
