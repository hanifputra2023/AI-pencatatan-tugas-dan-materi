# Penanganan Respon AI Panjang di ChatScreen

Dokumen ini menjelaskan masalah yang ada saat ini, akar penyebabnya, dan solusi agar respon AI
(yang bisa sangat panjang) dapat disajikan **sampai selesai** tanpa harus meminta AI untuk
"lanjutkan" / "continue" secara manual.

> **Status Perbaikan:** Seluruh solusi Bagian 3 sudah **diimplementasikan**, termasuk Bagian 3.1
> (streaming) dan de-dup kalimat. Detail implementasi yang sudah selesai ada di Bab 6.

---

## 1. Masalah

Pengguna mengirim satu pertanyaan/instruksi yang jawabannya panjang. Di aplikasi ini, jawaban AI
kadang **terpotong di tengah** sebelum selesai. Pada UI pengguna, mereka harus mengetik ulang
pertanyaan atau menambahkan "lanjutkan" supaya AI menulis sisanya.

Hal ini tidak seperti perilaku Gemini / ChatGPT bawaan, yang biasanya menjawab satu pertanyaan
sampai tuntas tanpa interupsi.

---

## 2. Akar Penyebab (Kondisi Kode Saat Ini)

Seluruh alur chat memakai **panggilan non-streaming** dan **batas token rendah**, tanpa pengecekan
apakah respon terpotong.

### 2.1. Batas keluaran token terlalu rendah

File: `src/lib/gemini.ts:144`

```ts
const maxOutputTokens = options?.maxTokens || (isJson ? 4096 : 1200);
```

- Chat biasa (termasuk ChatScreen): **1200 output token**.
- Jawaban panjang (penjelasan, tanya jawab, tutor, dll.) dengan mudah melebihi 1200 token.
- Ketika model mentok di batas ini, Gemini **berhenti**—teks hanya terpotong.

### 2.2. `finishReason` diabaikan

File: `src/lib/gemini.ts:180-186`

```ts
const data = await response.json();
const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
if (!replyText) {
  throw new Error('AI tidak memberikan respon teks.');
}
return replyText;
```

Respon Gemini berisi `candidates[0].finishReason` dengan nilai seperti `STOP`, `MAX_TOKENS`, dsb.
Kode di atas **tidak pernah membaca `finishReason`**. Artinya:

- Bila model berhenti karena `MAX_TOKENS`, teks terpotong tetap dianggap sukses.
- Tidak ada deteksi "respon belum selesai".

### 2.3. Tidak ada mekanisme "lanjutkan otomatis"

- Tidak ada loop untuk memanggil API lagi bila `finishReason === 'MAX_TOKENS'`.
- Tidak ada perintah lanjutan (misal: "lanjutkan dari titik terakhir kau berhenti") yang dikirim
  otomatis.
- Tidak ada streaming (pengguna hanya melihat indikator "sedang mengetik...", bukan teks yang
  muncul bertahap).

### 2.4. Timeout 14 detik

File: `src/lib/gemini.ts:160-161`

```ts
const timeoutId = setTimeout(() => controller.abort(), 14000);
```

Permintaan dibatalkan setelah 14 detik. Respon panjang yang butuh lebih lama bisa gagal hanya
karena timeout, bukan karena model selesai.

---

## 3. Solusi

Ada dua pendekatan; **disarankan menggabungkan keduanya**.

### 3.1. (Direkomendasikan) Aktifkan Streaming Respon

Ganti endpoint dari `generateContent` ke `streamGenerateContent` dengan `?alt=sse`.

- Keuntungan:
  - Teks muncul bertahap (efek "mengetik") segera setelah token pertama.
  - AI tidak lagi menunggu seluruh respon; latensi terasa lebih cepat.
  - Bisa mendeteksi `finishReason` di akhir aliran SSE.

Contoh URL:

```
https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}
```

Di ChatScreen, tetap gunakan `generateContent` biasa **tanpa streaming**, tetapi tambahkan logika
di bawah pada 3.2 dan 3.3. Streaming adalah opsi ideal tetapi memerlukan parsing SSE tambahan.

### 3.2. Naikkan Batas Token & Hilangkan Timeout Kecil

- Naikkan `maxOutputTokens` untuk chat ke nilai aman (misal `8192`).
- Pastikan setting admin `ai_max_tokens` benar-benar dipakai (saat ini disimpan tapi tidak dibaca).
- Perpanjang/atur ulang `AbortController` timeout (atau matikan untuk streaming).

> **Sudah diimplementasikan** — lihat Bab 6.

### 3.3. Deteksi `finishReason` + Lanjutkan Otomatis (paling penting)

