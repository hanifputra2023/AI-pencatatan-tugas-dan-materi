import AsyncStorage from '@react-native-async-storage/async-storage';
import { addWaterDrops } from './gardenStorage';
import { getInMemoryGamificationConfig } from './gamificationConfig';
import { supabase } from './supabase';

const KEY_CHESTS = '@loot_chest_inventory';
const KEY_TITLES = '@rpg_titles_unlocked';
const KEY_ACTIVE_TITLE = '@rpg_active_title';
const KEY_CUSTOM_TITLES = '@rpg_custom_titles';
const KEY_WHEEL_TICKETS = '@lucky_wheel_tickets';
const KEY_WHEEL_LAST_ACTIVITY_DATE = '@lucky_wheel_last_activity_date';

export type LootRarity = 'rare' | 'epic' | 'legendary' | 'mythic';

export interface LootResult {
  type: 'xp' | 'water' | 'title' | 'skin';
  rarity: LootRarity;
  label: string;
  value: number | string;
  icon: string;
  color: string;
  xpAmount?: number;
  waterAmount?: number;
  titleId?: string;
  skinColor?: string;
}

export interface RpgTitle {
  id: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  rarity: LootRarity;
}

export interface WheelSegment {
  id: string;
  label: string;
  subLabel: string;
  color: string;
  textColor: string;
  icon: string;
  weight: number;
  reward: LootResult;
}

