# 🚀 Blueprint & Dokumen Implementasi: Hardcore AI Agent Suite
**Aplikasi:** AI Pencatatan Tugas & Materi (Curhat & Study AI)  
**Status Target:** Modular, Additive, Zero-Regression (Aman 100% untuk Fitur Eksisting)  
**Dokumen Referensi:** `implementasi.md`  

---

## 📑 Daftar Isi
1. [Prinsip Arsitektur Zero-Regression (Anti-Rusak)](#1-prinsip-arsitektur-zero-regression-anti-rusak)
2. [Rincian 8 Fitur Hardcore AI Agent](#2-rincian-8-fitur-hardcore-ai-agent)
   - [Fitur 1: 🌐 Web Grounding & Real-Time Fact Checking](#fitur-1--web-grounding--real-time-fact-checking)
   - [Fitur 2: 🗣️ Voice-Driven Action Agent (Gemini Live Integration)](#fitur-2-️-voice-driven-action-agent-gemini-live-integration)
   - [Fitur 3: 🧮 Python Code Execution & Precision Math Sandbox](#fitur-3--python-code-execution--precision-math-sandbox)
   - [Fitur 4: 🕵️‍♂️ Midnight Shadow Agent (Proactive Background Worker)](#fitur-4-️-midnight-shadow-agent-proactive-background-worker)
   - [Fitur 5: 👥 Multi-Agent Debate Panel (Dewan Pakar AI)](#fitur-5--multi-agent-debate-panel-dewan-pakar-ai)
   - [Fitur 6: 📝 AI Hand-Written Exam Grader & Step-by-Step Error Tracer](#fitur-6--ai-hand-written-exam-grader--step-by-step-error-tracer)
   - [Fitur 7: 🧠 Spaced Repetition Memory Agent (Ebbinghaus SM-2)](#fitur-7--spaced-repetition-memory-agent-ebbinghaus-sm-2)
   - [Fitur 8: 🛡️ Anti-Plagiarism & Turnitin Academic Paraphrase Shield](#fitur-8-️-anti-plagiarism--turnitin-academic-paraphrase-shield)
3. [Tabel Kompatibilitas & File Terdampak](#3-tabel-kompatibilitas--file-terdampak)
4. [Rencana Roadmap Bertahap (Phased Execution)](#4-rencana-roadmap-bertahap-phased-execution)

---

## 1. Prinsip Arsitektur Zero-Regression (Anti-Rusak)

Untuk memastikan **TIDAK ADA SATU PUN** fitur lama yang terganggu atau rusak saat penambahan fitur baru ini:

1. **Desain Additive (Hanya Menambah, Tidak Mengubah Logika Inti):**
   - Di `src/lib/gemini.ts`, semua opsi pemanggilan baru (`webSearch?: boolean`, `codeExecution?: boolean`, dll.) ditambahkan sebagai properti opsional di `SendMessageOptions`.
   - Jika opsi tidak dipanggil (`undefined` / `false`), isi payload request ke Google Gemini API tetap **100% identik** dengan konfigurasi stabil saat ini.
2. **Isolasi Tindakan Agent (`src/lib/agentActions.ts`):**
   - 11 aksi agent yang sudah berjalan (`create_task`, `update_task`, `delete_task`, `save_journal`, `delete_journal`, `create_note`, `delete_note`, `create_quiz`, `search_data`, `summarize`, `create_study_plan`) tidak diubah sintaks maupun return value-nya.
   - Aksi baru ditambahkan sebagai cabang `case` baru di `switch-case`.
3. **Platform Boundary Safety (Web vs Mobile Android/iOS):**
   - Fitur native seperti background worker (`expo-background-fetch`) dan notifikasi lokal (`expo-notifications`) dibungkus oleh `Platform.OS !== 'web'`.
   - Di web browser, fitur akan berjalan anggun (*graceful fallback*) tanpa melemparkan *unhandled exception*.
4. **Error Boundary & Silent Failover:**
   - Semua fungsi baru dibungkus dalam blok `try...catch` internal. Jika layanan pihak ketiga (misal: grounding search) mengalami batas kuota, agent otomatis jatuh ke jawaban berbasis model standar tanpa menampilkan kotak merah eror.
5. **Kepatuhan Pool API Key (49 Keys):**
   - Seluruh pemanggilan fitur baru tetap melewati rotasi otomatis 49 key dan auto-blacklist di `src/lib/gemini.ts`.

---

## 2. Rincian 8 Fitur Hardcore AI Agent

---

### Fitur 1: 🌐 Web Grounding & Real-Time Fact Checking
* **Tujuan:** Menghilangkan halusinasi data terbaru. AI dapat mencari jurnal ilmiah, data statistik resmi, dan berita hari ini secara live.
* **Mekanisme Teknis:**
  - Tambahkan opsi `webSearch?: boolean` di `SendMessageOptions` ([src/lib/gemini.ts](file:///c:/xampp/htdocs/program%20AI%20bot/src/lib/gemini.ts)).
  - Jika `options.webSearch === true`, tambahkan tool Google Search Grounding ke payload Gemini:
    ```typescript
    if (options?.webSearch) {
      requestBody.tools = [{ googleSearch: {} }];
    }
    ```
  - Parse metadata `groundingMetadata` dari respons Gemini untuk menampilkan sumber link rujukan (citations) di bawah bubble chat.
* **Integrasi UI:**
  - Tombol toggle 🌐 **Web** di deretan mode chat ([ChatScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/ChatScreen.tsx)).

---

### Fitur 2: 🗣️ Voice-Driven Action Agent (Gemini Live Integration)
* **Tujuan:** Pengguna bisa mengontrol aplikasi (buat tugas, catat jurnal, buat jadwal) hanya dengan berbicara tanpa menyentuh layar.
* **Mekanisme Teknis:**
  - Di [GeminiLiveVoiceModal.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/components/GeminiLiveVoiceModal.tsx), saat AI selesai menghasilkan respons teks:
    1. Periksa apakah terdapat blok `<AGENT_ACTION>...</AGENT_ACTION>` menggunakan `extractAgentAction()`.
    2. Jika ada, panggil `executeAgentAction(userId, action)`.
    3. Bersihkan teks suara menggunakan `stripAgentActionBlock()` agar TTS tidak membacakan kode JSON.
    4. Tambahkan kalimat konfirmasi suara ramah (misal: *"Tugas sudah berhasil kutambahkan ke daftar To-Do!"*).
* **Integrasi UI:**
  - Animasi visual pill feedback *"⚙️ Ara mengeksekusi tugas..."* di dalam modal suara.

---

### Fitur 3: 🧮 Python Code Execution & Precision Math Sandbox
* **Tujuan:** Menjamin perhitungan matematika kompleks, kalkulus, statistika, dan algoritma 100% akurat tanpa kesalahan halusinasi angka.
* **Mekanisme Teknis:**
  - Gemini API mendukung native Code Execution:
    ```typescript
    if (options?.codeExecution) {
      requestBody.tools = [{ codeExecution: {} }];
    }
    ```
  - AI akan menulis kode Python, menjalankannya di sandbox Google, dan mengembalikan output perhitungan eksak beserta kode yang dijalankan.
* **Integrasi UI:**
  - Menampilkan box eksekusi kode yang dapat di-expand (collapsible) dengan badge `🐍 Dihitung dengan Python Sandbox` di bubble chat.

---

### Fitur 4: 🕵️‍♂️ Midnight Shadow Agent (Proactive Background Worker)
* **Tujuan:** Agent aktif secara otonom mengingatkan tugas & memotivasi tanpa harus membuka aplikasi terlebih dahulu.
* **Mekanisme Teknis:**
  - Menggunakan modul yang sudah terpasang: `expo-notifications`, `expo-task-manager`, dan `expo-background-fetch`.
  - Buat helper baru `src/lib/shadowAgent.ts`:
    - **Pukul 06.30 (Morning Briefing):** Cek tugas berdeadline hari ini dari `getCachedTasks()`. Jika ada, kirim notifikasi lokal rangkuman tugas hari ini.
    - **Pukul 21.00 (Daily Reflection & Nudge):** Cek apakah ada tugas yang selesai atau belum, dan tanyakan kondisi mood hari ini untuk diajak curhat.
* **Integrasi UI:**
  - Pengaturan toggle di [ProfileScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/ProfileScreen.tsx) / Admin Screen: *"Aktifkan Asisten Proaktif Pagi & Malam"*.

---

### Fitur 5: 👥 Multi-Agent Debate Panel (Dewan Pakar AI)
* **Tujuan:** Membantu pengguna membedah topik rumit, esai, atau dilema keputusan dari berbagai perspektif ahli secara simultan.
* **Mekanisme Teknis:**
  - Modul `src/lib/multiAgentDebate.ts`.
  - Satu kali pemicu akan memanggil 3 mini-putaran secara berurutan:
    1. **Agent 1 (Akademisi / Kritis):** Menyajikan teori, kelemahan hipotesis, dan data objektif.
    2. **Agent 2 (Praktisi Lapangan):** Menyajikan contoh implementasi nyata, batas realistis, dan solusi pragmatis.
    3. **Agent 3 (Moderator / Synthesizer):** Merangkum kedua sudut pandang menjadi kesimpulan komprehensif + draf kerangka esai.
* **Integrasi UI:**
  - Tampilan kartu chat 3-kolom / bubble berwarna berbeda: Ungu (Akademisi), Oranye (Praktisi), Emas (Moderator).

---

### Fitur 6: 📝 AI Hand-Written Exam Grader & Step-by-Step Error Tracer
* **Tujuan:** Memeriksa coret-coretan tugas matematika/sains tulisan tangan dari foto kamera dan menunjukkan baris mana yang salah.
* **Mekanisme Teknis:**
  - Menggunakan multimodal vision prompt khusus ke Gemini Flash:
    - Input: Foto coret-coretan kertas tugas pengguna + teks soal.
    - Output terstruktur: Analisis baris-demi-baris (*Step 1: OK, Step 2: OK, Step 3: Salah tanda minus...*), nilai estimasi (skor), dan perbaikan yang benar.
* **Integrasi UI:**
  - Tombol modal baru atau opsi kamera di [TaskWorkpadModal.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/components/TaskWorkpadModal.tsx): *"Koreksi Coretan PR"*.

---

### Fitur 7: 🧠 Spaced Repetition Memory Agent (Ebbinghaus SM-2)
* **Tujuan:** Mencegah lupa materi pelajaran dengan menjadwalkan review kuis & flashcard tepat sebelum pengguna melupakannya.
* **Mekanisme Teknis:**
  - Algoritma SuperMemo SM-2 di `src/lib/spacedRepetition.ts`:
    - Tiap flashcard memiliki metadata: `repetition_count`, `ease_factor` (default 2.5), `interval_days`, dan `next_review_date`.
    - Saat pengguna menjawab kartu (Mudah / Sedang / Sulit), interval review berikutnya dihitung otomatis (1 hari, 3 hari, 7 hari, 16 hari, 35 hari).
* **Integrasi UI:**
  - Badge di [StudyNotesScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/StudyNotesScreen.tsx) & [Flashcard3DModal.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/components/Flashcard3DModal.tsx): *"🔥 5 Kartu Perlu Diulang Hari Ini"*.

---

### Fitur 8: 🛡️ Anti-Plagiarism & Turnitin Academic Paraphrase Shield
* **Tujuan:** Memoles draf tulisan ilmiah agar lolos uji kemiripan (Turnitin < 15%) dengan tetap mempertahankan makna asli dan kaidah sitasi akademik.
* **Mekanisme Teknis:**
  - Prompt khusus dengan guardrail ketat di `src/lib/academicShield.ts`:
    - Mengubah struktur kalimat pasif-aktif, variasi kosakata formal bahasa Indonesia/Inggris, rekonstruksi klausa subordinat.
    - Format output menyertakan skor keterbacaan (Readability Index) dan catatan saran sitasi (format APA 7th).
* **Integrasi UI:**
  - Tab / mode khusus di [TaskWorkpadModal.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/components/TaskWorkpadModal.tsx) atau opsi menu di [StudyNoteDetailScreen.tsx](file:///c:/xampp/htdocs/program%20AI%20bot/src/screens/StudyNoteDetailScreen.tsx).

---

## 3. Tabel Kompatibilitas & File Terdampak

| Fitur | File yang Ditambahkan / Dimodifikasi | Risiko Regresi | Strategi Keamanan |
| :--- | :--- | :--- | :--- |
| **1. Web Grounding** | `src/lib/gemini.ts`, `ChatScreen.tsx` | Rendah | Flag opsional `webSearch?: boolean`, fallback otomatis jika API search limit. |
| **2. Voice Action Agent** | `GeminiLiveVoiceModal.tsx` | Rendah | Menggunakan `extractAgentAction` yang sudah teruji, TTS hanya membaca pesan teks natural. |
| **3. Code Execution** | `src/lib/gemini.ts`, `ChatScreen.tsx` | Rendah | Flag opsional `codeExecution?: boolean`. |
| **4. Midnight Shadow** | `src/lib/shadowAgent.ts` (File Baru) | Nol | Terisolasi di file baru, hanya membaca cache lokal saat trigger jam tertentu. |
| **5. Multi-Agent Debate** | `src/lib/multiAgentDebate.ts` (File Baru) | Nol | Komponen mandiri, tidak mengubah state chat biasa. |
| **6. Exam Grader** | `TaskWorkpadModal.tsx`, `gemini.ts` | Rendah | Memanfaatkan endpoint multimodal vision yang sudah ada. |
| **7. Spaced Repetition** | `src/lib/spacedRepetition.ts` (File Baru), `Flashcard3DModal.tsx` | Rendah | Menambah field opsional di item flashcard tanpa mengubah struktur note lama. |
| **8. Paraphrase Shield** | `src/lib/academicShield.ts` (File Baru) | Nol | Fungsi generator mandiri. |

---

## 4. Rencana Roadmap Bertahap (Phased Execution)

Agar stabilitas aplikasi tetap 100% terjaga dan bisa dites bertahap:

* **Tahap 1 (Quick Wins & Fitur Favorit):**
  - Implementasi **Fitur 1 (Web Grounding)** dan **Fitur 2 (Voice-Driven Action)**.
  - Verifikasi di Chat & Live Voice Modal.
* **Tahap 2 (Kognitif & Ketepatan Hitung):**
  - Implementasi **Fitur 3 (Python Code Execution)** dan **Fitur 6 (Hand-Written Grader)**.
* **Tahap 3 (Belajar & Memori Adaptif):**
  - Implementasi **Fitur 7 (Spaced Repetition SM-2)** dan **Fitur 8 (Academic Paraphrase)**.
* **Tahap 4 (Otonom & Multi-Agent):**
  - Implementasi **Fitur 4 (Midnight Shadow Proactive)** dan **Fitur 5 (Multi-Agent Debate)**.

---
*Dokumen ini dibuat dan disimpan di direktori proyek sebagai panduan referensi implementasi.*