Setiap kali respon diterima, periksa `data.candidates[0].finishReason`:

```ts
const finishReason = data.candidates?.[0]?.finishReason;

if (finishReason === 'MAX_TOKENS') {
  // respon masih belum selesai -> kirim perintah lanjut otomatis
  const continuePrompt =
    'Jawabanmu tadi terpotong karena batas token. ' +
    'Lanjutkan persis dari kalimat terakhir yang kamu tulis, dan selesaikan sampai tuntas.';
  // panggil ulang sendMessageToGemini dengan isi = [...contents, {role:'model',parts:[{text: replyText}]}, {role:'user',parts:[{text: continuePrompt}]}]
}
```

Alur mudahnya:

1. Dapatkan `replyText` dan `finishReason`.
2. Jika `finishReason === 'MAX_TOKENS'`:
   - Jangan tampilkan sebagai "selesai".
   - Panggil API **lagi** dengan menambahkan dua pesan konteks:
     - `model` berisi teks yang sudah ditulis (biar AI tahu titik berhenti),
     - `user` berisi instruksi "lanjutkan dari titik terakhir".
   - Gabungkan potongan pertama + lanjutan, lalu gabungkan semuanya.
   - Ulangi sampai `finishReason === 'STOP'` (dengan batas maksimal, misal 5 iterasi, untuk
     mencegah loop tak berujung).
3. Baru setelah lengkap, tampilkan satu pesan utuh ke pengguna.

Hasilnya: satu pertanyaan → satu jawaban utuh, tanpa harus user menyuruh "lanjutkan".

> **Sudah diimplementasikan** — lihat Bab 6.

---

## 4. Catatan Terkait di Kode (Kondisi Sebelum Perbaikan)

| Berkas | Lokasi | Peran |
|---|---|---|
| `src/lib/gemini.ts:144` | `maxOutputTokens` | Batas token saat ini (1200 chat / 4096 JSON) |
| `src/lib/gemini.ts:151-158` | `generationConfig` | Konfigurasi suhu, topK, topP, maxOutputTokens |
| `src/lib/gemini.ts:180-186` | Pengambilan `replyText` | Tidak membaca `finishReason` |
| `src/lib/gemini.ts:160-161` | Timeout 14 detik | Bisa memotong respon panjang |
| `src/screens/ChatScreen.tsx:509-527` | Pemanggilan chat | Menunggu seluruh respon, lalu insert utuh |
| `src/screens/AdminScreen.tsx:158,703` | Setting `ai_max_tokens` | Disimpan tapi **tidak dipakai** di gemini.ts |

> Tabel di atas menggambarkan kondisi **sebelum** perbaikan. Setelah implementasi, kondisi
> tersebut sudah berubah (lihat Bab 6).

---

## 5. Rekomendasi Implementasi Ringkas

1. **Wajib:** Baca `finishReason`; jika `MAX_TOKENS`, kirim perintah lanjut otomatis dan gabungkan
   hasilnya (loop maksimal ~5x dengan proteksi).
2. **Wajib:** Naikkan `maxOutputTokens` chat (misal 8192) dan pakai setting admin `ai_max_tokens`.
3. **Opsional / lanjutan:** Terapkan streaming `streamGenerateContent` untuk pengalaman "mengetik"
   yang lebih natural, sekaligus tetap cek `finishReason` di akhir aliran.

---

## 6. Perbaikan yang Sudah Diimplementasikan

### 6.1. `src/lib/gemini.ts` — Baca `finishReason` + Auto-Continue

**Daftar konstanta & tipe baru:**

```ts
interface GeminiCallResult {
  text: string;
  finishReason?: string;
}

const CHAT_MAX_TOKENS = 8192;

const CONTINUE_PROMPT =
  'Jawabanmu terpotong karena mencapai batas token. ' +
  'Lanjutkan persis dari kalimat terakhir yang kamu tulis, ' +
  'jangan mengulang bagian yang sudah ditulis, dan selesaikan jawabanmu sampai tuntas hingga selesai.';
```

Sekarang `callSingleModelWithKey` **mengembalikan objek** `GeminiCallResult` (bukan `string`
biasa) dan membaca `finishReason`:

```ts
const data = await response.json();
const candidate = data.candidates?.[0];
const replyText = candidate?.content?.parts?.[0]?.text;
if (!replyText) {
  throw new Error('AI tidak memberikan respon teks.');
}
return { text: replyText, finishReason: candidate?.finishReason };
```

Batas token default chat juga dinaikkan dari `1200` menjadi **`8192`**:

```ts
const maxOutputTokens = options?.maxTokens || (isJson ? 4096 : CHAT_MAX_TOKENS);
```

**Fungsi auto-continue `continueUntilComplete`:**

