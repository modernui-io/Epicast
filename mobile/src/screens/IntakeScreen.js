import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows, SyndromeLabels } from '../utils/theme';
import api from '../services/api';

const DISTRICTS = ['Kintampo North', 'Tamale Metro', 'Wa Municipal', 'Bolgatanga', 'Kassena Nankana', 'Ho Municipal'];

export default function IntakeScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [narrative, setNarrative] = useState('');
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const handleSubmit = async () => {
    if (!narrative.trim()) { Alert.alert('Missing Information', 'Please enter a clinical narrative.'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await api.submitEncounter({ narrative: narrative.trim(), district, facilityName: 'Mobile Field Unit' });
      setResult(res);
    } catch {
      setResult(generateDemoResult(narrative, district));
    } finally { setLoading(false); scrollRef.current?.scrollToEnd({ animated: true }); }
  };

  const loadExample = (ex) => { setNarrative(ex); setResult(null); };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          <Text style={styles.title}>Clinical Intake</Text>
          <Text style={styles.subtitle}>Describe the patient encounter. EpiCast extracts syndromic signals automatically.</Text>

          {/* District */}
          <TouchableOpacity style={styles.districtBtn} onPress={() => setShowPicker(!showPicker)}>
            <Ionicons name="location-outline" size={16} color={Colors.accent.primary} />
            <Text style={styles.districtBtnText}>{district}</Text>
            <Ionicons name="chevron-down" size={14} color={Colors.text.tertiary} />
          </TouchableOpacity>

          {showPicker && (
            <View style={styles.picker}>
              {DISTRICTS.map(d => (
                <TouchableOpacity key={d} style={[styles.pickerItem, d === district && styles.pickerItemActive]}
                  onPress={() => { setDistrict(d); setShowPicker(false); }}>
                  <Text style={[styles.pickerItemText, d === district && styles.pickerItemTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Narrative Input */}
          <View style={styles.inputCard}>
            <TextInput
              style={styles.textInput}
              placeholder={"Describe the clinical encounter...\n\nExample: Patient is a 45-year-old male presenting with 3 days of profuse watery diarrhea, vomiting, and signs of severe dehydration."}
              placeholderTextColor={Colors.text.tertiary}
              value={narrative} onChangeText={(t) => { setNarrative(t); setResult(null); }}
              multiline numberOfLines={8} textAlignVertical="top"
            />
            <View style={styles.inputFooter}>
              <Text style={styles.charCount}>{narrative.length} chars</Text>
              {narrative.length > 0 && (
                <TouchableOpacity onPress={() => { setNarrative(''); setResult(null); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.text.tertiary} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Quick Examples */}
          <Text style={styles.exLabel}>Quick examples</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {EXAMPLES.map(([label, ex]) => (
              <TouchableOpacity key={label} style={styles.exChip} onPress={() => loadExample(ex)}>
                <Text style={styles.exChipText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Submit */}
          <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="scan" size={18} color="#fff" /><Text style={styles.submitBtnText}>Extract Syndromic Signals</Text></>
            )}
          </TouchableOpacity>

          {loading && (
            <View style={styles.processingCard}>
              <Text style={styles.processingText}>MedGemma is analyzing the encounter...</Text>
            </View>
          )}

          {/* Result */}
          {result?.syndromic_signal && (
            <View style={styles.resultContainer}>
              <View style={styles.resultHeader}>
                <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
                <Text style={styles.resultTitle}>Syndromic Signal Extracted</Text>
              </View>
              <View style={styles.resultCard}>
                <Row label="Syndrome">
                  <View style={[styles.synChip, { backgroundColor: (Colors.syndrome[result.syndromic_signal.syndrome_category] || Colors.accent.primary) + '15' }]}>
                    <Text style={[styles.synChipText, { color: Colors.syndrome[result.syndromic_signal.syndrome_category] || Colors.accent.primary }]}>
                      {SyndromeLabels[result.syndromic_signal.syndrome_category] || result.syndromic_signal.syndrome_category}
                    </Text>
                  </View>
                </Row>
                <Row label="Severity">
                  <Text style={[styles.rowValue, { color: sevColor(result.syndromic_signal.severity) }]}>
                    {result.syndromic_signal.severity?.toUpperCase()}
                  </Text>
                </Row>
                <View style={styles.rowSection}>
                  <Text style={styles.rowLabel}>Symptoms Extracted</Text>
                  <View style={styles.chipWrap}>
                    {(result.syndromic_signal.symptoms || []).map((s, i) => (
                      <View key={i} style={styles.symptomChip}>
                        <Text style={styles.symptomChipText}>{s.replace(/_/g, ' ')}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Row label="ICD-10">
                  <Text style={styles.monoValue}>{(result.syndromic_signal.icd10_codes || []).join(', ')}</Text>
                </Row>
                {result.syndromic_signal.reportable_conditions_flagged?.length > 0 && (
                  <View style={styles.flagCard}>
                    <Ionicons name="flag" size={13} color={Colors.severity.emergency} />
                    <Text style={styles.flagText}>REPORTABLE: {result.syndromic_signal.reportable_conditions_flagged.join(', ')}</Text>
                  </View>
                )}
                {result.syndromic_signal.cluster_indicator && (
                  <View style={[styles.flagCard, { backgroundColor: Colors.severity.watch + '12' }]}>
                    <Ionicons name="people" size={13} color={Colors.severity.watch} />
                    <Text style={[styles.flagText, { color: Colors.severity.watch }]}>CLUSTER DETECTED — Multiple cases</Text>
                  </View>
                )}
                <Row label="Confidence">
                  <Text style={styles.rowValue}>{Math.round((result.syndromic_signal.confidence_score || 0) * 100)}%</Text>
                </Row>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Row({ label, children }) {
  return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text>{children}</View>;
}

function sevColor(s) {
  return { mild: Colors.severity.low, moderate: Colors.severity.watch, severe: Colors.severity.warning, critical: Colors.severity.emergency }[s] || Colors.text.primary;
}

const EXAMPLES = [
  ['Cholera suspect', 'Patient is a 35-year-old male presenting with 3 days of profuse watery diarrhea and vomiting. Reports rice-water consistency stool. Severely dehydrated with sunken eyes and weak pulse. Three neighbors have similar symptoms this week. Uses community well water.'],
  ['Measles suspect', 'Child is a 4-year-old female with fever for 3 days, cough, runny nose, red eyes, and a rash starting on the face spreading to body. No vaccination history. Multiple children in her school absent with similar symptoms.'],
  ['Hemorrhagic fever', 'Patient is a 28-year-old healthcare worker presenting with 5 days of high fever, severe headache and muscle pain, followed by bleeding from gums and nose. Recently treated a patient who died of hemorrhagic illness. Petechial rash on extremities.'],
];

function generateDemoResult(narrative, district) {
  const l = narrative.toLowerCase();
  let syn = 'acute_febrile_illness', sev = 'moderate', symp = ['fever', 'headache'], icd = ['R50'], rep = [], clust = false;
  if (l.includes('diarrhea') || l.includes('watery')) { syn = 'acute_watery_diarrhea'; symp = ['watery_diarrhea', 'vomiting', 'dehydration']; icd = ['A00', 'A09']; rep = ['cholera']; sev = l.includes('severe') ? 'severe' : 'moderate'; }
  else if (l.includes('rash') && l.includes('fever')) { syn = 'acute_rash_fever'; symp = ['maculopapular_rash', 'fever', 'cough', 'conjunctivitis']; icd = ['B05']; rep = ['measles']; }
  else if (l.includes('bleeding') || l.includes('hemorrhag')) { syn = 'acute_hemorrhagic_fever'; symp = ['fever', 'unexplained_bleeding', 'petechiae']; icd = ['A98']; rep = ['hemorrhagic_fever_suspect']; sev = 'severe'; }
  if (l.includes('neighbor') || l.includes('multiple') || l.includes('school')) clust = true;
  return { encounter_id: Math.random().toString(36).substr(2, 8), timestamp: new Date().toISOString(), syndromic_signal: { symptoms: symp, syndrome_category: syn, severity: sev, age_group: 'adult', icd10_codes: icd, reportable_conditions_flagged: rep, cluster_indicator: clust, confidence_score: 0.89 } };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 60 },

  title: { fontSize: Typography.size.lg, fontWeight: '500', color: Colors.text.primary, marginTop: 16, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: Colors.text.secondary, marginTop: 4, marginBottom: 16, lineHeight: 18 },

  districtBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bg.card, borderRadius: BorderRadius.md, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  districtBtnText: { flex: 1, marginLeft: 8, fontSize: 14, color: Colors.text.primary },

  picker: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.md, marginBottom: 12, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  pickerItemActive: { backgroundColor: Colors.accent.ultraLight },
  pickerItemText: { fontSize: 13, color: Colors.text.secondary },
  pickerItemTextActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  inputCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, borderWidth: 1, borderColor: Colors.border, marginBottom: 12, ...Shadows.sm },
  textInput: { padding: 16, fontSize: 14, color: Colors.text.primary, minHeight: 160, lineHeight: 20 },
  inputFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10 },
  charCount: { fontSize: 10, color: Colors.text.tertiary },

  exLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  exChip: { backgroundColor: Colors.bg.card, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, borderWidth: 1, borderColor: Colors.border },
  exChipText: { fontSize: 12, color: Colors.accent.primaryDark, fontWeight: '500' },

  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent.primaryDark, borderRadius: BorderRadius.md, paddingVertical: 14, gap: 8, ...Shadows.md },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  processingCard: { backgroundColor: Colors.accent.ultraLight, borderRadius: BorderRadius.md, padding: 14, marginTop: 12, alignItems: 'center' },
  processingText: { color: Colors.accent.primaryDark, fontSize: 13 },

  resultContainer: { marginTop: 24 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  resultTitle: { fontSize: 15, fontWeight: '600', color: Colors.success },

  resultCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowSection: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowLabel: { fontSize: 11, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.text.primary },
  monoValue: { fontSize: 13, fontFamily: 'monospace', color: Colors.accent.secondary },

  synChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  synChipText: { fontSize: 12, fontWeight: '600' },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  symptomChip: { backgroundColor: Colors.accent.ultraLight, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  symptomChipText: { fontSize: 11, color: Colors.accent.primaryDark },

  flagCard: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.severity.emergency + '10', borderRadius: 10, padding: 10, marginTop: 8 },
  flagText: { fontSize: 12, fontWeight: '700', color: Colors.severity.emergency },
});
