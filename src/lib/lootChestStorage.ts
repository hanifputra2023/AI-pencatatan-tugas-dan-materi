import AsyncStorage from '@react-native-async-storage/async-storage';
import { addWaterDrops } from './gardenStorage';

const KEY_CHESTS = '@loot_chest_inventory';
const KEY_TITLES = '@rpg_titles_unlocked';
const KEY_ACTIVE_TITLE = '@rpg_active_title';
const KEY_WHEEL_TICKETS = '@lucky_wheel_tickets';
const KEY_WHEEL_LAST_ACTIVITY_DATE = '@lucky_wheel_last_activity_date';

export type LootRarity = 'common' | 'rare' | 'epic' | 'legendary';

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
  { id: 'penakluk_golem', label: 'Penakluk Golem Kalkulus', icon: 'skull', color: '#F59E0B', description: 'Mengalahkan bos pertama', rarity: 'common' },
  { id: 'penguasa_deadline', label: 'Penguasa Deadline', icon: 'time', color: '#EF4444', description: 'Menyelesaikan tugas tepat waktu', rarity: 'common' },
  { id: 'arsitek_logika', label: 'Arsitek Logika', icon: 'construct', color: '#3B82F6', description: 'Jawab 10 soal tanpa salah', rarity: 'rare' },
  { id: 'dewa_taman_zen', label: 'Dewa Taman Zen', icon: 'flower', color: '#10B981', description: 'Panen 3 tanaman mekar penuh', rarity: 'rare' },
  { id: 'samurai_belajar', label: 'Samurai Belajar', icon: 'flash', color: '#8B5CF6', description: 'Combo 4x berturut dalam kuis', rarity: 'epic' },
  { id: 'sang_roh_akademis', label: 'Sang Roh Akademis', icon: 'star', color: '#FBBF24', description: 'Capai streak 7 hari berturut', rarity: 'epic' },
  { id: 'dewa_begadang', label: 'Dewa Begadang', icon: 'moon', color: '#6366F1', description: 'Belajar setelah jam 11 malam', rarity: 'common' },
  { id: 'monster_catatan', label: 'Monster Catatan', icon: 'document-text', color: '#14B8A6', description: 'Membuat 10+ catatan kuliah', rarity: 'rare' },
  { id: 'pendekar_pomodoro', label: 'Pendekar Pomodoro', icon: 'timer', color: '#F97316', description: 'Selesaikan 5 sesi Pomodoro', rarity: 'common' },
  { id: 'legenda_arena', label: 'Legenda Arena', icon: 'trophy', color: '#EAB308', description: 'Kalahkan 5 boss berbeda', rarity: 'epic' },
  { id: 'penjelajah_ilmu', label: 'Penjelajah Ilmu', icon: 'compass', color: '#06B6D4', description: 'Membuka 5 jenis materi berbeda', rarity: 'rare' },
  { id: 'shadow_of_wisdom', label: 'Shadow of Wisdom', icon: 'eye', color: '#A855F7', description: 'Diperoleh dari Peti Langka', rarity: 'legendary' },
  { id: 'ultima_scholar', label: 'Ultima Scholar', icon: 'diamond', color: '#22D3EE', description: 'Gelar paling langka di app', rarity: 'legendary' },
  { id: 'wali_ujian', label: 'Wali Ujian', icon: 'shield-checkmark', color: '#10B981', description: 'Raih XP di atas 1000', rarity: 'epic' },
  { id: 'jiwa_pagi', label: 'Jiwa Pagi', icon: 'sunny', color: '#FDE68A', description: 'Login sebelum jam 7 pagi', rarity: 'common' },
  { id: 'pemimpin_forum', label: 'Pemimpin Forum', icon: 'people', color: '#EC4899', description: 'Diperoleh dari Lucky Wheel', rarity: 'rare' },
  { id: 'sang_alchemist', label: 'Sang Alchemist', icon: 'flask', color: '#7C3AED', description: 'Buka peti 3x dalam sehari', rarity: 'rare' },
  { id: 'penguasa_roda', label: 'Penguasa Roda Nasib', icon: 'refresh-circle', color: '#F472B6', description: 'Menang Jackpot di Lucky Wheel', rarity: 'epic' },
  { id: 'naga_api_belajar', label: 'Naga Api Belajar', icon: 'flame', color: '#DC2626', description: 'Streak 14 hari berturut-turut', rarity: 'legendary' },
  { id: 'dewa_koin_emas', label: 'Dewa Koin Emas', icon: 'cash', color: '#FBBF24', description: 'Kumpulkan 500+ XP total', rarity: 'epic' },
];

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { id: 'xp_small', label: '+30 XP', subLabel: 'Bonus Belajar', color: '#1E40AF', textColor: '#FFFFFF', icon: 'star', weight: 25,
    reward: { type: 'xp', rarity: 'common', label: '+30 XP', value: 30, icon: 'star', color: '#60A5FA', xpAmount: 30 } },
  { id: 'water_3', label: '+3 Tetes Air', subLabel: 'Untuk Taman', color: '#0369A1', textColor: '#FFFFFF', icon: 'water', weight: 20,
    reward: { type: 'water', rarity: 'common', label: '+3 Tetes Air', value: 3, icon: 'water', color: '#38BDF8', waterAmount: 3 } },
  { id: 'xp_medium', label: '+60 XP', subLabel: 'Bonus Kuliah', color: '#7C3AED', textColor: '#FFFFFF', icon: 'flash', weight: 20,
    reward: { type: 'xp', rarity: 'common', label: '+60 XP', value: 60, icon: 'flash', color: '#A78BFA', xpAmount: 60 } },
  { id: 'chest_free', label: 'Peti Gratis!', subLabel: 'Misterius', color: '#B45309', textColor: '#FFFFFF', icon: 'gift', weight: 12,
    reward: { type: 'xp', rarity: 'rare', label: 'Peti Misterius Gratis!', value: 1, icon: 'gift', color: '#F59E0B', xpAmount: 0 } },
  { id: 'xp_big', label: '+100 XP', subLabel: '+ 2 Tetes Air', color: '#059669', textColor: '#FFFFFF', icon: 'trending-up', weight: 10,
    reward: { type: 'xp', rarity: 'rare', label: '+100 XP + 2 Tetes Air', value: 100, icon: 'trending-up', color: '#34D399', xpAmount: 100, waterAmount: 2 } },
  { id: 'title_random', label: 'Gelar RPG!', subLabel: 'Acak', color: '#9D174D', textColor: '#FFFFFF', icon: 'ribbon', weight: 8,
    reward: { type: 'title', rarity: 'rare', label: 'Gelar RPG Acak', value: 'random', icon: 'ribbon', color: '#F472B6' } },
  { id: 'streak_shield', label: 'Streak Shield', subLabel: 'Pelindung Streak', color: '#1D4ED8', textColor: '#FFFFFF', icon: 'shield', weight: 8,
    reward: { type: 'xp', rarity: 'epic', label: 'Streak Shield Aktif!', value: 50, icon: 'shield', color: '#60A5FA', xpAmount: 50 } },
  { id: 'jackpot', label: 'JACKPOT!', subLabel: '+200 XP', color: '#DC2626', textColor: '#FFFFFF', icon: 'trophy', weight: 5,
    reward: { type: 'xp', rarity: 'legendary', label: 'JACKPOT! +200 XP', value: 200, icon: 'trophy', color: '#EF4444', xpAmount: 200 } },
];

