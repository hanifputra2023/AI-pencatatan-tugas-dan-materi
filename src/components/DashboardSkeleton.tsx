import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface BoneProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}

const Bone: React.FC<BoneProps> = ({ width, height, radius = 10, style }) => {
  const { theme } = useTheme();
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: theme.cardInner,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
};

export const DashboardSkeleton: React.FC = () => {
  const { theme } = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: 'transparent' }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      pointerEvents="none"
    >
      {/* Greeting + streak pill */}
      <View style={styles.headerRow}>
        <View>
          <Bone width={90} height={12} radius={6} />
          <Bone width={150} height={22} radius={8} style={{ marginTop: 8 }} />
        </View>
        <Bone width={92} height={30} radius={14} />
      </View>

      {/* Quick hub grid */}
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Bone width={170} height={11} radius={5} />
        <View style={styles.gridRow}>
          {[0, 1, 2, 3].map(i => (
            <View key={i} style={[styles.gridItem, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
              <View style={[styles.iconCircle, { backgroundColor: theme.accentBg }]} />
              <Bone width={'80%' as `${number}%`} height={11} radius={5} />
              <Bone width={'60%' as `${number}%`} height={9} radius={4} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </View>

      {/* Content cards */}
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.cardHeader}>
            <Bone width={140} height={11} radius={5} />
            <Bone width={70} height={11} radius={5} />
          </View>
          <Bone width={'100%' as `${number}%`} height={52} radius={10} />
          {i === 0 && <Bone width={'100%' as `${number}%`} height={52} radius={10} style={{ marginTop: 10 }} />}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 50,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  gridItem: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
});
