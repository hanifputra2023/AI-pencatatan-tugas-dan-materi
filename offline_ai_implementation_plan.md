# 🤖 Rencana Implementasi: Offline AI Engine + RAG
> Aplikasi: AI Pencatatan Tugas & Materi  
> Versi Dokumen: 2.0 (Revisi)
> Status: **Siap Diimplementasikan**

---

## 📌 Ringkasan Eksekutif

Menambahkan **AI Lokal Offline** berbasis RAG (Retrieval-Augmented Generation) yang:
- Menggunakan **nama dari fitur "Kustomisasi Teman AI"** user (AsyncStorage key `@user_custom_ai_profile` → field `botName`)
- Model tersimpan **permanen di device** — tidak hilang meski app di-update atau di-close
- Berjalan di dua platform: **Web/PWA** dan **APK Android** dengan strategi yang berbeda

---

## 🏷️ Nama AI yang Dinamis (REVISI)

### Sumber Nama yang Benar

Nama AI lokal mengikuti nama yang user set di fitur **"Kustomisasi Teman AI"** (pasang foto avatar & nama panggilan AI):

```ts
// AsyncStorage key yang menyimpan profil AI kustom user:
// '@user_custom_ai_profile' → JSON: { botName: "...", avatarUrl: "..." }

// localAI.ts — cara baca nama:
export async function getLocalAIName(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem('@user_custom_ai_profile');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.botName?.trim()) return parsed.botName.trim();
    }
  } catch {}
  // Fallback default jika user belum set nama kustom
  return 'Ara';
}
```

### Alur Nama di Berbagai Kondisi

```
User set nama di "Kustomisasi Teman AI" → misal: "Luna"
    ↓ disimpan di AsyncStorage: @user_custom_ai_profile = { botName: "Luna" }
    ↓
Offline AI baca nama → "Luna"
    ↓
Response AI lokal: "📚 Luna (Mode Offline)\n\nBerdasarkan catatanmu..."
    ↓
Header chat: "Luna • Mode Offline 🔴"
```

---

## 💾 Penyimpanan Permanen — Dua Platform, Dua Cara

> ⚠️ **Perbedaan Kritis:**
> - Web/PWA → IndexedDB (otomatis oleh Transformers.js)
> - APK Android → FileSystem.documentDirectory (expo-file-system)

### Platform 1: Web / PWA

```
Browser IndexedDB
    ├─ Dikelola otomatis oleh @xenova/transformers
    ├─ Tidak hilang saat tab ditutup            ✅
    ├─ Tidak hilang saat browser di-restart     ✅
    ├─ Tidak hilang saat app/PWA di-update      ✅
    └─ HANYA hilang jika:
         - User klik "Clear Site Data"          ⚠️
         - User hapus cache browser manual      ⚠️
```

### Platform 2: APK Android (Native)

```
expo-file-system → FileSystem.documentDirectory
    ├─ Lokasi: /data/data/[package.name]/files/
    ├─ Tidak hilang saat app ditutup            ✅
    ├─ Tidak hilang saat HP di-restart          ✅
    ├─ Tidak hilang saat app di-UPDATE          ✅  ← KUNCI
    ├─ Tidak hilang saat app di-clear cache     ✅  ← Beda dari browser!
    └─ HANYA hilang jika:
         - User uninstall aplikasi              ⚠️
         - User "Clear Data" manual di Settings ⚠️
```

> **Kenapa `FileSystem.documentDirectory` tidak hilang saat update APK?**
> Karena Android mempertahankan data di `/files/` folder saat melakukan update (install ulang APK baru di atas yang lama). Data hanya dihapus saat full uninstall.

---

## 📦 Library Per Platform

### Web: `@xenova/transformers`
```bash
npm install @xenova/transformers
```
- Jalan di browser via WASM + WebGL
- Cache model otomatis ke IndexedDB
- Support `all-MiniLM-L6-v2` (embedding) + `LaMini-Flan-T5-248M` (generation)

### Native APK: `onnxruntime-react-native` + `expo-file-system`
```bash
npm install onnxruntime-react-native
npm install expo-file-system
```
- Jalankan model ONNX (.onnx) langsung di CPU Android
- Model didownload sekali → simpan ke `FileSystem.documentDirectory`
- Tidak butuh internet setelah download pertama

---

## 🏗️ Arsitektur Lengkap

