import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GardenPlant {
  id: string;
  speciesId: 'sakura' | 'bonsai' | 'cactus' | 'sunflower';
  name: string;
  stage: 1 | 2 | 3 | 4; // 1: Seedling, 2: Sprout, 3: Growing, 4: Blooming / Master
  growthPoints: number; // 0 to 100
  plantedAt: string;
  completedAt?: string;
  isHarvested: boolean;
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

export const GARDEN_SPECIES_LIST: GardenSpecies[] = [
  {
    id: 'sakura',
    name: 'Pohon Sakura Zen',
    subtitle: 'Simbol Ketenangan & Ketekunan',
    description: 'Tumbuh indah dengan kelopak merah muda saat kamu fokus belajar secara konsisten.',
    accentColor: '#F472B6',
    iconName: 'flower-outline',
    bonusTitle: 'Kolektor Sakura',
    passiveBuff: '+5% Ekstra XP Semua Aktivitas',
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
    passiveBuff: 'Pelindung Streak (Streak Freeze)',
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
    passiveBuff: 'Pertahanan Bos Arena (+20% Armor)',
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
    passiveBuff: '+25 XP Ekstra Hadiah Harian',
    buffCode: 'login_boost',
  },
];

const STORAGE_ACTIVE_PLANT = '@study_garden_active_plant';
const STORAGE_GARDEN_HARVESTS = '@study_garden_harvests';
const STORAGE_WATER_DROPS = '@study_garden_water_drops';
const STORAGE_LAST_DAILY_DROP = '@study_garden_last_daily_drop';

export async function getWaterDrops(): Promise<number> {
  try {
    // Check if daily free water drop should be awarded
    const today = new Date().toISOString().slice(0, 10);
    const lastDaily = await AsyncStorage.getItem(STORAGE_LAST_DAILY_DROP);
    let currentDrops = parseInt(await AsyncStorage.getItem(STORAGE_WATER_DROPS) || '2', 10);

    if (lastDaily !== today) {
      currentDrops += 1; // +1 Free daily water drop
      await AsyncStorage.setItem(STORAGE_LAST_DAILY_DROP, today);
      await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(currentDrops));
    }
    return currentDrops;
  } catch (e) {
    return 1;
  }
}

export async function addWaterDrops(amount: number): Promise<number> {
  try {
    const current = await getWaterDrops();
    const next = current + amount;
    await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(next));
    return next;
  } catch (e) {
    return 1;
  }
}

export async function consumeWaterDrop(): Promise<boolean> {
  try {
    const current = await getWaterDrops();
    if (current <= 0) return false;
    const next = current - 1;
    await AsyncStorage.setItem(STORAGE_WATER_DROPS, String(next));
    return true;
  } catch (e) {
    return false;
  }
}

export async function getActivePlant(): Promise<GardenPlant> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_ACTIVE_PLANT);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('Error reading active plant:', e);
  }

  // Default initial plant
  const defaultPlant: GardenPlant = {
    id: 'plant_' + Date.now(),
    speciesId: 'sakura',
    name: 'Sakura Pertama',
    stage: 1,
    growthPoints: 15,
    plantedAt: new Date().toISOString(),
    isHarvested: false,
  };
  await saveActivePlant(defaultPlant);
  return defaultPlant;
}

export async function saveActivePlant(plant: GardenPlant): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_ACTIVE_PLANT, JSON.stringify(plant));
  } catch (e) {
    console.log('Error saving active plant:', e);
  }
}

export async function addGrowthPoints(points: number): Promise<{ plant: GardenPlant; didLevelUp: boolean; didBloom: boolean }> {
  const current = await getActivePlant();
  let nextGrowth = current.growthPoints + points;
  let nextStage = current.stage;
  let didLevelUp = false;
  let didBloom = false;

  if (nextGrowth >= 100) {
    nextGrowth = 100;
    if (current.stage < 4) {
      nextStage = 4;
      didLevelUp = true;
      didBloom = true;
      current.completedAt = new Date().toISOString();
    }
  } else if (nextGrowth >= 70 && current.stage < 3) {
    nextStage = 3;
    didLevelUp = true;
  } else if (nextGrowth >= 35 && current.stage < 2) {
    nextStage = 2;
    didLevelUp = true;
  }

  const updated: GardenPlant = {
    ...current,
    growthPoints: nextGrowth,
    stage: nextStage,
  };

  await saveActivePlant(updated);

  // If bloomed and stage 4, also add to harvest collection
  if (didBloom) {
    await addPlantToHarvest(updated);
  }

  return { plant: updated, didLevelUp, didBloom };
}

export async function getHarvestedPlants(): Promise<GardenPlant[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_GARDEN_HARVESTS);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('Error reading harvests:', e);
  }
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
  } catch (e) {
    console.log('Error adding harvest:', e);
  }
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
  };
  await saveActivePlant(newPlant);
  return newPlant;
}
