# Tutorial: Fitur AI Agent di StudyBot

Dokumen ini menjelaskan konsep, cara kerja, dan rencana implementasi fitur **AI Agent** untuk aplikasi StudyBot AI.

---

## 1. Apa itu AI Agent?

Saat ini bot kita masih berperan sebagai **penjawab**: pengguna bertanya → bot memberi jawaban teks. Tidak ada aksi nyata di dalam aplikasi.

**AI Agent** adalah bot yang tidak hanya menjawab, tapi juga **bisa melakukan aksi di dalam aplikasi**. Contohnya:

| Perintah pengguna | Yang dilakukan agent |
|---|---|
| "Buat jadwal belajar buat besok" | Membuat task otomatis di daftar tugas |
| "Catat jurnal, hari ini aku capek" | Menyimpan entri jurnal |
| "Bikin catatan ringkas tentang sejarah" | Membuat study note baru |
| "Ingatkan aku belajar jam 7" | Membuat pengingat/reminder |

Jadi alih-alih cuma "ngomong", agent ikut **mengeksekusi fitur yang sudah ada** di aplikasi.

---

## 2. Kenapa ini berguna untuk StudyBot?

Fitur-fitur StudyBot (chat, study notes, journal, tasks, gamification, dll.) selama ini **terpisah**: pengguna harus berpindah layar dan mengisi form manual. Dengan AI agent:

1. **Interaksi jadi natural** — pengguna cukup bicara dalam bahasa sehari-hari.
2. **Nilai fitur naik** — bot jadi asisten yang benar-benar membantu, bukan cuma chatbot.
3. **Alur lebih cepat** — tidak perlu mengetik form panjang, agent yang mengisinya.

---

## 3. Cara kerja (Arsitektur)

Ada dua pendekatan umum:

### A. Function Calling (direkomendasikan)
Gemini mendukung parameter `tools` / function declaration. Bot "tahu" fungsi apa saja yang tersedia, lalu memanggilnya dengan argumen yang sesuai.

```
Pengguna → "Buat jadwal belajar besok jam 7"
    │
    ▼
Gemini (dengan tools terdaftar)
    │   memanggil: createTask({ title, dueDate, subject })
    ▼
App mengeksekusi → simpan ke Supabase → konfirmasi ke pengguna
```

### B. Output JSON (versi simpel)
Tanpa function calling, kita bisa minta bot mengembalikan **JSON aksi** di akhir jawaban:

```json
{
  "action": "create_task",
  "data": { "title": "Belajar Matematika", "due": "2026-09-08" }
}
```

App memparsing JSON tersebut setelah AI selesai menjawab, lalu menjalankan aksinya. Cocok untuk mulai kecil karena tidak bergantung ke fitur khusus.

---

## 4. Rencana Implementasi (bertahap)

Disarankan **mulai dari 1–2 aksi dulu** agar reliabilitas terjaga dan tidak overpromise.

### Opsi A — Agent buat Task
- Perintah seperti "bikin tugas/buat jadwal" → agent membuat task di Study Tasks.
- Tool: `create_task(title, due, subject, priority)`.
- Paling cepat dirasakan pengguna.

### Opsi B — Agent catat Jurnal
- Perintah seperti "catat jurnal" → agent menyimpan entri jurnal (teks + mood).
- Tool: `save_journal(content, mood, tags)`.

### Opsi C — Paket Agent lengkap
- Gabungan task + catatan + jurnal + pengingat.
- Registrasi beberapa tool sekaligus ke Gemini.
- Perlu parsing JSON / function calling yang lebih matang.

---

## 5. Prinsip Desain UI

- Mode agent dibuka **terpisah** (misalnya tombol "Agent" di menu "+"), bukan menggantikan chat biasa.
- **Konfirmasi dulu** sebelum aksi dieksekusi:
  > "Ketemu jadwalnya nih: *Belajar Matematika, besok jam 7*. Mau aku buatkan task-nya?"
- Tampilkan hasil aksi sebagai pesan sistem berwarna (mis. "✅ Task berhasil dibuat") agar pengguna tahu apa yang terjadi.
- Aksi yang gagal diparse → tampilkan jawaban biasa + catatan, jangan diam saja.

---

## 6. Status Implementasi (v1 — SUDAH DITERAPKAN)

Fitur agent sudah berjalan di aplikasi. Pengguna mengaktifkannya lewat **tombol "Agent" di menu "+"** pada layar chat; saat aktif, jawaban AI bisa membawa blok aksi `<AGENT_ACTION>{...}</AGENT_ACTION>` yang diparse dan dieksekusi otomatis.