```
┌─────────────────────────────────────────────────────────────┐
│                     aiRouter.ts                             │
│                                                             │
│  1. Cek Platform.OS                                         │
│  2. Cek koneksi internet                                    │
│  3. Cek API key tersedia                                    │
│                                                             │
│  Online + API Key → gemini.ts (tetap seperti sekarang)     │
│  Offline / No Key → localAI.ts                             │
└───────────────────────────┬─────────────────────────────────┘
                            │ (offline path)
                            ▼
┌───────────────────────────────────────────────────────────┐
│                      localAI.ts                           │
│                                                           │
│  getLocalAIName()                                         │
│  → baca '@user_custom_ai_profile' → botName              │
│                                                           │
│  RAG Pipeline:                                            │
│  1. searchRelevantNotes(query)                            │
│  2. buildContextPrompt(notes, query, aiName)              │
│  3. generateAnswer(prompt)                                │
│  4. formatResponse(answer, aiName, sources)               │
└──────────┬────────────────────────────────────┬──────────┘
           │                                    │
           ▼                                    ▼
┌──────────────────────┐          ┌─────────────────────────┐
│   Platform.OS=web    │          │  Platform.OS=android/ios │
│                      │          │                          │
│  localEmbedding.ts   │          │  nativeEmbedding.ts      │
│  @xenova/transformers│          │  onnxruntime-react-native│
│  → IndexedDB cache   │          │  → FileSystem cache      │
│                      │          │                          │
│  vectorStore.ts      │          │  vectorStore.ts          │
│  → IndexedDB         │          │  → AsyncStorage          │
└──────────────────────┘          └─────────────────────────┘
```

---

## 📁 File Baru yang Akan Dibuat

```
src/lib/
  ├── localEmbedding.ts       ← Web: embedding via @xenova/transformers
  ├── nativeEmbedding.ts      ← Native APK: embedding via ONNX Runtime
  ├── vectorStore.ts          ← Simpan & cari vektor (IndexedDB / AsyncStorage)
  ├── localAI.ts              ← RAG pipeline + generation + nama dinamis
  └── aiRouter.ts             ← Router: online→Gemini, offline→Local

src/components/
  └── OfflineAISetupModal.tsx ← UI download model dengan progress bar

src/hooks/
  └── useOfflineAI.ts         ← Hook status offline AI untuk semua screen
```

---

## 🧠 Model AI

### Embedding: `all-MiniLM-L6-v2`
| | Web | APK Android |
|---|---|---|
| **Format** | ONNX (via Transformers.js) | ONNX (via ONNX Runtime RN) |
| **Ukuran** | ~23MB | ~23MB |
| **Disimpan di** | IndexedDB | FileSystem.documentDirectory |
| **RAM aktif** | ~50MB | ~50MB |

### Generation: `LaMini-Flan-T5-248M`
| | Web | APK Android |
|---|---|---|
| **Format** | ONNX (via Transformers.js) | ONNX (via ONNX Runtime RN) |
| **Ukuran** | ~248MB | ~248MB |
| **Disimpan di** | IndexedDB | FileSystem.documentDirectory |
| **RAM aktif** | ~400MB | ~400MB |

> **Total download user: ~271MB** — sekali saja, permanen di device

---

## 🔄 RAG Pipeline

```
User tanya (offline)
    ↓
[1] Baca nama AI dari '@user_custom_ai_profile' → botName
    contoh: "Luna"
    ↓
[2] Embed query → vektor (MiniLM, ~80ms)
    ↓
[3] Cosine similarity search → top-3 catatan relevan
    threshold minimum: 0.3
    ↓
[4] Build context prompt:
    "Namamu adalah Luna. Catatan user:
     [Catatan 1: ...]
     [Catatan 2: ...]
     Pertanyaan: '...'
     Jawab dan lengkapi dengan bahasa yang jelas:"
    ↓
[5] Generate via LaMini-Flan-T5 (2-8 detik di mid-range CPU)
    ↓
[6] Format response:
    "📚 Luna (Mode Offline)
     
     [jawaban yang diperjelas]
     
     📖 Dari catatan: 'Fisika Bab 4' • 'Mekanika Newton'"
```

---

## 📱 Implementasi Storage Native APK