export const ALL_RPG_TITLES: RpgTitle[] = [
  // ── RARE (Langka - Tier 1) ──
  { id: 'penakluk_golem', label: 'Penakluk Golem Kalkulus', icon: 'skull', color: '#3B82F6', description: 'Kalahkan bos kalkulus pertama di arena kuis', rarity: 'rare' },
  { id: 'penguasa_deadline', label: 'Penguasa Deadline', icon: 'time', color: '#3B82F6', description: 'Selesaikan 5 tugas sebelum tenggat waktu', rarity: 'rare' },
  { id: 'arsitek_logika', label: 'Arsitek Logika', icon: 'construct', color: '#3B82F6', description: 'Jawab 10 soal kuis tanpa pernah salah', rarity: 'rare' },
  { id: 'dewa_taman_zen', label: 'Pencinta Taman Zen', icon: 'flower', color: '#3B82F6', description: 'Rawat tanaman hingga mekar sempurna', rarity: 'rare' },
  { id: 'dewa_begadang', label: 'Ksatria Tengah Malam', icon: 'moon', color: '#3B82F6', description: 'Belajar dan membuat catatan setelah jam 11 malam', rarity: 'rare' },
  { id: 'monster_catatan', label: 'Pencatat Rajin', icon: 'document-text', color: '#3B82F6', description: 'Membuat 5+ catatan kuliah komprehensif', rarity: 'rare' },
  { id: 'pendekar_pomodoro', label: 'Pendekar Pomodoro', icon: 'timer', color: '#3B82F6', description: 'Selesaikan 5 sesi fokus Pomodoro tanpa henti', rarity: 'rare' },
  { id: 'penjelajah_ilmu', label: 'Penjelajah Mata Kuliah', icon: 'compass', color: '#3B82F6', description: 'Mencatat materi di 3 mata kuliah berbeda', rarity: 'rare' },
  { id: 'jiwa_pagi', label: 'Pejuang Subuh Akademis', icon: 'sunny', color: '#3B82F6', description: 'Mulai belajar dan login sebelum jam 7 pagi', rarity: 'rare' },

  // ── EPIC (Epik - Tier 2) ──
  { id: 'samurai_belajar', label: 'Samurai Belajar Kilat', icon: 'flash', color: '#8B5CF6', description: 'Raih Combo Critical Strike x4 di Arena Boss', rarity: 'epic' },
  { id: 'sang_roh_akademis', label: 'Sang Roh Akademis', icon: 'star', color: '#8B5CF6', description: 'Pertahankan Streak Belajar 7 hari penuh', rarity: 'epic' },
  { id: 'legenda_arena', label: 'Gladiator Kuis', icon: 'trophy', color: '#8B5CF6', description: 'Taklukkan 5 bos materi berbeda di Arena Kuis', rarity: 'epic' },
  { id: 'wali_ujian', label: 'Wali Penguasa Ujian', icon: 'shield-checkmark', color: '#8B5CF6', description: 'Raih total perolehan di atas 2,500 XP', rarity: 'epic' },
  { id: 'pemimpin_forum', label: 'Sang Orator Ilmiah', icon: 'people', color: '#8B5CF6', description: 'Diperoleh dari putaran keberuntungan Lucky Wheel', rarity: 'epic' },
  { id: 'sang_alchemist', label: 'Sang Alchemist Pengetahuan', icon: 'flask', color: '#8B5CF6', description: 'Buka 3 Kotak Hadiah dalam satu hari', rarity: 'epic' },
  { id: 'penguasa_roda', label: 'Penguasa Roda Nasib', icon: 'refresh-circle', color: '#8B5CF6', description: 'Menangkan Hadiah JACKPOT di Lucky Wheel', rarity: 'epic' },
  { id: 'dewa_koin_emas', label: 'Kolektor XP Sejati', icon: 'cash', color: '#8B5CF6', description: 'Kumpulkan lebih dari 5,000 XP total', rarity: 'epic' },
  { id: 'pembelah_materi', label: 'Pembelah Rumus Rumit', icon: 'hardware-chip', color: '#8B5CF6', description: 'Taklukkan Boss Fase 2 tanpa HP tersisa di bawah 50%', rarity: 'epic' },

  // ── LEGENDARY (Legendaris - Tier 3) ──
  { id: 'shadow_of_wisdom', label: 'Shadow of Wisdom', icon: 'eye', color: '#F59E0B', description: 'Diperoleh hanya dari drop Kotak Hadiah Langka', rarity: 'legendary' },
  { id: 'naga_api_belajar', label: 'Naga Api Belajar', icon: 'flame', color: '#F59E0B', description: 'Pertahankan Streak Belajar 30 hari berturut-turut', rarity: 'legendary' },
  { id: 'penakluk_event_boss', label: 'Penakluk Boss 24 Jam', icon: 'bonfire', color: '#F59E0B', description: 'Kalahkan Boss Event Terbatas sebelum waktunya habis', rarity: 'legendary' },
  { id: 'tuan_kebun_abadi', label: 'Tuan Kebun Abadi', icon: 'leaf', color: '#F59E0B', description: 'Panen 5 varietas tanaman langka di Taman Fokus', rarity: 'legendary' },
  { id: 'archmage_skripsi', label: 'Archmage Tugas Akhir', icon: 'sparkles', color: '#F59E0B', description: 'Selesaikan 25 tugas kuliah dan sub-tugas AI', rarity: 'legendary' },
  { id: 'penguasa_dimensi_studi', label: 'Penguasa Dimensi Studi', icon: 'planet', color: '#F59E0B', description: 'Selesaikan 50 sesi Pomodoro (1,250 menit fokus)', rarity: 'legendary' },

  // ── MYTHIC (Mitos / Prismatic - Tier 4 Paling Langka) ──
  { id: 'ultima_scholar', label: 'Ultima Scholar', icon: 'diamond', color: '#EF4444', description: 'Gelar Mahadewa Pengetahuan — Capai Tier 30 Battle Pass', rarity: 'mythic' },
  { id: 'avatar_kebijaksanaan_abadi', label: 'Avatar Kebijaksanaan Abadi', icon: 'infinite', color: '#EF4444', description: 'Capai Level 20 Ultima Transcendent (50,000+ XP)', rarity: 'mythic' },
  { id: 'sang_penguasa_waktu', label: 'Sang Penguasa Waktu', icon: 'hourglass', color: '#EF4444', description: 'Pertahankan Streak 100 Hari berturut-turut tanpa putus', rarity: 'mythic' },
  { id: 'dewa_seluruh_elemen', label: 'Dewa Seluruh Elemen Ilmu', icon: 'color-wand', color: '#EF4444', description: 'Buka setidaknya 20 Gelar RPG dan 15 Lencana Pencapaian', rarity: 'mythic' },
];