Format blok yang dikeluarkan AI:
```json
<AGENT_ACTION>{"action":"create_task","data":{"title":"Belajar MTK","due_date":"besok","priority":"high"}}</AGENT_ACTION>
```

Mekanisme:
- `extractAgentAction()` membaca blok dari jawaban AI, `stripAgentActionBlock()` menyembunyikannya dari teks yang tampil.
- `executeAgentAction()` menjalankan aksi lewat storage lokal yang sama dengan layar asli (`localSaveTask`, `localSaveNote`, `localSaveJournal`, dst.) — hasilnya langsung muncul di Study Tasks, Study Notes, dan Journal.
- Setelah eksekusi, ditampilkan pesan konfirmasi (`⚙️ Agent berhasil: ...` / `⚙️ Agent gagal: ...`).
- Engine ada di `src/lib/agentActions.ts` dan **bisa dipakai ulang** di layar lain (mis. tombol asisten terpisah di luar chat).

### Daftar aksi yang tersedia

| # | Aksi | Fungsi | Contoh perintah |
|---|---|---|---|
| 1 | `create_task` | Buat tugas/jadwal belajar | "Buat jadwal belajar MTK untuk besok jam 7" |
| 2 | `update_task` | Tandai selesai / buka lagi, ubah tenggat, judul, prioritas, mapel | "Tandai PR fisika selesai" / "Geser deadline jurnal ke lusa" |
| 3 | `delete_task` | Hapus tugas | "Hapus tugas matematika yang minggu depan" |
| 4 | `save_journal` | Simpan entri jurnal + mood + tags | "Catat jurnal, hari ini aku capek" |
| 5 | `delete_journal` | Hapus jurnal | "Hapus jurnal berjudul latihan" |
| 6 | `create_note` | Buat catatan belajar | "Bikin catatan ringkas tentang fotosintesis" |
| 7 | `delete_note` | Hapus catatan | "Hapus catatan sejarahku" |
| 8 | `create_quiz` | Buat catatan berisi soal kuis + flashcard | "Buat kuis 5 soal tentang Pythagoras" |
| 9 | `search_data` | Cari tugas/jurnal/catatan dari data lokal | "Berapa tugas yang belum selesai?" |
| 10 | `summarize` | Rangkum data dalam rentang waktu | "Rekap jurnal dan tugas minggu ini" |
| 11 | `create_study_plan` | Susun rencana belajar multi-sesi (jadi beberapa task) | "Bikin jadwal persiapan UTS 2 minggu lagi" |

Catatan tanggal otomatis: `besok`, `lusa`, `hari ini`, `nanti malam`, format `dd/mm/yyyy` atau ISO, serta rentang `minggu ini` / `bulan ini` untuk rangkuman.

### Perbedaan dari desain awal (trade-off)

- Desain awal menyarankan **konfirmasi sebelum eksekusi**. Di v1 dipilih instruksi ketat ke AI ("hanya sertakan blok jika pengguna benar-benar meminta") + **konfirmasi setelah** aksi berupa pesan hasil. Hal ini membuat alurnya satu langkah lebih singkat; pre-konfirmasi bisa ditambahkan kembali sebagai penyempurnaan.
- Aksi gagal diparse → "Aksi tidak diketahui" ditampilkan tanpa merusak jawaban teks AI.

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Output aksi gagal diparse (JSON rusak) | Gunakan `extractJsonFromText` yang sudah ada + fallback ke jawaban teks |
| Agent membuat aksi yang tidak diinginkan | Selalu konfirmasi sebelum eksekusi |
| Terlalu banyak tool → respon lambat | Batasi jumlah tool, mulailah dari 1–2 |
| Duplikasi data (task dobel) | Cek kecocokan / deduplikasi sederhana sebelum insert |
| Token terbuang untuk "berpikir" | Mode agent cukup pakai temperature rendah (faktual/presisi) |

---

## 8. Langkah Selanjutnya (Roadmap v2)

- [x] Pilih opsi (A / B / C) → **Opsi C (paket lengkap)**
- [x] Definisikan skema action JSON
- [x] Tambahkan registrasi tool/instruksi ke `gemini.ts`
- [x] Buat parser & executor aksi di `agentActions.ts` + wiring di `ChatScreen.tsx`
- [x] Tambah konfirmasi + notifikasi hasil di UI
- [x] Uji dengan beberapa perintah contoh
- [ ] Konfirmasi sebelum eksekusi untuk aksi destruktif (hapus/ubah)
- [ ] Asisten agent terpisah di luar layar chat (pakai engine yang sama)
- [ ] Sinkronisasi hasil aksi real-time antar layar (refresh otomatis)