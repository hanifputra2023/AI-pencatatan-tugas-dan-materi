import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GardenPlant {
  id: string;
  speciesId: 'sakura' | 'bonsai' | 'cactus' | 'sunflower';
  name: string;
  stage: 1 | 2 | 3 | 4; // 1: Bibit, 2: Tunas, 3: Rimbun, 4: Mekar Sempurna (MAX)
  growthPoints: number;  // Points within current stage
  plantedAt: string;
  completedAt?: string;
  isHarvested: boolean;
  buffActive: boolean;   // true when plant reached stage 4 (buff persists until plant changed)
}

export interface GardenSpecies {
  id: 'sakura' | 'bonsai' | 'cactus' | 'sunflower';
  name: string;
  subtitle: string;
  description: string;
  accentColor: string;
  iconName: string;
  bonusTitle: string;
  passiveBuff: string;
  buffCode: 'xp_boost' | 'streak_shield' | 'boss_shield' | 'login_boost';
}

// Water required to fill each stage (semakin naik fase, semakin banyak air)
export const WATER_PER_STAGE: Record<number, number> = {
  1: 3,  // Fase 1→2: butuh 3 siram
  2: 5,  // Fase 2→3: butuh 5 siram
  3: 8,  // Fase 3→4: butuh 8 siram (total 16 siram dari bibit ke mekar)
  4: 0,  // Fase 4: Sudah mekar sempurna, tidak perlu disiram lagi
};

// Growth points per water drop per stage
// Tiap siram = (100 / WATER_PER_STAGE[stage]) poin
export function getGrowthPerWater(stage: number): number {
  const w = WATER_PER_STAGE[stage] || 1;
  return Math.floor(100 / w);
}

export const GARDEN_SPECIES_LIST: GardenSpecies[] = [
  {
    id: 'sakura',
    name: 'Pohon Sakura Zen',
    subtitle: 'Simbol Ketenangan & Ketekunan',
    description: 'Tumbuh indah dengan kelopak merah muda saat kamu fokus belajar secara konsisten.',
    accentColor: '#F472B6',
    iconName: 'flower-outline',
    bonusTitle: 'Kolektor Sakura',
    passiveBuff: '+10% Ekstra XP Semua Aktivitas',
    buffCode: 'xp_boost',
  },
  {
    id: 'bonsai',
    name: 'Bonsai Kebijaksanaan',
    subtitle: 'Simbol Fokus & Pemikiran Mendalam',
    description: 'Pohon kerdil artistik yang melatih kesabaran dan keheningan dalam memahami materi sulit.',
    accentColor: '#10B981',
    iconName: 'leaf-outline',
    bonusTitle: 'Master Zen',
    passiveBuff: 'Pelindung Streak (Streak Freeze 1x/minggu)',
    buffCode: 'streak_shield',
  },
  {
    id: 'cactus',
    name: 'Kaktus Gurun Tangguh',
    subtitle: 'Simbol Daya Tahan & Antiruntuh',
    description: 'Mampu bertahan di tengah badai tugas dan ujian terberat hingga mengeluarkan bunga emas.',
    accentColor: '#F59E0B',
    iconName: 'shield-checkmark-outline',
    bonusTitle: 'Penakluk Deadline',
    passiveBuff: 'Bos Arena: HP berkurang -20% (lebih mudah dikalahkan)',
    buffCode: 'boss_shield',
  },
  {
    id: 'sunflower',
    name: 'Bunga Matahari Fajar',
    subtitle: 'Simbol Energi Positif & Optimisme',
    description: 'Mekar cerah menyerap semangat belajar baru setiap pagi hari.',
    accentColor: '#EAB308',
    iconName: 'sunny-outline',
    bonusTitle: 'Jiwa Pagi',
    passiveBuff: '+30 XP Ekstra dari Hadiah Harian & Kalender Login',
    buffCode: 'login_boost',
  },
];

const STORAGE_ACTIVE_PLANT = '@study_garden_active_plant';
const STORAGE_GARDEN_HARVESTS = '@study_garden_harvests';
const STORAGE_WATER_DROPS = '@study_garden_water_drops';
const STORAGE_LAST_DAILY_DROP = '@study_garden_last_daily_drop';

export async function getWaterDrops(): Promise<number> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const lastDaily = await AsyncStorage.getItem(STORAGE_LAST_DAILY_DROP);
    let currentDrops = parseInt(await AsyncStorage.getItem(STORAGE_WATER_DROPS) || '2', 10);
    if (lastDaily !== today) {
      currentDrops += 1;
      await AsyncStorage.setItem(STORAGE_LAST_DAILY_DROP, today);
      await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(currentDrops));
    }
    return currentDrops;
  } catch (e) { return 1; }
}

export async function addWaterDrops(amount: number): Promise<number> {
  try {
    const current = await getWaterDrops();
    const next = current + amount;
    await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(next));
    return next;
  } catch (e) { return 1; }
}

export async function consumeWaterDrop(): Promise<boolean> {
  try {
    const current = await getWaterDrops();
    if (current <= 0) return false;
    const next = current - 1;
    await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(next));
    return true;
  } catch (e) { return false; }
}

