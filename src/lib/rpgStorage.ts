import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BossTrophy {
  id: string;
  bossId: string;
  bossName: string;
  bossTitle: string;
  noteTitle: string;
  subject: string;
  earnedXp: number;
  defeatedAt: string;
}

const STORAGE_BOSS_TROPHIES = '@rpg_battle_trophies_v1';
const STORAGE_USER_EXTRA_XP = '@user_extra_earned_xp';

export async function getBossTrophies(): Promise<BossTrophy[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_BOSS_TROPHIES);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('Error reading boss trophies:', e);
  }
  return [];
}

export async function saveBossTrophy(trophy: Omit<BossTrophy, 'id' | 'defeatedAt'>): Promise<BossTrophy> {
  const newTrophy: BossTrophy = {
    ...trophy,
    id: 'trophy_' + Date.now(),
    defeatedAt: new Date().toISOString(),
  };

  try {
    const current = await getBossTrophies();
    const updated = [newTrophy, ...current];
    await AsyncStorage.setItem(STORAGE_BOSS_TROPHIES, JSON.stringify(updated));
    await addExtraUserXp(trophy.earnedXp);
  } catch (e) {
    console.log('Error saving boss trophy:', e);
  }

  return newTrophy;
}

export async function getExtraUserXp(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_USER_EXTRA_XP);
    if (raw) {
      return parseInt(raw, 10) || 0;
    }
  } catch (e) {
    console.log('Error reading extra xp:', e);
  }
  return 0;
}

export async function addExtraUserXp(xp: number): Promise<number> {
  try {
    const current = await getExtraUserXp();
    const next = current + xp;
    await AsyncStorage.setItem(STORAGE_USER_EXTRA_XP, next.toString());
    return next;
  } catch (e) {
    console.log('Error adding extra xp:', e);
  }
  return 0;
}
