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

## 6. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| Output aksi gagal diparse (JSON rusak) | Gunakan `extractJsonFromText` yang sudah ada + fallback ke jawaban teks |
| Agent membuat aksi yang tidak diinginkan | Selalu konfirmasi sebelum eksekusi |
| Terlalu banyak tool → respon lambat | Batasi jumlah tool, mulailah dari 1–2 |
| Duplikasi data (task dobel) | Cek kecocokan / deduplikasi sederhana sebelum insert |
| Token terbuang untuk "berpikir" | Mode agent cukup pakai temperature rendah (faktual/presisi) |

---

## 7. Langkah Mulai (Checklist)

- [ ] Pilih opsi (A / B / C)
- [ ] Definisikan skema action JSON
- [ ] Tambahkan registrasi tool/instruksi ke `gemini.ts`
- [ ] Buat parser & executor aksi di `ChatScreen.tsx`
- [ ] Tambah konfirmasi + notifikasi hasil di UI
- [ ] Uji dengan beberapa perintah contoh