export async function getActivePlant(): Promise<GardenPlant> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_ACTIVE_PLANT);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate old plants that don't have buffActive field
      if (parsed.buffActive === undefined) {
        parsed.buffActive = parsed.stage === 4;
      }
      return parsed;
    }
  } catch (e) {}

  const defaultPlant: GardenPlant = {
    id: 'plant_' + Date.now(),
    speciesId: 'sakura',
    name: 'Sakura Pertama',
    stage: 1,
    growthPoints: 0,
    plantedAt: new Date().toISOString(),
    isHarvested: false,
    buffActive: false,
  };
  await saveActivePlant(defaultPlant);
  return defaultPlant;
}

export async function saveActivePlant(plant: GardenPlant): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_ACTIVE_PLANT, JSON.stringify(plant));
  } catch (e) {}
}

/**
 * Water the plant once. Adds (100 / WATER_PER_STAGE[stage]) growth points.
 * When growthPoints >= 100, advance to next stage and reset points to 0.
 * Stage 4 is max — cannot be watered further.
 * Returns null if plant is already at stage 4 (max).
 */
export async function waterPlant(): Promise<{ plant: GardenPlant; didLevelUp: boolean; didBloom: boolean } | null> {
  const current = await getActivePlant();

  // Stage 4 = fully bloomed, cannot water anymore
  if (current.stage >= 4) {
    return null;
  }

  const pointsPerWater = getGrowthPerWater(current.stage);
  const nextGrowth = current.growthPoints + pointsPerWater;

  let nextStage = current.stage;
  let nextGrowthClamped = nextGrowth;
  let didLevelUp = false;
  let didBloom = false;

  if (nextGrowth >= 100) {
    // Advance to next stage
    nextStage = (current.stage + 1) as 1 | 2 | 3 | 4;
    nextGrowthClamped = 0; // Reset progress for next stage
    didLevelUp = true;

    if (nextStage === 4) {
      didBloom = true;
    }
  } else {
    nextGrowthClamped = nextGrowth;
  }

  const updated: GardenPlant = {
    ...current,
    growthPoints: nextGrowthClamped,
    stage: nextStage,
    buffActive: nextStage === 4 ? true : current.buffActive,
    completedAt: didBloom ? new Date().toISOString() : current.completedAt,
  };

  await saveActivePlant(updated);

  if (didBloom) {
    await addPlantToHarvest(updated);
  }

  return { plant: updated, didLevelUp, didBloom };
}

/** Legacy wrapper kept for compatibility */
export async function addGrowthPoints(points: number): Promise<{ plant: GardenPlant; didLevelUp: boolean; didBloom: boolean }> {
  const result = await waterPlant();
  if (result) return result;
  const plant = await getActivePlant();
  return { plant, didLevelUp: false, didBloom: false };
}

/**
 * Get active plant buff code. Returns the buff if plant is stage 4 (mekar sempurna).
 * Buff persists even after planting a new seed ONLY IF the previous plant was harvested.
 * Changing to a new plant resets the buff.
 */
export async function getActivePlantBuff(): Promise<'xp_boost' | 'streak_shield' | 'boss_shield' | 'login_boost' | null> {
  try {
    const plant = await getActivePlant();
    if (plant.buffActive && plant.stage === 4) {
      const species = GARDEN_SPECIES_LIST.find(s => s.id === plant.speciesId);
      return species?.buffCode ?? null;
    }
    return null;
  } catch { return null; }
}

/**
 * Apply the XP boost buff if plant buff = xp_boost.
 * Returns multiplied XP value.
 */
export async function applyXpBoostBuff(baseXp: number): Promise<number> {
  const buff = await getActivePlantBuff();
  if (buff === 'xp_boost') {
    return Math.round(baseXp * 1.10); // +10% XP
  }
  return baseXp;
}

/**
 * Apply boss_shield buff: reduces boss max HP by 20%.
 */
export async function applyBossShieldBuff(bossMaxHp: number): Promise<number> {
  const buff = await getActivePlantBuff();
  if (buff === 'boss_shield') {
    return Math.round(bossMaxHp * 0.80); // -20% HP
  }
  return bossMaxHp;
}

export async function getHarvestedPlants(): Promise<GardenPlant[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_GARDEN_HARVESTS);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

export async function addPlantToHarvest(plant: GardenPlant): Promise<void> {
  try {
    const list = await getHarvestedPlants();
    const exists = list.some(p => p.id === plant.id);
    if (!exists) {
      const updatedList = [{ ...plant, isHarvested: true }, ...list];
      await AsyncStorage.setItem(STORAGE_GARDEN_HARVESTS, JSON.stringify(updatedList));
    }
  } catch (e) {}
}

export async function plantNewSeed(speciesId: 'sakura' | 'bonsai' | 'cactus' | 'sunflower', name?: string): Promise<GardenPlant> {
  const species = GARDEN_SPECIES_LIST.find(s => s.id === speciesId) || GARDEN_SPECIES_LIST[0];
  const newPlant: GardenPlant = {
    id: 'plant_' + Date.now(),
    speciesId,
    name: name || species.name,
    stage: 1,
    growthPoints: 0,
    plantedAt: new Date().toISOString(),
    isHarvested: false,
    buffActive: false,  // Buff reset when new plant is planted
  };
  await saveActivePlant(newPlant);
  return newPlant;
}
