import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  TouchableWithoutFeedback, Animated, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type AlertType = 'info' | 'success' | 'warning' | 'danger' | 'streak';

interface AlertOptions {
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
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
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<AlertType>('info');
  const [isConfirm, setIsConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('OK');
  const [cancelText, setCancelText] = useState('Batal');
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void | Promise<void>) | null>(null);

  const showAlert = useCallback((t: string, m: string, options?: AlertOptions) => {
    setTitle(t);
    setMessage(m);
    setType(options?.type || (t.includes('🔥') ? 'streak' : t.toLowerCase().includes('gagal') || t.toLowerCase().includes('error') ? 'danger' : t.toLowerCase().includes('sukses') ? 'success' : 'info'));
    setIsConfirm(false);
    setConfirmText(options?.confirmText || 'Tutup');
    setOnConfirmCallback(null);
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
    setVisible(true);
  }, []);

  globalShowAlert = showAlert;
  globalConfirmAction = confirmAction;

  const handleClose = () => {
    setVisible(false);
  };

  const handleConfirm = async () => {
    setVisible(false);
    if (onConfirmCallback) {
      await onConfirmCallback();
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'streak':
        return { name: 'flame' as const, color: '#F59E0B', bg: '#2B1E12' };
      case 'success':
        return { name: 'checkmark-circle' as const, color: '#10B981', bg: '#0F261E' };
      case 'warning':
        return { name: 'warning' as const, color: '#F59E0B', bg: '#2B2012' };
      case 'danger':
        return { name: 'alert-circle' as const, color: '#EF4444', bg: '#2D1619' };
      default:
        return { name: 'information-circle' as const, color: '#3B82F6', bg: '#131F33' };
    }
  };

  const iconInfo = getIcon();

  return (
    <AlertContext.Provider value={{ showAlert, confirmAction }}>
      {children}

      {/* Custom Sleek Modal Dialog */}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                
                {/* Icon Circle */}
                <View style={[styles.iconWrap, { backgroundColor: iconInfo.bg }]}>
                  <Ionicons name={iconInfo.name} size={28} color={iconInfo.color} />
                </View>

                {/* Title & Message */}
                <Text style={styles.titleText}>{title}</Text>
                <Text style={styles.messageText}>{message}</Text>

                {/* Action Buttons */}
                <View style={styles.btnRow}>
                  {isConfirm && (
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                      <Text style={styles.cancelBtnText}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      type === 'danger' && styles.confirmBtnDanger,
                      !isConfirm && styles.confirmBtnFull,
                    ]}
                    onPress={isConfirm ? handleConfirm : handleClose}
                  >
                    <Text style={styles.confirmBtnText}>{confirmText}</Text>
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
    backgroundColor: 'rgba(5, 7, 10, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#141822',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#202634',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
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
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleText: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  messageText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
    paddingHorizontal: 6,
  },
  btnRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1A1F2B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#262E3E',
  },
  cancelBtnText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmBtnDanger: {
    backgroundColor: '#DC2626',
  },
  confirmBtnFull: {
    flex: 1,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