export const RARITY_COLORS: Record<LootRarity, string> = {
  common: '#6B7280', rare: '#3B82F6', epic: '#8B5CF6', legendary: '#F59E0B',
};
export const RARITY_LABELS: Record<LootRarity, string> = {
  common: 'Biasa', rare: 'Langka', epic: 'Epik', legendary: 'Legendaris',
};

export function rollLootChest(): LootResult {
  const rand = Math.random() * 100;
  if (rand < 5) {
    const skinColors = ['#EC4899', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];
    const color = skinColors[Math.floor(Math.random() * skinColors.length)];
    return { type: 'skin', rarity: 'legendary', label: 'Skin Tema Eksklusif', value: color, icon: 'color-palette', color, skinColor: color };
  } else if (rand < 20) {
    const pool = Math.random() < 0.3
      ? ALL_RPG_TITLES.filter(t => t.rarity === 'epic' || t.rarity === 'legendary')
      : ALL_RPG_TITLES.filter(t => t.rarity === 'rare');
    const title = pool[Math.floor(Math.random() * pool.length)];
    return { type: 'title', rarity: title.rarity, label: `Gelar: ${title.label}`, value: title.id, icon: title.icon, color: title.color, titleId: title.id };
  } else if (rand < 45) {
    const amount = Math.floor(Math.random() * 3) + 3;
    return { type: 'water', rarity: 'common', label: `+${amount} Tetes Air`, value: amount, icon: 'water', color: '#38BDF8', waterAmount: amount };
  } else if (rand < 60) {
    const xp = (Math.floor(Math.random() * 6) + 10) * 10;
    return { type: 'xp', rarity: 'rare', label: `+${xp} XP Raksasa!`, value: xp, icon: 'flash', color: '#A78BFA', xpAmount: xp };
  } else {
    const xp = (Math.floor(Math.random() * 11) + 2) * 5;
    return { type: 'xp', rarity: 'common', label: `+${xp} XP`, value: xp, icon: 'star', color: '#FBBF24', xpAmount: xp };
  }
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
  try { const id = await AsyncStorage.getItem(KEY_ACTIVE_TITLE); if (!id) return null; return ALL_RPG_TITLES.find(t => t.id === id) || null; } catch { return null; }
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
