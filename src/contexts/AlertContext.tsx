import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TouchableWithoutFeedback, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, isColorLight } from './ThemeContext';

export type AlertType = 'info' | 'success' | 'warning' | 'danger' | 'streak';

export interface AlertOptions {
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onClose?: () => void;
}

interface AlertContextType {
  showAlert: (title: string, message: string, options?: AlertOptions) => void;
  confirmAction: (
    title: string,
    message: string,
    onConfirm: () => void | Promise<void>,
    confirmText?: string,
    cancelText?: string
  ) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

let globalShowAlert: ((title: string, message: string, options?: AlertOptions) => void) | null = null;
let globalConfirmAction: ((title: string, message: string, onConfirm: () => void | Promise<void>, confirmText?: string, cancelText?: string) => void) | null = null;

export function getGlobalAlert() {
  return {
    showAlert: (title: string, message: string, options?: AlertOptions) => {
      if (globalShowAlert) globalShowAlert(title, message, options);
    },
    confirmAction: (title: string, message: string, onConfirm: () => void | Promise<void>, confirmText = 'OK', cancelText = 'Batal') => {
      if (globalConfirmAction) globalConfirmAction(title, message, onConfirm, confirmText, cancelText);
    },
  };
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { theme, isLightMode } = useTheme();
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AlertType>('info');
  const [isConfirm, setIsConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('OK');
  const [cancelText, setCancelText] = useState('Batal');
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void | Promise<void>) | null>(null);
  const [onCloseCallback, setOnCloseCallback] = useState<(() => void) | null>(null);

  const primaryBtnTextColor = isColorLight(theme.primary) ? '#0F172A' : '#FFFFFF';

  const showAlert = useCallback((t: string, m: string, options?: AlertOptions) => {
    setTitle(t);
    setMessage(m);
    
    const lowerTitle = t.toLowerCase();
    const isStreak = t.includes('🔥') || lowerTitle.includes('streak');
    const isDanger = lowerTitle.includes('gagal') || lowerTitle.includes('error') || lowerTitle.includes('hapus') || lowerTitle.includes('batal');
    const isSuccess = lowerTitle.includes('sukses') || lowerTitle.includes('berhasil') || lowerTitle.includes('selesai') || lowerTitle.includes('siap') || lowerTitle.includes('disimpan');
    const isWarning = lowerTitle.includes('peringatan') || lowerTitle.includes('perhatian') || lowerTitle.includes('warning') || lowerTitle.includes('belum');

    const detectedType: AlertType = isStreak ? 'streak' : isDanger ? 'danger' : isSuccess ? 'success' : isWarning ? 'warning' : 'info';

    setType(options?.type || detectedType);
    setIsConfirm(false);
    setConfirmText(options?.confirmText || 'Tutup');
    setOnConfirmCallback(null);
    setOnCloseCallback(() => options?.onClose || null);
    setVisible(true);
  }, []);

  const confirmAction = useCallback((
    t: string,
    m: string,
    onConfirm: () => void | Promise<void>,
    cText = 'OK',
    canText = 'Batal'
  ) => {
    setTitle(t);
    setMessage(m);
    const isDestructive = t.toLowerCase().includes('hapus') || t.toLowerCase().includes('keluar') || cText.toLowerCase().includes('hapus') || cText.toLowerCase().includes('keluar');
    setType(isDestructive ? 'danger' : 'info');
    setIsConfirm(true);
    setConfirmText(cText);
    setCancelText(canText);
    setOnConfirmCallback(() => onConfirm);
    setOnCloseCallback(null);
    setVisible(true);
  }, []);

  globalShowAlert = showAlert;
  globalConfirmAction = confirmAction;

  const handleClose = () => {
    setVisible(false);
    if (onCloseCallback) {
      onCloseCallback();
      setOnCloseCallback(null);
    }
  };

  const handleConfirm = async () => {
    setVisible(false);
    if (onConfirmCallback) {
      await onConfirmCallback();
    }
    if (onCloseCallback) {
      onCloseCallback();
      setOnCloseCallback(null);
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'streak':
        return {
          name: 'flame' as const,
          color: isLightMode ? '#EA580C' : '#FB923C',
          bg: isLightMode ? '#FFF7ED' : '#2D1B0E',
          border: isLightMode ? '#FED7AA' : '#542E14'
        };
      case 'success':
        return {
          name: 'checkmark-circle' as const,
          color: isLightMode ? '#059669' : '#34D399',
          bg: isLightMode ? '#ECFDF5' : '#0F261E',
          border: isLightMode ? '#A7F3D0' : '#1C4A3A'
        };
      case 'warning':
        return {
          name: 'warning' as const,
          color: isLightMode ? '#D97706' : '#FBBF24',
          bg: isLightMode ? '#FFFBEB' : '#2B2012',
          border: isLightMode ? '#FDE68A' : '#4C3B18'
        };
      case 'danger':
        return {
          name: 'alert-circle' as const,
          color: isLightMode ? '#DC2626' : '#EF4444',
          bg: isLightMode ? '#FEF2F2' : '#2D1619',
          border: isLightMode ? '#FECACA' : '#571F26'
        };
      default:
        return {
          name: 'information-circle' as const,
          color: theme.accentLight,
          bg: theme.accentBg,
          border: theme.border
        };
    }
  };

  const iconInfo = getIcon();

  return (
    <AlertContext.Provider value={{ showAlert, confirmAction }}>
      {children}

      {/* Custom Sleek Themed Modal Dialog */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={[styles.overlay, { backgroundColor: isLightMode ? 'rgba(15, 23, 42, 0.45)' : 'rgba(3, 7, 18, 0.75)' }]}>
            <TouchableWithoutFeedback>
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                
                {/* Icon Circle */}
                <View style={[styles.iconWrap, { backgroundColor: iconInfo.bg, borderColor: iconInfo.border }]}>
                  <Ionicons name={iconInfo.name} size={28} color={iconInfo.color} />
                </View>

                {/* Title & Message */}
                <Text style={[styles.titleText, { color: theme.text }]}>{title}</Text>
                <Text
                  style={[
                    styles.messageText,
                    { color: theme.subtext },
                    (message.includes('\n') || message.includes('•')) && [styles.messageTextLeft, { backgroundColor: theme.cardInner, borderColor: theme.border, color: theme.text }],
                  ]}
                >
                  {message}
                </Text>

                {/* Action Buttons */}
                <View style={styles.btnRow}>
                  {isConfirm && (
                    <TouchableOpacity
                      style={[styles.cancelBtn, { backgroundColor: theme.cardInner, borderColor: theme.border }]}
                      onPress={handleClose}
                    >
                      <Text style={[styles.cancelBtnText, { color: theme.subtext }]}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: theme.primary, borderColor: theme.accent },
                      type === 'danger' && { backgroundColor: isLightMode ? '#DC2626' : '#991B1B', borderColor: isLightMode ? '#EF4444' : '#DC2626' },
                      !isConfirm && styles.confirmBtnFull,
                    ]}
                    onPress={isConfirm ? handleConfirm : handleClose}
                  >
                    <Text
                      style={[
                        styles.confirmBtnText,
                        { color: type === 'danger' ? '#FFFFFF' : primaryBtnTextColor }
                      ]}
                    >
                      {confirmText}
                    </Text>
                  </TouchableOpacity>
                </View>

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
    elevation: 20,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  messageTextLeft: {
    textAlign: 'left',
    alignSelf: 'stretch',
    lineHeight: 21,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  confirmBtnFull: {
    flex: 1,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