export const RARITY_COLORS: Record<LootRarity, string> = {
  rare: '#3B82F6',
  epic: '#8B5CF6',
  legendary: '#F59E0B',
  mythic: '#EF4444',
};

export const RARITY_LABELS: Record<LootRarity, string> = {
  rare: 'Langka (Rare)',
  epic: 'Epik (Epic)',
  legendary: 'Legendaris (Legendary)',
  mythic: 'Mitos (Mythic)',
};

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { id: 'xp_small', label: '+40 XP', subLabel: 'Bonus Belajar', color: '#1E3A8A', textColor: '#FFFFFF', icon: 'star', weight: 26,
    reward: { type: 'xp', rarity: 'rare', label: '+40 XP', value: 40, icon: 'star', color: '#60A5FA', xpAmount: 40 } },
  { id: 'water_3', label: '+3 Tetes Air', subLabel: 'Untuk Taman', color: '#0369A1', textColor: '#FFFFFF', icon: 'water', weight: 22,
    reward: { type: 'water', rarity: 'rare', label: '+3 Tetes Air 💧', value: 3, icon: 'water', color: '#38BDF8', waterAmount: 3 } },
  { id: 'xp_medium', label: '+80 XP', subLabel: 'Bonus Epik', color: '#6D28D9', textColor: '#FFFFFF', icon: 'flash', weight: 18,
    reward: { type: 'xp', rarity: 'epic', label: '+80 XP Epik!', value: 80, icon: 'flash', color: '#A78BFA', xpAmount: 80 } },
  { id: 'chest_free', label: 'Kotak Hadiah', subLabel: 'Gratis!', color: '#B45309', textColor: '#FFFFFF', icon: 'gift', weight: 12,
    reward: { type: 'xp', rarity: 'epic', label: '1 Kotak Hadiah Gratis! 📦', value: 1, icon: 'gift', color: '#F59E0B', xpAmount: 0 } },
  { id: 'xp_big', label: '+150 XP', subLabel: '+ 3 Tetes Air', color: '#047857', textColor: '#FFFFFF', icon: 'trending-up', weight: 9,
    reward: { type: 'xp', rarity: 'legendary', label: '+150 XP + 3 Tetes Air!', value: 150, icon: 'trending-up', color: '#34D399', xpAmount: 150, waterAmount: 3 } },
  { id: 'title_random', label: 'Gelar RPG!', subLabel: 'Rare/Epic', color: '#BE185D', textColor: '#FFFFFF', icon: 'ribbon', weight: 7,
    reward: { type: 'title', rarity: 'epic', label: 'Gelar RPG Eksklusif', value: 'random', icon: 'ribbon', color: '#F472B6' } },
  { id: 'streak_shield', label: 'Streak Shield', subLabel: '+75 XP', color: '#1D4ED8', textColor: '#FFFFFF', icon: 'shield', weight: 4,
    reward: { type: 'xp', rarity: 'legendary', label: 'Streak Shield & +75 XP!', value: 75, icon: 'shield', color: '#60A5FA', xpAmount: 75 } },
  { id: 'jackpot', label: 'JACKPOT!', subLabel: '+300 XP + Title', color: '#DC2626', textColor: '#FFFFFF', icon: 'trophy', weight: 2,
    reward: { type: 'xp', rarity: 'mythic', label: 'JACKPOT MITOS! +300 XP 🏆', value: 300, icon: 'trophy', color: '#EF4444', xpAmount: 300 } },
];

