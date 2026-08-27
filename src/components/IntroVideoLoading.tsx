import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';

const INTRO_VIDEO_SOURCE = require('../../assets/intro.mp4');

interface IntroVideoLoadingProps {
  visible: boolean;
  onFinish: () => void;
}

export default function IntroVideoLoading({ visible, onFinish }: IntroVideoLoadingProps) {
  const { theme } = useTheme();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const finishedRef = useRef(false);
  const timeoutRef = useRef<any>(null);

  const player = useVideoPlayer(INTRO_VIDEO_SOURCE, (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearTimeout(timeoutRef.current);
    finishRef.current();
  };

  useEffect(() => {
    if (!visible) {
      finishedRef.current = true;
      return;
    }

    setFailed(false);
    setReady(false);
    finishedRef.current = false;

    const subStatus = player.addListener('statusChange', (payload) => {
      if (payload.status === 'readyToPlay') {
        setReady(true);
        player.play();
      } else if (payload.status === 'error') {
        setFailed(true);
      }
    });

    const subEnd = player.addListener('playToEnd', () => {
      finish();
    });

    // Fallback: auto-dismiss if the video never ends or fails silently.
    timeoutRef.current = setTimeout(() => {
      finish();
    }, 8000);

    return () => {
      subStatus.remove();
      subEnd.remove();
      clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, player]);

  const handleSkip = () => {
    player.pause();
    finish();
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.videoWrap}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          nativeControls={false}
        />

        {!failed && !ready && (
          <View style={styles.centerOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}

        {failed && (
          <View style={styles.centerOverlay}>
            <ActivityIndicator size="large" color={theme.accentLight} />
          </View>
        )}

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
          <Text style={styles.skipText}>Lewati</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  videoWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipBtn: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
