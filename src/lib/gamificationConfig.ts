import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const KEY_GAMIFICATION_CONFIG = '@gamification_config';

export interface WheelSectorConfig {
  id: string;
  label: string;
  xp: number;
  water: number;
  chest: number;
  weight: number; // Percentage probability weight (1-100)
  color: string;
  icon: string;
}

export interface GamificationConfig {
  // 📈 XP & Level Progression
  xpMultiplier: number; // Difficulty: 0.5x = 2x XP (Easier), 1.0x = Normal, 2.0x = half XP (Hardcore)
  xpPerNote: number;
  xpPerTask: number;
  xpPerJournal: number;
  xpPerQuiz: number;
  xpPerStreakDay: number;

  // 🎡 Lucky Wheel Settings
  wheelDailyFreeTickets: number;
  wheelJackpotWeight: number; // % chance for jackpot
  wheelSectors: WheelSectorConfig[];

  // 🎁 Peti Hadiah / Loot Chest
  chestCooldownMinutes: number; // 0 = instant open
  chestMinXp: number;
  chestMaxXp: number;
  chestDropLegendaryRate: number; // 1-100% (legacy, kept for compat)

  // 🎲 Drop Rate per Rarity (%)
  chestDropRateMythic: number;     // default 4
  chestDropRateLegendary: number;  // default 12
  chestDropRateEpic: number;       // default 24
  chestDropRateWater: number;      // default 25
  // remainder = XP Rare drop

  // 💰 XP Bonus per Rarity (when chest drops title of that rarity)
  chestXpMythic: number;     // default 200
  chestXpLegendary: number;  // default 120
  chestXpEpic: number;       // default 75

  // 💧 Water range (for water drops)
  chestWaterMin: number;  // default 3
  chestWaterMax: number;  // default 5

  // 👑 Gelar & Lencana RPG
  rpgRequirementMultiplier: number; // 1.0 = normal, 2.0 = 2x harder requirements

  // ⚡ Happy Hour / Double XP Boost
  happyHourEnabled: boolean;
  happyHourStartHour: number; // 0-23
  happyHourEndHour: number;   // 0-23
  happyHourMultiplier: number;

  // ⚔️ World Boss Raid Event
  bossEventActive: boolean;
  bossEventName: string;
  bossEventEmoji: string;
  bossEventTotalHp: number;
  bossEventCurrentHp: number;
  bossEventRewardXp: number;
  bossEventRewardChests: number;
  bossEventExpiresAt?: number;
}

export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  xpMultiplier: 1.0,
  xpPerNote: 25,
  xpPerTask: 20,
  xpPerJournal: 15,
  xpPerQuiz: 10,
  xpPerStreakDay: 30,

  wheelDailyFreeTickets: 1,
  wheelJackpotWeight: 5,
  wheelSectors: [
    { id: '1', label: '+30 XP', xp: 30, water: 0, chest: 0, weight: 30, color: '#3B82F6', icon: 'star' },
    { id: '2', label: '+1 💧 Air', xp: 0, water: 1, chest: 0, weight: 25, color: '#06B6D4', icon: 'water' },
    { id: '3', label: '+50 XP', xp: 50, water: 0, chest: 0, weight: 15, color: '#8B5CF6', icon: 'sparkles' },
    { id: '4', label: '1 Hadiah 📦', xp: 0, water: 0, chest: 1, weight: 10, color: '#F59E0B', icon: 'cube' },
    { id: '5', label: '+20 XP', xp: 20, water: 0, chest: 0, weight: 20, color: '#10B981', icon: 'flash' },
    { id: '6', label: '+3 💧 Air', xp: 0, water: 3, chest: 0, weight: 10, color: '#0284C7', icon: 'water' },
    { id: '7', label: 'JACKPOT 150 XP', xp: 150, water: 2, chest: 0, weight: 5, color: '#EF4444', icon: 'trophy' },
    { id: '8', label: '+75 XP', xp: 75, water: 0, chest: 0, weight: 10, color: '#EC4899', icon: 'flame' },
  ],

  chestCooldownMinutes: 0,
  chestMinXp: 25,
  chestMaxXp: 150,
  chestDropLegendaryRate: 8,

  chestDropRateMythic: 4,
  chestDropRateLegendary: 12,
  chestDropRateEpic: 24,
  chestDropRateWater: 25,

  chestXpMythic: 200,
  chestXpLegendary: 120,
  chestXpEpic: 75,

  chestWaterMin: 3,
  chestWaterMax: 5,

  rpgRequirementMultiplier: 1.0,

  happyHourEnabled: false,
  happyHourStartHour: 19,
  happyHourEndHour: 21,
  happyHourMultiplier: 2.0,

  bossEventActive: false,
  bossEventName: 'Naga Ujian Nasional',
  bossEventEmoji: '🐉',
  bossEventTotalHp: 5000,
  bossEventCurrentHp: 5000,
  bossEventRewardXp: 250,
  bossEventRewardChests: 2,
};

let inMemoryConfig: GamificationConfig = { ...DEFAULT_GAMIFICATION_CONFIG };

/**
 * Get current gamification config with local offline-first fallback
 */
export async function getGamificationConfig(): Promise<GamificationConfig> {
  try {
    const cached = await AsyncStorage.getItem(KEY_GAMIFICATION_CONFIG);
    if (cached) {
      inMemoryConfig = { ...DEFAULT_GAMIFICATION_CONFIG, ...JSON.parse(cached) };
    }

    // Try background fetch from Supabase if online
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gamification_config')
      .maybeSingle();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      inMemoryConfig = { ...DEFAULT_GAMIFICATION_CONFIG, ...parsed };
      await AsyncStorage.setItem(KEY_GAMIFICATION_CONFIG, JSON.stringify(inMemoryConfig));
    }
  } catch (e) {
    // Return cached/inMemory on error
  }
  return inMemoryConfig;
}

export function getInMemoryGamificationConfig(): GamificationConfig {
  return inMemoryConfig;
}

/**
 * Save gamification config to Supabase & local cache
 */
export async function saveGamificationConfig(newConfig: Partial<GamificationConfig>): Promise<GamificationConfig> {
  const merged: GamificationConfig = { ...inMemoryConfig, ...newConfig };
  inMemoryConfig = merged;

  try {
    // 1. Cache to AsyncStorage immediately for instant local reflection
    await AsyncStorage.setItem(KEY_GAMIFICATION_CONFIG, JSON.stringify(merged));

    // 2. Sync to Supabase cloud app_settings
    await supabase.from('app_settings').upsert({
      key: 'gamification_config',
      value: JSON.stringify(merged),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.log('Failed to sync gamification config to cloud:', e);
  }

  return merged;
}

/**
 * Reset config to default
 */
export async function resetGamificationConfig(): Promise<GamificationConfig> {
  return saveGamificationConfig(DEFAULT_GAMIFICATION_CONFIG);
}

/**
 * Check if Happy Hour Double XP is currently active
 */
export function isHappyHourActive(config?: GamificationConfig): boolean {
  const cfg = config || inMemoryConfig;
  if (!cfg.happyHourEnabled) return false;
  const currentHour = new Date().getHours();
  return currentHour >= cfg.happyHourStartHour && currentHour < cfg.happyHourEndHour;
}