- Menolak respon yang berhenti karena `MAX_TOKENS`.
- Menambahkan dua pesan konteks sebelum panggilan berikutnya:
  - `model` berisi teks yang sudah ditulis (titik berhenti AI),
  - `user` berisi `CONTINUE_PROMPT` ("lanjutkan persis dari kalimat terakhir...").
- Menggabungkan potongan pertama + potongan lanjutan sampai `finishReason === 'STOP'`.
- Dibatasi maksimal **5 langkah** (`MAX_CONTINUE_STEPS`) agar tidak loop tak berhingga.
- Mode JSON (misal untuk scan soal / struktur data) **tidak** diperpanjang agar struktur tidak rusak:

```ts
if (options?.isJsonMode) {
  return firstResult.text;
}
```

Kemudian di failover loop, hasil pertama diteruskan ke `continueUntilComplete`:

```ts
const result = await callSingleModelWithKey(currentKey, model, contents, systemPrompt, options);
return await continueUntilComplete(currentKey, model, contents, systemPrompt, options, result);
```

### 6.2. `src/screens/ChatScreen.tsx` — Pakai Setting Admin `ai_max_tokens`

Reading setting admin supaya pengaturan dari panel Admin benar-benar berpengaruh:

```ts
const { aiPersona, aiBotName, activePersona, customAiName, customAiAvatar, appSettings } = useMoods();
const effectiveBotName = customAiName || aiBotName || activePersona.botName || 'Ara';
const chatMaxTokens = parseInt(appSettings['ai_max_tokens'], 10) > 0
  ? parseInt(appSettings['ai_max_tokens'], 10)
  : undefined;
```

Setting `maxTokens` diteruskan ke **dua** call site `sendMessageToGemini`:
- saat mengirim pesan chat baru,
- saat mengedit / meregenerasi pesan AI.

```ts
const aiReply = await sendMessageToGemini(history, text, currentAttachment, customAiPrompt, { maxTokens: chatMaxTokens });
```

### 6.3. Hasil Akhir

1. Respon AI yang sebelumnya terpotong di 1200 token sekarang **otomatis dilanjutkan** sampai
   selesai tanpa user mengetik "lanjutkan".
2. Setting `ai_max_tokens` di Panel Administrator kini dipakai untuk chat.
3. Jika API gagal pada langkah lanjutan, teks yang sudah terkumpul tetap dipakai (tidak hilang).

### 6.4. Streaming & De-dup Kalimat (Sudah Dikerjakan)

- **Streaming** (`streamGenerateContent?alt=sse`) → teks AI kini muncul **bertahap seperti "mengetik"**
  langsung di bubble chat, sehingga latensi terasa lebih cepat.
  - `sendMessageToGemini` menerima opsi baru `onToken(partialText)`.
  - Di `src/lib/gemini.ts`: `callSingleModelWithKey` otomatis beralih ke function baru
    `streamSingleModelWithKey` yang memakai endpoint streaming SSE ketika `onToken` diberikan
    (mode JSON di-skip agar struktur tetap aman).
  - Parsing SSE: setiap baris `data:` di-parse untuk mengumpulkan delta teks dan deteksi
    `finishReason`. Pada web memakai `response.body.getReader() + TextDecoder` (progresif);
    pada native yang tidak mendukung streaming body, otomatis fallback ke `response.text()`
    lalu parse seluruh SSE (hasil tetap benar, hanya tidak progresif).
  - Timeout streaming diperlonggar ke 60 detik (respon stream legitim lebih lama).
- **De-dup kalimat** di titik sambungan → kalimat terakhir yang diulang model saat melanjutkan
  respon otomatis dibersihkan.
  - Helper `stripRepeatedTail(prev, next)` mencocokkan 1-2 kalimat terakhir (atau 90 karakter
    terakhir) dari bagian sebelumnya; jika `next` diawali pengulangan tersebut, bagian itu dibuang.
  - Diterapkan di `continueUntilComplete`: hasil gabungan antar potongan dibersihkan, dan saat
    streaming berjalan, `onToken` menerima teks gabungan yang sudah di-de-dup.
- **ChatScreen** (`src/screens/ChatScreen.tsx`):
  - Pesan AI placeholder dibuat lebih dulu, lalu isinya diperbarui berulang kali via `onToken`.
  - Indikator "sedang mengetik..." otomatis disembunyikan begitu token pertama streaming tiba
    (`loading && !isStreaming`).
  - Alur **edit / regenerate** juga kini streaming langsung ke pesan AI yang diedit (termasuk
    membuat placeholder baru bila belum ada pesan AI lanjutan), dan pesan-parsial dihapus jika
    terjadi error.
