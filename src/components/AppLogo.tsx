import React from 'react';
import { Image, ImageStyle, StyleProp } from 'react-native';
import { useMoods } from '../contexts/MoodContext';

interface AppLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
  borderRadius?: number;
}

export default function AppLogo({ size = 32, style, borderRadius = 8 }: AppLogoProps) {
  const { appLogoUrl } = useMoods();

  const source = appLogoUrl && appLogoUrl.trim().length > 0
    ? { uri: appLogoUrl }
    : require('../../assets/icon.png');

  return (
    <Image
      source={source}
      style={[{ width: size, height: size, borderRadius }, style]}
      resizeMode="cover"
    />
  );
}