export function rollLootChest(): LootResult {
  const cfg = getInMemoryGamificationConfig();
  const mythicRate     = cfg.chestDropRateMythic    ?? 4;
  const legendaryRate  = cfg.chestDropRateLegendary  ?? 12;
  const epicRate       = cfg.chestDropRateEpic       ?? 24;
  const waterRate      = cfg.chestDropRateWater      ?? 25;
  const xpMythic      = cfg.chestXpMythic     ?? 200;
  const xpLegendary   = cfg.chestXpLegendary  ?? 120;
  const xpEpic        = cfg.chestXpEpic       ?? 75;
  const waterMin      = cfg.chestWaterMin ?? 3;
  const waterMax      = cfg.chestWaterMax ?? 5;
  const minXp         = cfg.chestMinXp  ?? 25;
  const maxXp         = cfg.chestMaxXp  ?? 150;

  const rand = Math.random() * 100;
  const threshMythic    = mythicRate;
  const threshLegendary = mythicRate + legendaryRate;
  const threshEpic      = mythicRate + legendaryRate + epicRate;
  const threshWater     = mythicRate + legendaryRate + epicRate + waterRate;

  const allTitles = getAllRpgTitles();

  if (rand < threshMythic) {
    const pool = allTitles.filter(t => t.rarity === 'mythic');
    const title = pool[Math.floor(Math.random() * pool.length)] || allTitles[0];
    return { type: 'title', rarity: 'mythic', label: `Gelar Mitos: ${title.label}`, value: title.id, icon: title.icon, color: title.color, titleId: title.id, xpAmount: xpMythic };
  } else if (rand < threshLegendary) {
    const pool = allTitles.filter(t => t.rarity === 'legendary');
    const title = pool[Math.floor(Math.random() * pool.length)] || allTitles[0];
    return { type: 'title', rarity: 'legendary', label: `Gelar Legendaris: ${title.label}`, value: title.id, icon: title.icon, color: title.color, titleId: title.id, xpAmount: xpLegendary };
  } else if (rand < threshEpic) {
    const pool = allTitles.filter(t => t.rarity === 'epic');
    const title = pool[Math.floor(Math.random() * pool.length)] || allTitles[0];
    return { type: 'title', rarity: 'epic', label: `Gelar Epik: ${title.label}`, value: title.id, icon: title.icon, color: title.color, titleId: title.id, xpAmount: xpEpic };
  } else if (rand < threshWater) {
    const amount = waterMin + Math.floor(Math.random() * (waterMax - waterMin + 1));
    return { type: 'water', rarity: 'rare', label: `+${amount} Tetes Air Taman`, value: amount, icon: 'water', color: '#38BDF8', waterAmount: amount };
  } else {
    // XP Rare drop — range from config
    const range = Math.max(1, maxXp - minXp);
    const steps = Math.floor(range / 10);
    const xp = minXp + (Math.floor(Math.random() * (steps + 1)) * 10);
    return { type: 'xp', rarity: 'rare', label: `+${xp} XP Belajar`, value: xp, icon: 'star', color: '#3B82F6', xpAmount: xp };
  }
}

// -------------------------------------------------------------
// Custom RPG Titles Management
// -------------------------------------------------------------
let inMemoryCustomTitles: RpgTitle[] = [];

export function getAllRpgTitles(): RpgTitle[] {
  return [...ALL_RPG_TITLES, ...inMemoryCustomTitles];
}

export async function getCustomTitles(): Promise<RpgTitle[]> {
  try {
    const cached = await AsyncStorage.getItem(KEY_CUSTOM_TITLES);
    if (cached) {
      inMemoryCustomTitles = JSON.parse(cached);
    }
    // Try background sync with Supabase app_settings
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'custom_rpg_titles')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      if (Array.isArray(parsed)) {
        inMemoryCustomTitles = parsed;
        await AsyncStorage.setItem(KEY_CUSTOM_TITLES, JSON.stringify(parsed));
      }
    }
  } catch (e) {
    // ignore
  }
  return inMemoryCustomTitles;
}

// Initialize custom titles on startup
getCustomTitles();