```ts
// nativeEmbedding.ts
import * as FileSystem from 'expo-file-system';
import { InferenceSession } from 'onnxruntime-react-native';

const MODEL_DIR = `${FileSystem.documentDirectory}offline_ai_models/`;

// Download model sekali → simpan permanen
export async function downloadAndCacheModel(
  modelUrl: string,
  modelName: string,
  onProgress: (pct: number) => void
): Promise<string> {
  const localPath = `${MODEL_DIR}${modelName}`;
  
  // Cek apakah sudah ada (tidak perlu download ulang)
  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) {
    console.log(`[LocalAI] Model ${modelName} sudah ada, skip download.`);
    return localPath;
  }
  
  // Pastikan folder ada
  await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
  
  // Download dengan progress callback
  const downloadResumable = FileSystem.createDownloadResumable(
    modelUrl,
    localPath,
    {},
    (downloadProgress) => {
      const pct = Math.round(
        (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100
      );
      onProgress(pct);
    }
  );
  
  await downloadResumable.downloadAsync();
  return localPath;
}

// Load model dari path lokal → jalankan inferensi
export async function createEmbeddingSession(localModelPath: string) {
  return await InferenceSession.create(localModelPath);
}
```

### Kenapa `FileSystem.documentDirectory` Permanen Saat Update APK?

```
Install APK v1.0:
  /data/data/com.app/files/offline_ai_models/
    ├── minilm.onnx        (23MB)
    └── flan-t5.onnx       (248MB)

Update ke APK v1.1 (install di atas v1.0):
  /data/data/com.app/files/offline_ai_models/
    ├── minilm.onnx        ← MASIH ADA ✅
    └── flan-t5.onnx       ← MASIH ADA ✅
  
Uninstall:
  /data/data/com.app/ → DIHAPUS SEMUA ❌
  (wajar — ini sudah expected behavior)
```

---

## 🎨 UI OfflineAISetupModal

### States

```
┌─────────────────────────────────────────┐
│  STATE 1: PROMPT (belum download)       │
│                                         │
│  🤖 [Avatar AI user / default avatar]  │
│  "Aktifkan Luna secara Offline!"        │
│                                         │
│  "Luna bisa menemanimu belajar meski    │
│   tanpa internet. Download model AI     │
│   sekali (~270MB), lalu tersimpan       │
│   selamanya di HP kamu."               │
│                                         │
│  📶 Disarankan pakai WiFi               │
│  💾 Butuh: ~270MB storage               │
│                                         │
│  [Nanti Saja]  [Download Sekarang ▶]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  STATE 2: DOWNLOADING                   │
│                                         │
│  ⏳ Mengunduh model AI...               │
│                                         │
│  Komponen pencarian...                  │
│  ██████████░░░░░ 68%                   │
│                23MB / 271MB             │
│                                         │
│  Jangan tutup aplikasi ya 🙏            │
│  (Proses ini hanya terjadi sekali)      │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  STATE 3: DONE ✅                       │
│                                         │
│  [Avatar AI user]                       │
│  "Luna siap menemanimu offline!"        │
│                                         │
│  "Sekarang kamu bisa tanya Luna         │
│   kapanpun, bahkan tanpa internet~ 🎉"  │
│                                         │
│          [Oke, Siap Belajar! 🚀]        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  STATE 4: ERROR ❌                      │
│                                         │
│  Unduhan gagal                          │
│  Pastikan koneksi internet stabil.      │
│                                         │
│  [Batal]        [Coba Lagi 🔄]          │
└─────────────────────────────────────────┘
```

> **Catatan**: Nama AI di modal ("Luna", "Ara", dll.) baca langsung dari
> `@user_custom_ai_profile` → `botName` — dinamis mengikuti nama yang user set.

---

## ⚙️ Deteksi Status Model Permanen

```ts
// useOfflineAI.ts

// Cek apakah model sudah tersimpan permanen
export async function isOfflineAIReady(): Promise<boolean> {
  const flag = await AsyncStorage.getItem('@offline_ai_ready');
  if (flag !== 'true') return false;

  if (Platform.OS === 'web') {
    // Web: verifikasi via Transformers.js cache
    try {
      // Coba load dengan cache-only, gagal = cache hilang
      await verifyWebModelCache();
      return true;
    } catch {
      await AsyncStorage.removeItem('@offline_ai_ready');
      return false;
    }
  } else {
    // Native: cek file di FileSystem
    const modelPath = `${FileSystem.documentDirectory}offline_ai_models/flan-t5.onnx`;
    const info = await FileSystem.getInfoAsync(modelPath);
    if (!info.exists) {
      await AsyncStorage.removeItem('@offline_ai_ready');
      return false;
    }
    return true;
  }
}
```

---

## 🔗 Integrasi dengan Kode yang Ada

### Auto-embed Saat Catatan Disimpan

```ts
// Ditambahkan di StudyNotesScreen.tsx setelah save catatan
async function afterNoteSaved(note: StudyNote) {
  // Jangan blok UI — jalankan di background
  if (await isOfflineAIReady()) {
    embedNoteInBackground(note).catch(() => {});
  }
}
```

