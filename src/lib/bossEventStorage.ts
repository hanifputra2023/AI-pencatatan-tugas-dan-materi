import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BOSS_EVENT = '@boss_event_current';
const KEY_BOSS_EVENT_VICTORIES = '@boss_event_victories';
const KEY_BOSS_EVENT_LAST_CHECK = '@boss_event_last_check';

export interface BossEvent {
  id: string;
  name: string;
  title: string;
  emoji: string;
  color: string;
  description: string;
  startTime: number; // timestamp ms
  endTime: number;   // startTime + 24 hours
  defeated: boolean;
  rewards: {
    xp: number;
    water: number;
    chests: number;
    titleId: string;
    titleLabel: string;
  };
}

const EVENT_BOSS_POOL: Omit<BossEvent, 'id' | 'startTime' | 'endTime' | 'defeated'>[] = [
  {
    name: 'Naga Ujian Nasional',
    title: 'Boss Event Mingguan',
    emoji: '🐉',
    color: '#DC2626',
    description: 'Naga kuno yang menjaga ilmu tersembunyi. Kalahkan dia sebelum 24 jam berlalu!',
    rewards: { xp: 200, water: 5, chests: 2, titleId: 'naga_api_belajar', titleLabel: 'Naga Api Belajar' },
  },
  {
    name: 'Golem Algoritma',
    title: 'Boss Event Terbatas',
    emoji: '🤖',
    color: '#7C3AED',
    description: 'Golem raksasa dari kode dan logika. Hanya yang menguasai materi yang bisa mengalahkannya!',
    rewards: { xp: 150, water: 4, chests: 1, titleId: 'arsitek_logika', titleLabel: 'Arsitek Logika' },
  },
  {
    name: 'Iblis Deadline',
    title: 'Boss Langka',
    emoji: '😈',
    color: '#EF4444',
    description: 'Roh jahat yang mengendalikan waktu. Selesaikan kuis sebelum waktunya habis!',
    rewards: { xp: 180, water: 3, chests: 2, titleId: 'penguasa_deadline', titleLabel: 'Penguasa Deadline' },
  },
  {
    name: 'Sphinx Pengetahuan',
    title: 'Boss Misterius',
    emoji: '🦁',
    color: '#D97706',
    description: 'Sphinx kuno yang menguji siapa pun yang mendekatinya dengan teka-teki pengetahuan.',
    rewards: { xp: 220, water: 6, chests: 3, titleId: 'shadow_of_wisdom', titleLabel: 'Shadow of Wisdom' },
  },
];

export async function getCurrentBossEvent(): Promise<BossEvent | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BOSS_EVENT);
    if (!raw) return null;
    const event: BossEvent = JSON.parse(raw);
    // Expired?
    if (Date.now() > event.endTime) {
      await AsyncStorage.removeItem(KEY_BOSS_EVENT);
      return null;
    }
    return event;
  } catch { return null; }
}

export async function trySpawnBossEvent(): Promise<BossEvent | null> {
  try {
    // Only check once per 4 hours
    const lastCheck = await AsyncStorage.getItem(KEY_BOSS_EVENT_LAST_CHECK);
    const now = Date.now();
    if (lastCheck && now - parseInt(lastCheck) < 4 * 60 * 60 * 1000) {
      return await getCurrentBossEvent();
    }
    await AsyncStorage.setItem(KEY_BOSS_EVENT_LAST_CHECK, String(now));

    // Already have an active event?
    const existing = await getCurrentBossEvent();
    if (existing) return existing;

    // 30% chance to spawn a new event
    if (Math.random() > 0.30) return null;

    const template = EVENT_BOSS_POOL[Math.floor(Math.random() * EVENT_BOSS_POOL.length)];
    const event: BossEvent = {
      ...template,
      id: `boss_event_${now}`,
      startTime: now,
      endTime: now + 24 * 60 * 60 * 1000, // 24 hours
      defeated: false,
    };
    await AsyncStorage.setItem(KEY_BOSS_EVENT, JSON.stringify(event));
    return event;
  } catch { return null; }
}

export async function defeatBossEvent(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BOSS_EVENT);
    if (!raw) return;
    const event: BossEvent = JSON.parse(raw);
    event.defeated = true;
    await AsyncStorage.setItem(KEY_BOSS_EVENT, JSON.stringify(event));

    // Save to victories log
    const victoriesRaw = await AsyncStorage.getItem(KEY_BOSS_EVENT_VICTORIES);
    const victories: string[] = victoriesRaw ? JSON.parse(victoriesRaw) : [];
    victories.push(event.id);
    await AsyncStorage.setItem(KEY_BOSS_EVENT_VICTORIES, JSON.stringify(victories));
  } catch {}
}

export async function getBossEventVictoryCount(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BOSS_EVENT_VICTORIES);
    return raw ? JSON.parse(raw).length : 0;
  } catch { return 0; }
}

export function getTimeRemaining(endTime: number): { hours: number; minutes: number; seconds: number; expired: boolean } {
  const diff = endTime - Date.now();
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { hours, minutes, seconds, expired: false };
}