export async function addCustomTitle(newTitle: RpgTitle): Promise<RpgTitle[]> {
  const current = await getCustomTitles();
  // Filter out any duplicates
  const filtered = current.filter(t => t.id !== newTitle.id);
  const updated = [newTitle, ...filtered];
  inMemoryCustomTitles = updated;

  try {
    await AsyncStorage.setItem(KEY_CUSTOM_TITLES, JSON.stringify(updated));
    await supabase.from('app_settings').upsert({
      key: 'custom_rpg_titles',
      value: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.log('Failed to save custom title to cloud:', e);
  }

  return updated;
}

export async function deleteCustomTitle(titleId: string): Promise<RpgTitle[]> {
  const current = await getCustomTitles();
  const updated = current.filter(t => t.id !== titleId);
  inMemoryCustomTitles = updated;

  try {
    await AsyncStorage.setItem(KEY_CUSTOM_TITLES, JSON.stringify(updated));
    await supabase.from('app_settings').upsert({
      key: 'custom_rpg_titles',
      value: JSON.stringify(updated),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.log('Failed to delete custom title from cloud:', e);
  }

  return updated;
}

export function pickWheelResult(): { segment: WheelSegment; angleIndex: number } {
  const totalWeight = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  let rand = Math.random() * totalWeight;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    rand -= WHEEL_SEGMENTS[i].weight;
    if (rand <= 0) return { segment: WHEEL_SEGMENTS[i], angleIndex: i };
  }
  return { segment: WHEEL_SEGMENTS[0], angleIndex: 0 };
}

export async function getChestCount(): Promise<number> {
  try { const raw = await AsyncStorage.getItem(KEY_CHESTS); return parseInt(raw || '0', 10); } catch { return 0; }
}
export async function addChest(amount = 1): Promise<number> {
  try { const c = await getChestCount(); const n = c + amount; await AsyncStorage.setItem(KEY_CHESTS, String(n)); return n; } catch { return 0; }
}
export async function consumeChest(): Promise<boolean> {
  try { const c = await getChestCount(); if (c <= 0) return false; await AsyncStorage.setItem(KEY_CHESTS, String(c - 1)); return true; } catch { return false; }
}

export async function getUnlockedTitles(): Promise<string[]> {
  try { const raw = await AsyncStorage.getItem(KEY_TITLES); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
export async function unlockTitle(titleId: string): Promise<string[]> {
  try { const c = await getUnlockedTitles(); if (c.includes(titleId)) return c; const u = [...c, titleId]; await AsyncStorage.setItem(KEY_TITLES, JSON.stringify(u)); return u; } catch { return []; }
}
export async function getActiveTitle(): Promise<RpgTitle | null> {
  try {
    const id = await AsyncStorage.getItem(KEY_ACTIVE_TITLE);
    if (!id) return null;
    return getAllRpgTitles().find(t => t.id === id) || null;
  } catch {
    return null;
  }
}
export async function setActiveTitle(titleId: string | null): Promise<void> {
  try { if (titleId === null) { await AsyncStorage.removeItem(KEY_ACTIVE_TITLE); } else { await AsyncStorage.setItem(KEY_ACTIVE_TITLE, titleId); } } catch {}
}

export async function getWheelTickets(): Promise<number> {
  try { const raw = await AsyncStorage.getItem(KEY_WHEEL_TICKETS); return parseInt(raw || '0', 10); } catch { return 0; }
}
export async function addWheelTicket(): Promise<number> {
  try { const c = await getWheelTickets(); const n = c + 1; await AsyncStorage.setItem(KEY_WHEEL_TICKETS, String(n)); return n; } catch { return 0; }
}
export async function consumeWheelTicket(): Promise<boolean> {
  try { const c = await getWheelTickets(); if (c <= 0) return false; await AsyncStorage.setItem(KEY_WHEEL_TICKETS, String(c - 1)); return true; } catch { return false; }
}
export async function awardWheelTicketForActivity(): Promise<number> {
  try {
    return await addWheelTicket();
  } catch {
    return 0;
  }
}
