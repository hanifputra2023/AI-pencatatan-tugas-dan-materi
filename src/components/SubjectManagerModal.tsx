import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, TouchableWithoutFeedback
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubjects } from '../contexts/SubjectContext';
import { confirmAction, showAlert } from '../lib/alert';

interface SubjectManagerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectSubject?: (name: string) => void;
}

export default function SubjectManagerModal({
  visible,
  onClose,
  onSelectSubject,
}: SubjectManagerModalProps) {
  const { subjects, addSubject, deleteSubject } = useSubjects();
  const [newSubjName, setNewSubjName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!newSubjName.trim()) {
      showAlert('Perhatian', 'Ketik nama mata kuliah terlebih dahulu.');
      return;
    }
    setSaving(true);
    const added = await addSubject(newSubjName.trim());
    setSaving(false);
    if (added) {
      setNewSubjName('');
      if (onSelectSubject) {
        onSelectSubject(added.name);
      }
    }
  };

  const handleDelete = (id: string, name: string) => {
    confirmAction(
      'Hapus Mata Kuliah?',
      `Mata kuliah "${name}" akan dihapus dari daftar pilihanmu.`,
      async () => {
        await deleteSubject(id);
      },
      'Hapus'
    );
  };

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
            <View style={styles.card}>
              
              {/* Header */}
              <View style={styles.topRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.iconBox}>
                    <Ionicons name="school" size={18} color="#60A5FA" />
                  </View>
                  <View>
                    <Text style={styles.title}>Daftar Mata Kuliah Saya</Text>
                    <Text style={styles.subtitle}>Kelola matkul semester ini untuk pilihan cepat</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              {/* Add New Subject Input Form */}
              <View style={styles.addInputRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Ketik mata kuliah baru (misal: Kecerdasan Buatan)..."
                  placeholderTextColor="#4B5565"
                  value={newSubjName}
                  onChangeText={setNewSubjName}
                  onSubmitEditing={handleAdd}
                />
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={handleAdd}
                  disabled={saving}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.addBtnText}>Tambah</Text>
                </TouchableOpacity>
              </View>

              {/* List of Current Subjects */}
              <Text style={styles.listLabel}>Mata Kuliah Tersimpan ({subjects.length}):</Text>
              <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
                {subjects.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>Belum ada mata kuliah yang ditambahkan.</Text>
                  </View>
                ) : (
                  subjects.map((item, idx) => (
                    <View key={item.id || idx} style={styles.subjItem}>
                      <TouchableOpacity
                        style={styles.subjItemLeft}
                        onPress={() => {
                          if (onSelectSubject) {
                            onSelectSubject(item.name);
                            onClose();
                          }
                        }}
                      >
                        <Ionicons name="book-outline" size={15} color="#60A5FA" />
                        <Text style={styles.subjName}>{item.name}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(item.id, item.name)}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ScrollView>

              {/* Footer Button */}
              <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
                <Text style={styles.doneBtnText}>Selesai</Text>
              </TouchableOpacity>

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
    backgroundColor: 'rgba(5, 7, 10, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    backgroundColor: '#141822',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#202634',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#16233B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  addInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#0E1117',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#F3F4F6',
    fontSize: 12.5,
    borderWidth: 1,
    borderColor: '#222836',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 4,
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  listLabel: {
    color: '#9CA3AF',
    fontSize: 11.5,
    fontWeight: '600',
    marginBottom: 8,
  },
  listScroll: {
    maxHeight: 220,
    marginBottom: 14,
  },
  emptyWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 12,
  },
  subjItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0E1117',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#1E2432',
  },
  subjItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  subjName: {
    color: '#F3F4F6',
    fontSize: 12.5,
    fontWeight: '500',
  },
  deleteBtn: {
    padding: 6,
  },
  doneBtn: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#28354D',
  },
  doneBtnText: {
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
  },
});
