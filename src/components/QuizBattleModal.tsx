import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet, Animated, Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import BossAvatarIllustration, { getDynamicBoss, getDynamicBossTwo, BossInfo } from './BossAvatarIllustration';
import { ConfettiBurst, XpPopup, ShakeView } from './DuolingoAnimations';
import { QuizQuestion } from '../types';
import { saveBossTrophy } from '../lib/rpgStorage';
import { addWaterDrops } from '../lib/gardenStorage';
import { unlockTitle, addChest, awardWheelTicketForActivity } from '../lib/lootChestStorage';

export interface QuizBattleQuestion {
  question: string;
  options: string[];
  correctIndex?: number;
  correct_answer?: string;
  explanation?: string;
}

interface QuizBattleModalProps {
  visible: boolean;
  onClose: () => void;
  noteTitle: string;
  subject?: string;
  quizQuestions: (QuizQuestion | QuizBattleQuestion)[];
  onBattleWon?: (earnedXp: number) => void;
}

export default function QuizBattleModal({
  visible,
  onClose,
  noteTitle,
  subject,
  quizQuestions,
  onBattleWon,
}: QuizBattleModalProps) {
  const { theme, isLightMode } = useTheme();

  const [boss, setBoss] = useState<BossInfo>(getDynamicBoss(noteTitle, subject));
  const [boss2, setBoss2] = useState<BossInfo | null>(null);
  const [bossPhase, setBossPhase] = useState<1 | 2>(1);
  const [boss1Defeated, setBoss1Defeated] = useState(false); // boss1 trophied after swap
  const [bossHp, setBossHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  const [isBossHit, setIsBossHit] = useState(false);
  const [isBossAttacking, setIsBossAttacking] = useState(false);
  const [triggerShake, setTriggerShake] = useState(false);
  const [floatingDamageText, setFloatingDamageText] = useState<string | null>(null);
  const [battleState, setBattleState] = useState<'fighting' | 'won' | 'lost' | 'draw'>('fighting');

  // Combo Streak System
  const [comboCount, setComboCount] = useState(0);
  const [comboFlash, setComboFlash] = useState(false);
  const comboAnim = useRef(new Animated.Value(0)).current;
  const comboScale = useRef(new Animated.Value(1)).current;

  const [showConfetti, setShowConfetti] = useState(false);
  const [showXp, setShowXp] = useState(false);

  // Dynamic Damage per Question Calculation
  const totalQuestions = Math.max(1, quizQuestions.length);
  const damagePerQ = Math.ceil(100 / totalQuestions);
  const playerDamagePerQ = Math.ceil(100 / Math.max(3, Math.floor(totalQuestions * 0.75)));

  // --- Dynamic Animation Values ---
  const idleY = useRef(new Animated.Value(0)).current;
  const idleScale = useRef(new Animated.Value(1)).current;
  const auraPulse = useRef(new Animated.Value(0.4)).current;

  const actionTranslateX = useRef(new Animated.Value(0)).current;
  const actionTranslateY = useRef(new Animated.Value(0)).current;
  const actionRotate = useRef(new Animated.Value(0)).current;
  const actionScale = useRef(new Animated.Value(1)).current;

  const slashTranslateX = useRef(new Animated.Value(-120)).current;
  const slashOpacity = useRef(new Animated.Value(0)).current;

  const damageTranslateY = useRef(new Animated.Value(0)).current;
  const damageOpacity = useRef(new Animated.Value(0)).current;

  const bossHpAnim = useRef(new Animated.Value(100)).current;
  const playerHpAnim = useRef(new Animated.Value(100)).current;

  // Start continuous idle breathing & aura loop
  useEffect(() => {
    if (visible) {
      const floatLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(idleY, {
            toValue: -8,
            duration: 1300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(idleY, {
            toValue: 0,
            duration: 1300,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );

      const breathLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(idleScale, {
            toValue: 1.03,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleScale, {
            toValue: 1.0,
            duration: 1500,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );

      const auraLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(auraPulse, {
            toValue: 0.85,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(auraPulse, {
            toValue: 0.35,
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      floatLoop.start();
      breathLoop.start();
      auraLoop.start();

      return () => {
        floatLoop.stop();
        breathLoop.stop();
        auraLoop.stop();
      };
    }
  }, [visible]);

  const resetBattleState = () => {
    const selectedBoss = getDynamicBoss(noteTitle, subject);
    setBoss(selectedBoss);
    setBoss2(getDynamicBossTwo(selectedBoss.id, noteTitle, subject));
    setBossPhase(1);
    setBoss1Defeated(false);
    setBossHp(100);
    setPlayerHp(100);
    bossHpAnim.setValue(100);
    playerHpAnim.setValue(100);
    setCurrentQIndex(0);
    setSelectedOption(null);
    setIsAnswerChecked(false);
    setIsCorrect(false);
    setBattleState('fighting');
    setIsBossHit(false);
    setIsBossAttacking(false);
    setShowConfetti(false);
    setShowXp(false);
    setFloatingDamageText(null);

    // Reset Combo & Critical System completely
    setComboCount(0);
    setComboFlash(false);
    comboAnim.setValue(0);
    comboScale.setValue(1);

    actionTranslateX.setValue(0);
    actionTranslateY.setValue(0);
    actionRotate.setValue(0);
    actionScale.setValue(1);
  };

  // Reset states on open
  useEffect(() => {
    if (visible) {
      resetBattleState();
    }
  }, [visible, noteTitle, subject]);

  const triggerFloatingDamage = (text: string) => {
    setFloatingDamageText(text);
    damageTranslateY.setValue(0);
    damageOpacity.setValue(1);

    Animated.parallel([
      Animated.timing(damageTranslateY, {
        toValue: -35,
        duration: 700,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
      Animated.timing(damageOpacity, {
        toValue: 0,
        duration: 700,
        delay: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setFloatingDamageText(null));
  };

  const triggerSlashVfx = () => {
    slashTranslateX.setValue(-80);
    slashOpacity.setValue(1);

    Animated.parallel([
      Animated.timing(slashTranslateX, {
        toValue: 120,
        duration: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slashOpacity, {
        toValue: 0,
        duration: 350,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const triggerBossHitAnimation = () => {
    setIsBossHit(true);
    triggerSlashVfx();

    Animated.sequence([
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: -14, duration: 90, useNativeDriver: true }),
        Animated.timing(actionRotate, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 0.92, duration: 90, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: 6, duration: 110, useNativeDriver: true }),
        Animated.timing(actionRotate, { toValue: -1, duration: 110, useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 1.05, duration: 110, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(actionRotate, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 1.0, duration: 140, useNativeDriver: true }),
      ]),
    ]).start(() => setIsBossHit(false));
  };

  const triggerBossAttackAnimation = () => {
    setIsBossAttacking(true);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: -10, duration: 150, useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: 24, duration: 120, easing: Easing.back(2), useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 1.22, duration: 120, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(actionTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(actionScale, { toValue: 1.0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start(() => setIsBossAttacking(false));
  };

  const handleSelectOption = (opt: string) => {
    if (isAnswerChecked || battleState !== 'fighting') return;
    setSelectedOption(opt);
  };

  const handleCheckAnswer = () => {
    if (!selectedOption || isAnswerChecked || battleState !== 'fighting') return;

    const currentQ = quizQuestions[currentQIndex] as any;
    const correctText = typeof currentQ.correct_answer === 'string'
      ? currentQ.correct_answer
      : (typeof currentQ.correctIndex === 'number' && currentQ.options ? currentQ.options[currentQ.correctIndex] : '');
    const correct = selectedOption === correctText;
    setIsCorrect(correct);
    setIsAnswerChecked(true);

    if (correct) {
      // Increment combo
      const newCombo = comboCount + 1;
      setComboCount(newCombo);

      // Combo-based damage multiplier
      let multiplier = 1.0;
      let comboLabel = `CRITICAL HIT! -${damagePerQ} HP`;
      if (newCombo >= 4) {
        multiplier = 2.5;
        comboLabel = `CRITICAL STRIKE x${newCombo}! 💥 -${Math.round(damagePerQ * multiplier)} HP`;
        unlockTitle('samurai_belajar').catch(() => {});
      } else if (newCombo === 3) {
        multiplier = 2.0;
        comboLabel = `COMBO x3! 🔥 -${Math.round(damagePerQ * multiplier)} HP`;
      } else if (newCombo === 2) {
        multiplier = 1.5;
        comboLabel = `COMBO x2! ⚡ -${Math.round(damagePerQ * multiplier)} HP`;
      }

      const actualDamage = Math.round(damagePerQ * multiplier);

      // Animate combo banner
      if (newCombo >= 2) {
        setComboFlash(true);
        Animated.sequence([
          Animated.timing(comboScale, { toValue: 1.35, duration: 180, useNativeDriver: true }),
          Animated.timing(comboScale, { toValue: 1.0, duration: 250, useNativeDriver: true }),
        ]).start(() => setComboFlash(false));
      }

      // Player attacks Boss!
      setTriggerShake(true);
      triggerBossHitAnimation();
      triggerFloatingDamage(comboLabel);

      const nextBossHp = Math.max(0, bossHp - actualDamage);
      setBossHp(nextBossHp);

      Animated.timing(bossHpAnim, {
        toValue: nextBossHp,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      setTimeout(() => setTriggerShake(false), 500);

      if (nextBossHp <= 0) {
        // Boss Phase defeated — swap to Phase 2 if still have questions left
        if (bossPhase === 1 && currentQIndex < quizQuestions.length - 1 && boss2) {
          // Swap to Phase 2 boss, continue remaining questions
          setTimeout(() => {
            setBoss1Defeated(true);
            setBoss(boss2);
            setBossPhase(2);
            setBossHp(100);
            bossHpAnim.setValue(100);
            triggerFloatingDamage('⚡ BARU! Bos Fase 2 Muncul!');
          }, 700);
        }
        // If last question and boss dies → handled in handleNextQuestion
      }
    } else {
      // Combo reset on wrong answer
      setComboCount(0);
      setComboFlash(false);

      // Boss attacks Player!
      setTriggerShake(true);
      triggerBossAttackAnimation();
      triggerFloatingDamage(`KENA SERANGAN! -${playerDamagePerQ} HP`);

      const nextPlayerHp = Math.max(0, playerHp - playerDamagePerQ);
      setPlayerHp(nextPlayerHp);

      Animated.timing(playerHpAnim, {
        toValue: nextPlayerHp,
        duration: 400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();

      setTimeout(() => setTriggerShake(false), 500);

      if (nextPlayerHp === 0) {
        setTimeout(() => setBattleState('lost'), 600);
      }
    }
  };

  const handleNextQuestion = () => {
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerChecked(false);
      setIsCorrect(false);
    } else {
      // All questions done — determine result
      const phase1BossForTrophy = boss1Defeated
        ? { id: boss.id, name: boss.name, title: boss.title } // boss was swapped, current boss is phase2
        : boss;

      if (boss1Defeated || bossHp === 0) {
        // At least boss 1 was defeated → Full Victory!
        // Boss 1 trophy already saved (if swapped mid-quiz). If boss1 died on last Q, save now.
        const trophyBoss = boss1Defeated ? boss2 || boss : boss;
        const firstBoss = boss1Defeated ? boss2 || boss : boss; // the one actually beaten

        setBattleState('won');
        setShowConfetti(true);
        setShowXp(true);

        saveBossTrophy({
          bossId: firstBoss.id,
          bossName: firstBoss.name,
          bossTitle: firstBoss.title,
          noteTitle: noteTitle || 'Catatan Kuliah',
          subject: subject || 'Kuliah Umum',
          earnedXp: 75,
        }).catch(() => {});
        addWaterDrops(1).catch(() => {});
        addChest(1).catch(() => {});
        awardWheelTicketForActivity().catch(() => {});
        onBattleWon?.(75);
      } else {
        // No boss defeated at all → draw
        setBattleState('draw');
        setShowXp(true);
        onBattleWon?.(30);
      }
    }
  };

  const currentBossLabel = bossPhase === 2 ? `⚡ Fase 2: ${boss.name}` : boss.name;

  if (!visible || !quizQuestions || quizQuestions.length === 0) return null;

  const currentQ = quizQuestions[currentQIndex] as any;
  const rotateDeg = actionRotate.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ConfettiBurst visible={showConfetti} count={60} />
        <XpPopup xp={75} visible={showXp} onDone={() => setShowXp(false)} />

        <View style={[styles.battleCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Header Bar */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View style={[styles.headerIconCircle, { backgroundColor: '#EF4444' + '25' }]}>
                <Ionicons name="flash" size={15} color="#EF4444" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.headerTitleText, { color: theme.text }]} numberOfLines={1}>Arena Pertarungan Bos AI</Text>
                <Text style={[styles.headerSubText, { color: theme.subtext }]} numberOfLines={1} ellipsizeMode="tail">
                  {noteTitle.length > 22 ? noteTitle.slice(0, 22) + '…' : noteTitle} • {currentQIndex + 1}/{quizQuestions.length} soal
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
              onPress={onClose}
            >
              <Ionicons name="close" size={15} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          {/* Battle Fighting Arena (SINGLE SCREEN - NO SCROLL) */}
          {battleState === 'fighting' && (
            <View style={styles.arenaContainer}>
              {/* Dual Health Status Bar */}
              <View style={[styles.hpStatusBarWrap, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                {/* Boss HP */}
                <View style={styles.singleHpCol}>
                  <View style={styles.hpLabelRow}>
                    <Text style={[styles.hpLabelName, { color: bossPhase === 2 ? '#A855F7' : theme.text }]} numberOfLines={1}>{currentBossLabel}</Text>
                    <Text style={[styles.hpValueText, { color: '#EF4444' }]}>{bossHp}% HP</Text>
                  </View>
                  <View style={[styles.hpTrack, { backgroundColor: theme.border }]}>
                    <Animated.View
                      style={[
                        styles.hpFill,
                        {
                          backgroundColor: '#EF4444',
                          width: bossHpAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        }
                      ]}
                    />
                  </View>
                </View>

                {/* VS Badge */}
                <View style={[styles.vsBadge, { backgroundColor: theme.accentBg }]}>
                  <Text style={[styles.vsText, { color: theme.accentLight }]}>VS</Text>
                </View>

                {/* Player HP */}
                <View style={styles.singleHpCol}>
                  <View style={styles.hpLabelRow}>
                    <Text style={[styles.hpLabelName, { color: theme.text }]}>Mahasiswa</Text>
                    <Text style={[styles.hpValueText, { color: '#10B981' }]}>{playerHp}% HP</Text>
                  </View>
                  <View style={[styles.hpTrack, { backgroundColor: theme.border }]}>
                    <Animated.View
                      style={[
                        styles.hpFill,
                        {
                          backgroundColor: '#10B981',
                          width: playerHpAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        }
                      ]}
                    />
                  </View>
                </View>
              </View>

              {/* Dynamic Animated Boss Stage */}
              <ShakeView trigger={triggerShake}>
                <View style={[styles.bossStageBox, { backgroundColor: isLightMode ? '#F8FAFC' : '#090D16', borderColor: isBossAttacking ? '#EF4444' : (comboCount >= 2 ? '#F59E0B88' : theme.border) }]}>

                  {/* Combo Streak Pill Badge */}
                  {comboCount >= 2 && (
                    <Animated.View
                      style={[
                        styles.comboPillBadge,
                        {
                          transform: [{ scale: comboScale }],
                          backgroundColor: comboCount >= 4 ? '#EF4444' : comboCount === 3 ? '#F59E0B' : '#8B5CF6',
                        },
                      ]}
                    >
                      <Ionicons name="flame" size={11} color="#FFFFFF" />
                      <Text style={styles.comboPillText}>
                        {comboCount >= 4 ? `CRITICAL x${comboCount}!` : `COMBO x${comboCount}!`}
                      </Text>
                    </Animated.View>
                  )}
                  
                  {/* Floating Damage Text Popup */}
                  {floatingDamageText && (
                    <Animated.View
                      style={[
                        styles.floatingDamageBubble,
                        {
                          transform: [{ translateY: damageTranslateY }],
                          opacity: damageOpacity,
                        }
                      ]}
                    >
                      <Text style={styles.floatingDamageText}>{floatingDamageText}</Text>
                    </Animated.View>
                  )}

                  {/* Animated Boss Figure (Idle Float + Action Reaction) */}
                  <Animated.View
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [
                        { translateY: Animated.add(idleY, actionTranslateY) },
                        { translateX: actionTranslateX },
                        { scale: Animated.multiply(idleScale, actionScale) },
                        { rotate: rotateDeg },
                      ],
                    }}
                  >
                    <BossAvatarIllustration bossId={boss.id} size={150} isHit={isBossHit} />
                  </Animated.View>

                  {/* Slash Blade VFX Streak */}
                  <Animated.View
                    style={[
                      styles.slashVfxStreak,
                      {
                        transform: [{ translateX: slashTranslateX }, { rotate: '-35deg' }],
                        opacity: slashOpacity,
                      }
                    ]}
                  />

                  {/* Boss Title & Type */}
                  <View style={styles.bossInfoFooter}>
                    <Text style={[styles.bossTitleBadge, { color: boss.accentColor || theme.accentLight }]}>
                      {boss.title}
                    </Text>
                  </View>
                </View>
              </ShakeView>

              {/* Question Box */}
              <View style={[styles.questionBox, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <Text style={[styles.questionText, { color: theme.text }]} numberOfLines={3}>
                  {currentQ.question}
                </Text>
              </View>

              {/* Compact 4-Option Grid / Rows */}
              <View style={styles.optionsList}>
                {currentQ.options.map((opt: string, idx: number) => {
                  const correctText = typeof currentQ.correct_answer === 'string'
                    ? currentQ.correct_answer
                    : (typeof currentQ.correctIndex === 'number' && currentQ.options ? currentQ.options[currentQ.correctIndex] : '');
                  const isSelected = selectedOption === opt;
                  const isTheCorrectOne = opt === correctText;

                  let optBg = theme.card;
                  let optBorder = theme.border;
                  let optTextColor = theme.text;

                  if (isAnswerChecked) {
                    if (isTheCorrectOne) {
                      optBg = isLightMode ? '#DCFCE7' : '#064E3B';
                      optBorder = '#10B981';
                      optTextColor = isLightMode ? '#15803D' : '#34D399';
                    } else if (isSelected && !isCorrect) {
                      optBg = isLightMode ? '#FEE2E2' : '#7F1D1D';
                      optBorder = '#EF4444';
                      optTextColor = isLightMode ? '#B91C1C' : '#F87171';
                    }
                  } else if (isSelected) {
                    optBg = theme.accentBg;
                    optBorder = theme.accentLight;
                    optTextColor = theme.accentLight;
                  }

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.optionBtn,
                        { backgroundColor: optBg, borderColor: optBorder },
                        isSelected && !isAnswerChecked && { borderWidth: 1.5 }
                      ]}
                      onPress={() => handleSelectOption(opt)}
                      activeOpacity={0.75}
                      disabled={isAnswerChecked}
                    >
                      <View style={[styles.optionIndexPill, { backgroundColor: optBorder + '33' }]}>
                        <Text style={[styles.optionIndexText, { color: optTextColor }]}>
                          {String.fromCharCode(65 + idx)}
                        </Text>
                      </View>
                      <Text style={[styles.optionBtnText, { color: optTextColor }]} numberOfLines={2}>
                        {opt}
                      </Text>
                      {isAnswerChecked && isTheCorrectOne && (
                        <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      )}
                      {isAnswerChecked && isSelected && !isCorrect && (
                        <Ionicons name="close-circle" size={16} color="#EF4444" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Action Button: Attack vs Next Question */}
              {!isAnswerChecked ? (
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    { backgroundColor: selectedOption ? '#EF4444' : theme.border }
                  ]}
                  onPress={handleCheckAnswer}
                  disabled={!selectedOption}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash" size={15} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Luncurkan Serangan!</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: theme.primary }]}
                  onPress={handleNextQuestion}
                  activeOpacity={0.8}
                >
                  <Text style={styles.actionBtnText}>
                    {currentQIndex < quizQuestions.length - 1 ? 'Lanjut ke Soal Berikutnya →' : 'Lihat Hasil Pertarungan 🏆'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Victory Screen */}
          {battleState === 'won' && (
            <View style={styles.endStateContainer}>
              <View style={[styles.endIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="trophy" size={38} color="#F59E0B" />
              </View>
              <Text style={[styles.endStateTitle, { color: theme.text }]}>Bos Berhasil Ditaklukkan!</Text>
              <Text style={[styles.endStateSub, { color: theme.subtext }]}>
                Kamu berhasil menguasai materi {noteTitle} dan mengalahkan {boss.name}!
              </Text>

              <View style={[styles.rewardCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <View style={styles.rewardRow}>
                  <Ionicons name="star" size={16} color="#F59E0B" />
                  <Text style={[styles.rewardText, { color: theme.text }]}>Bonus Penguasaan: <Text style={{ color: '#F59E0B', fontWeight: '800' }}>+75 XP</Text></Text>
                </View>
                <View style={styles.rewardRow}>
                  <Ionicons name="water" size={16} color="#38BDF8" />
                  <Text style={[styles.rewardText, { color: theme.text }]}>Bonus Taman: <Text style={{ color: '#38BDF8', fontWeight: '800' }}>+1 Tetes Air 💧</Text></Text>
                </View>
                <View style={styles.rewardRow}>
                  <Ionicons name="gift" size={16} color="#F59E0B" />
                  <Text style={[styles.rewardText, { color: theme.text }]}>Peti Misterius: <Text style={{ color: '#F59E0B', fontWeight: '800' }}>+1 Peti 📦</Text></Text>
                </View>
                <View style={styles.rewardRow}>
                  <Ionicons name="shield-checkmark" size={16} color="#10B981" />
                  <Text style={[styles.rewardText, { color: theme.text }]}>Lencana Pertarungan: <Text style={{ color: '#10B981', fontWeight: '800' }}>Penakluk {boss.name}</Text></Text>
                </View>
              </View>

              <TouchableOpacity style={[styles.finishBtn, { backgroundColor: theme.primary }]} onPress={onClose}>
                <Text style={styles.finishBtnText}>Klaim Hadiah & Selesai</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Draw / Seri Screen — soal habis tapi bos belum kalah */}
          {battleState === 'draw' && (
            <View style={styles.endStateContainer}>
              <View style={[styles.endIconCircle, { backgroundColor: '#FEF9C3' }]}>
                <Ionicons name="shield-half" size={38} color="#CA8A04" />
              </View>
              <Text style={[styles.endStateTitle, { color: theme.text }]}>Soal Habis — Pertarungan Seri!</Text>
              <Text style={[styles.endStateSub, { color: theme.subtext }]}>
                Soal telah habis namun {boss.name} belum berhasil dikalahkan. Tambah lebih banyak soal kuis atau pelajari kembali materinya!
              </Text>

              <View style={[styles.rewardCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <View style={styles.rewardRow}>
                  <Ionicons name="star-half" size={16} color="#CA8A04" />
                  <Text style={[styles.rewardText, { color: theme.text }]}>Bonus Usaha: <Text style={{ color: '#CA8A04', fontWeight: '800' }}>+30 XP</Text></Text>
                </View>
                <View style={styles.rewardRow}>
                  <Ionicons name="information-circle-outline" size={16} color={theme.subtext} />
                  <Text style={[styles.rewardText, { color: theme.subtext }]}>Kalahkan bos sepenuhnya untuk +75 XP dan Lencana Penakluk!</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                <TouchableOpacity
                  style={[styles.finishBtn, { flex: 1, backgroundColor: theme.cardInner, borderWidth: 1, borderColor: theme.border }]}
                  onPress={onClose}
                >
                  <Text style={[styles.finishBtnText, { color: theme.text }]}>Selesai</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.finishBtn, { flex: 1, backgroundColor: theme.primary }]}
                  onPress={resetBattleState}
                >
                  <Ionicons name="refresh" size={14} color="#FFFFFF" />
                  <Text style={styles.finishBtnText}>Ulang Lagi</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Defeat Screen */}
          {battleState === 'lost' && (
            <View style={styles.endStateContainer}>
              <View style={[styles.endIconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Ionicons name="skull-outline" size={38} color="#EF4444" />
              </View>
              <Text style={[styles.endStateTitle, { color: theme.text }]}>HP Habis, Coba Lagi!</Text>
              <Text style={[styles.endStateSub, { color: theme.subtext }]}>
                Jangan berkecil hati. Buka kembali ringkasan materi dan flashcard, lalu tantang kembali {boss.name}!
              </Text>

              <TouchableOpacity
                style={[styles.finishBtn, { backgroundColor: theme.primary }]}
                onPress={resetBattleState}
              >
                <Ionicons name="refresh" size={15} color="#FFFFFF" />
                <Text style={styles.finishBtnText}>Coba Pertarungan Ulang</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  battleCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  headerSubText: {
    fontSize: 10,
    marginTop: 1,
    flexShrink: 1,
  },
  closeBtn: {
    padding: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  arenaContainer: {
    gap: 8,
  },
  hpStatusBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    gap: 8,
  },
  singleHpCol: {
    flex: 1,
    gap: 3,
  },
  hpLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hpLabelName: {
    fontSize: 10.5,
    fontWeight: '700',
    flex: 1,
  },
  hpValueText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  hpTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
    borderRadius: 3,
  },
  vsBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  vsText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  bossStageBox: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    height: 180,
    overflow: 'hidden',
  },
  slashVfxStreak: {
    position: 'absolute',
    width: 220,
    height: 6,
    backgroundColor: '#38BDF8',
    borderRadius: 3,
    shadowColor: '#38BDF8',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    zIndex: 90,
  },
  floatingDamageBubble: {
    position: 'absolute',
    top: 8,
    zIndex: 99,
    backgroundColor: '#DC2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FEF08A',
  },
  floatingDamageText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  comboPillBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 95,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  comboPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  bossInfoFooter: {
    position: 'absolute',
    bottom: 6,
    alignItems: 'center',
  },
  bossTitleBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  questionBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  questionText: {
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  optionsList: {
    gap: 6,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
    gap: 8,
  },
  optionIndexPill: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIndexText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  optionBtnText: {
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 15,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 2,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  endStateContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
  },
  endIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endStateTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  endStateSub: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 320,
  },
  rewardCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rewardText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    paddingVertical: 11,
    borderRadius: 10,
    marginTop: 4,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
});
