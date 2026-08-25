import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_LUCKY_HOUR_LAST = '@lucky_hour_last_trigger';
const KEY_LUCKY_HOUR_ACTIVE = '@lucky_hour_active_until';

export const LUCKY_HOUR_DURATION_MS = 10 * 60 * 1000; // 10 minutes
export const LUCKY_HOUR_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours cooldown
export const LUCKY_HOUR_CHANCE = 0.18; // 18% chance
export const LUCKY_HOUR_MULTIPLIER = 2;

export interface LuckyHourStatus {
  active: boolean;
  expiresAt: number; // timestamp
  remainingMs: number;
}

export async function getLuckyHourStatus(): Promise<LuckyHourStatus> {
  try {
    const raw = await AsyncStorage.getItem(KEY_LUCKY_HOUR_ACTIVE);
    if (!raw) return { active: false, expiresAt: 0, remainingMs: 0 };
    const expiresAt = parseInt(raw);
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) {
      await AsyncStorage.removeItem(KEY_LUCKY_HOUR_ACTIVE);
      return { active: false, expiresAt: 0, remainingMs: 0 };
    }
    return { active: true, expiresAt, remainingMs };
  } catch { return { active: false, expiresAt: 0, remainingMs: 0 }; }
}

export async function tryTriggerLuckyHour(): Promise<boolean> {
  try {
    // Check cooldown
    const lastRaw = await AsyncStorage.getItem(KEY_LUCKY_HOUR_LAST);
    const now = Date.now();
    if (lastRaw && now - parseInt(lastRaw) < LUCKY_HOUR_COOLDOWN_MS) return false;

    // Check if already active
    const status = await getLuckyHourStatus();
    if (status.active) return false;

    // Roll the dice
    if (Math.random() > LUCKY_HOUR_CHANCE) return false;

    // Activate!
    const expiresAt = now + LUCKY_HOUR_DURATION_MS;
    await AsyncStorage.setItem(KEY_LUCKY_HOUR_ACTIVE, String(expiresAt));
    await AsyncStorage.setItem(KEY_LUCKY_HOUR_LAST, String(now));
    return true;
  } catch { return false; }
}

export async function activateLuckyHour(): Promise<void> {
  try {
    const expiresAt = Date.now() + LUCKY_HOUR_DURATION_MS;
    await AsyncStorage.setItem(KEY_LUCKY_HOUR_ACTIVE, String(expiresAt));
    await AsyncStorage.setItem(KEY_LUCKY_HOUR_LAST, String(Date.now()));
  } catch {}
}