### aiRouter.ts — Transparan untuk Screen yang Ada

```ts
// aiRouter.ts
export async function sendAIMessage(
  messages: GeminiMessage[],
  options?: SendMessageOptions
): Promise<string> {
  const online = await NetInfo.fetch().then(s => s.isConnected);
  const hasKey = (await ensureApiKeysLoaded()).length > 0;

  if (online && hasKey) {
    // Pakai Gemini seperti biasa — tidak ada yang berubah
    return sendMessageToGemini(messages, undefined, null, undefined, options);
  }
  
  // Offline / tidak ada key → Local AI
  return sendLocalAIMessage(messages, options);
}
```

### Badge "Mode Offline" di Chat Header

```tsx
// Ditambahkan di ChatScreen.tsx (minimal change)
{isOffline && (
  <View style={styles.offlineBadge}>
    <Text>🔴 Mode Offline • {effectiveBotName} (AI Lokal)</Text>
  </View>
)}
```

---

## 📅 Rencana Implementasi Bertahap

### Phase 1 — Storage & Embedding Foundation
- [ ] Install `@xenova/transformers` + `onnxruntime-react-native` + `expo-file-system`
- [ ] `localEmbedding.ts` — web embedding via Transformers.js
- [ ] `nativeEmbedding.ts` — APK embedding via ONNX Runtime
- [ ] `vectorStore.ts` — simpan vektor (IndexedDB/AsyncStorage, tergantung platform)
- [ ] Test embedding pada kedua platform

### Phase 2 — RAG Pipeline & Generation
- [ ] `localAI.ts` — RAG pipeline lengkap
- [ ] `getLocalAIName()` — baca dari `@user_custom_ai_profile` → botName
- [ ] Similarity search + context prompt builder
- [ ] Model generation LaMini-Flan-T5 (web + native)
- [ ] Fallback RAG-only untuk low-end device

### Phase 3 — Router & UI
- [ ] `aiRouter.ts` — deteksi online/offline + route transparan
- [ ] `OfflineAISetupModal.tsx` — 4 states, nama AI dinamis, progress bar
- [ ] `useOfflineAI.ts` — hook status untuk semua screen
- [ ] Banner di Dashboard jika model belum didownload
- [ ] Badge "Mode Offline" di ChatScreen

### Phase 4 — Polish
- [ ] Auto-embed background saat catatan disimpan
- [ ] Settings: status, ukuran model, tombol hapus model
- [ ] Simulasi streaming (karakter per karakter) untuk feel responsif
- [ ] Handle update nama AI kustom → update system prompt otomatis

---

## ⚠️ Edge Cases

| Skenario | Penanganan |
|---|---|
| User belum set nama AI (botName kosong) | Fallback ke `'Ara'` |
| User ganti nama AI setelah download | Nama di response otomatis berubah (dibaca real-time) |
| Model hilang setelah uninstall + reinstall | Prompt download ulang |
| APK update → model tetap ada | ✅ Tidak perlu action apapun |
| Storage HP penuh saat download | Tampilkan error "Ruang tidak cukup, butuh ~270MB" |
| Catatan belum ada sama sekali | "Buat catatan dulu agar [Nama AI] bisa membantu offline!" |
| Query tidak relevan (similarity < 0.3) | Generate jawaban umum + disclaimer |
| OOM saat generate di low-end | Catch error → fallback RAG-only |

---

## 📊 Estimasi Resource

| Resource | Nilai |
|---|---|
| **Download pertama** | ~271MB |
| **Storage device** | ~280MB (permanen, tidak hilang saat update) |
| **RAM idle** | ~0MB (model di-unload setelah 5 menit tidak dipakai) |
| **RAM aktif** | ~400-500MB |
| **Kecepatan embedding** | ~80-150ms |
| **Kecepatan generation** | 2-8 detik (mid-range), 15-30 detik (low-end) |

---

## 🚀 Dependency Baru

```bash
# Untuk web (sudah bisa langsung)
npm install @xenova/transformers

# Untuk native APK
npm install onnxruntime-react-native
npx expo install expo-file-system   # mungkin sudah ada
```

---

> **Catatan Penting:**
> - AI lokal adalah **pelengkap**, bukan pengganti Gemini API
> - Nama AI **selalu** mengikuti yang user set di "Kustomisasi Teman AI" (`@user_custom_ai_profile` → `botName`)  
> - Model di APK **tidak hilang saat update app** — hanya hilang saat uninstall
> - Saat online + ada API key → tetap pakai Gemini untuk kualitas terbaik
