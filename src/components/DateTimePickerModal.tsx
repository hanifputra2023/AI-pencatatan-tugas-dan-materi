import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput,
  ScrollView, StyleSheet, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { toLocalIsoString } from '../lib/dateUtils';

interface DateTimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: string; // ISO string like '2026-08-25T23:59'
  onSelect: (isoString: string) => void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const QUICK_TIME_PRESETS = [
  { label: '23:59 (Malam)', hour: 23, minute: 59 },
  { label: '17:00 (Sore)', hour: 17, minute: 0 },
  { label: '12:00 (Siang)', hour: 12, minute: 0 },
  { label: '08:00 (Pagi)', hour: 8, minute: 0 },
];

export default function DateTimePickerModal({
  visible,
  onClose,
  value,
  onSelect,
}: DateTimePickerModalProps) {
  const { theme, isLightMode } = useTheme();

  // Initializing selected date & time
  const initialDate = value && !isNaN(new Date(value).getTime()) ? new Date(value) : new Date();
  
  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState(initialDate.getDate());
  const [selectedHour, setSelectedHour] = useState(initialDate.getHours() || 23);
  const [selectedMinute, setSelectedMinute] = useState(initialDate.getMinutes() || 59);

  // Sync state when modal opens
  useEffect(() => {
    if (visible) {
      const d = value && !isNaN(new Date(value).getTime()) ? new Date(value) : new Date();
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelectedDay(d.getDate());
      setSelectedHour(value ? d.getHours() : 23);
      setSelectedMinute(value ? d.getMinutes() : 59);
    }
  }, [visible, value]);

  // Calendar calculations
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
  };

  const handleApply = () => {
    const finalDate = new Date(viewYear, viewMonth, selectedDay, selectedHour, selectedMinute);
    onSelect(toLocalIsoString(finalDate));
    onClose();
  };

  const handleClear = () => {
    onSelect('');
    onClose();
  };

  const handleHourChange = (txt: string) => {
    const num = parseInt(txt, 10);
    if (!isNaN(num)) {
      setSelectedHour(Math.min(23, Math.max(0, num)));
    } else if (txt === '') {
      setSelectedHour(0);
    }
  };

  const handleMinuteChange = (txt: string) => {
    const num = parseInt(txt, 10);
    if (!isNaN(num)) {
      setSelectedMinute(Math.min(59, Math.max(0, num)));
    } else if (txt === '') {
      setSelectedMinute(0);
    }
  };

  const today = new Date();
  const isCurrentMonthView = today.getFullYear() === viewYear && today.getMonth() === viewMonth;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              
              {/* Header */}
              <View style={styles.headerRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[styles.iconCircle, { backgroundColor: theme.accentBg }]}>
                    <Ionicons name="calendar" size={16} color={theme.accentLight} />
                  </View>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>Pilih Batas Waktu (Deadline)</Text>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={theme.subtext} />
                </TouchableOpacity>
              </View>

              {/* Month & Year Navigation */}
              <View style={[styles.monthNavRow, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn}>
                  <Ionicons name="chevron-back" size={16} color={theme.text} />
                </TouchableOpacity>

                <Text style={[styles.monthNavTitle, { color: theme.text }]}>
                  {MONTH_NAMES[viewMonth]} {viewYear}
                </Text>

                <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn}>
                  <Ionicons name="chevron-forward" size={16} color={theme.text} />
                </TouchableOpacity>
              </View>

              {/* Days Header */}
              <View style={styles.daysHeaderRow}>
                {DAY_NAMES.map((dName, idx) => (
                  <View key={idx} style={styles.dayHeaderCell}>
                    <Text style={[styles.dayHeaderText, { color: idx === 0 ? '#EF4444' : theme.muted }]}>
                      {dName}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {/* Prev Month Filler */}
                {Array.from({ length: firstDayOfMonth }).map((_, idx) => {
                  const prevDayNum = daysInPrevMonth - firstDayOfMonth + idx + 1;
                  return (
                    <View key={`prev-${idx}`} style={styles.dayCell}>
                      <Text style={[styles.dayTextInactive, { color: theme.muted, opacity: 0.3 }]}>
                        {prevDayNum}
                      </Text>
                    </View>
                  );
                })}

                {/* Current Month Days */}
                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const isSelected = dayNum === selectedDay;
                  const isToday = isCurrentMonthView && dayNum === today.getDate();

                  return (
                    <TouchableOpacity
                      key={`day-${dayNum}`}
                      style={[
                        styles.dayCell,
                        isSelected && [styles.dayCellSelected, { backgroundColor: theme.accent }],
                        isToday && !isSelected && [styles.dayCellToday, { borderColor: theme.accentLight }]
                      ]}
                      onPress={() => handleSelectDay(dayNum)}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          { color: theme.text },
                          isSelected && styles.dayTextSelected,
                          isToday && !isSelected && { color: theme.accentLight, fontWeight: '700' }
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Time Section (Sleek, Clean & Minimal) */}
              <View style={[styles.timeCard, { backgroundColor: theme.cardInner, borderColor: theme.border }]}>
                
                <View style={styles.timeMainRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="time-outline" size={16} color={theme.accentLight} />
                    <Text style={[styles.timeLabel, { color: theme.text }]}>Jam Deadline:</Text>
                  </View>

                  {/* Clean Digital Time Box */}
                  <View style={styles.timeControlBox}>
                    <TouchableOpacity
                      style={[styles.miniStepBtn, { backgroundColor: theme.card }]}
                      onPress={() => setSelectedHour(prev => (prev === 0 ? 23 : prev - 1))}
                    >
                      <Ionicons name="remove" size={12} color={theme.subtext} />
                    </TouchableOpacity>

                    <View style={[styles.digitInputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <TextInput
                        style={[styles.digitInput, { color: theme.text }]}
                        value={selectedHour.toString().padStart(2, '0')}
                        onChangeText={handleHourChange}
                        keyboardType="number-pad"
                        maxLength={2}
                        selectTextOnFocus
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.miniStepBtn, { backgroundColor: theme.card }]}
                      onPress={() => setSelectedHour(prev => (prev === 23 ? 0 : prev + 1))}
                    >
                      <Ionicons name="add" size={12} color={theme.subtext} />
                    </TouchableOpacity>
                    
                    <Text style={[styles.colon, { color: theme.text }]}>:</Text>

                    <TouchableOpacity
                      style={[styles.miniStepBtn, { backgroundColor: theme.card }]}
                      onPress={() => setSelectedMinute(prev => (prev === 0 ? 59 : prev - 1))}
                    >
                      <Ionicons name="remove" size={12} color={theme.subtext} />
                    </TouchableOpacity>

                    <View style={[styles.digitInputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
                      <TextInput
                        style={[styles.digitInput, { color: theme.text }]}
                        value={selectedMinute.toString().padStart(2, '0')}
                        onChangeText={handleMinuteChange}
                        keyboardType="number-pad"
                        maxLength={2}
                        selectTextOnFocus
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.miniStepBtn, { backgroundColor: theme.card }]}
                      onPress={() => setSelectedMinute(prev => (prev === 59 ? 0 : prev + 1))}
                    >
                      <Ionicons name="add" size={12} color={theme.subtext} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 4 Clean Quick Presets */}
                <View style={styles.quickPresetsRow}>
                  {QUICK_TIME_PRESETS.map((p, idx) => {
                    const isSel = selectedHour === p.hour && selectedMinute === p.minute;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={[
                          styles.quickPresetPill,
                          { backgroundColor: theme.card, borderColor: theme.border },
                          isSel && [styles.quickPresetPillActive, { backgroundColor: theme.accentBg, borderColor: theme.accent }]
                        ]}
                        onPress={() => {
                          setSelectedHour(p.hour);
                          setSelectedMinute(p.minute);
                        }}
                      >
                        <Text style={[
                          styles.quickPresetPillText,
                          { color: theme.subtext },
                          isSel && [styles.quickPresetPillTextActive, { color: theme.accentLight, fontWeight: '700' }]
                        ]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </View>

              {/* Action Buttons */}
              <View style={styles.footerRow}>
                <TouchableOpacity style={[styles.clearBtn, { borderColor: theme.border }]} onPress={handleClear}>
                  <Text style={[styles.clearBtnText, { color: theme.subtext }]}>Hapus</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.applyBtn, { backgroundColor: theme.primary }]} onPress={handleApply}>
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                  <Text style={styles.applyBtnText}>
                    Simpan ({selectedDay} {MONTH_NAMES[viewMonth].slice(0, 3)}, {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')})
                  </Text>
                </TouchableOpacity>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  monthNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  navArrowBtn: {
    padding: 4,
  },
  monthNavTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  daysHeaderRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 1,
  },
  dayCellSelected: {
    borderRadius: 8,
  },
  dayCellToday: {
    borderWidth: 1.5,
  },
  dayText: {
    fontSize: 12.5,
    fontWeight: '500',
  },
  dayTextInactive: {
    fontSize: 12,
  },
  dayTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  /* Time Section */
  timeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  timeMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeControlBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniStepBtn: {
    width: 20,
    height: 24,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitInputWrap: {
    borderRadius: 6,
    borderWidth: 1,
    width: 36,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitInput: {
    fontSize: 13.5,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
    width: 34,
    height: 24,
  },
  colon: {
    fontSize: 15,
    fontWeight: '800',
    marginHorizontal: 1,
  },
  quickPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  quickPresetPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  quickPresetPillActive: {},
  quickPresetPillText: {
    fontSize: 11,
    fontWeight: '500',
  },
  quickPresetPillTextActive: {},

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  clearBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
