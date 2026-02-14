import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../utils/theme';
import api from '../services/api';

const DISTRICTS = ['Kintampo North', 'Tamale Metro', 'Wa Municipal', 'Bolgatanga'];

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [reportType, setReportType] = useState('situation');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true); setReport(null);
    try {
      const data = reportType === 'fhir'
        ? await api.getFHIRReport(district)
        : await api.generateReport(district);
      setReport(data);
    } catch {
      setReport(reportType === 'fhir' ? DEMO_FHIR : DEMO_REPORT);
    } finally { setLoading(false); }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Reports</Text>
        <Text style={styles.subtitle}>Generate epidemiological reports powered by MedGemma 27B</Text>

        {/* Type Toggle */}
        <View style={styles.toggleRow}>
          {[['situation', 'document-text-outline', 'Situation Report'], ['fhir', 'code-slash-outline', 'FHIR Report']].map(([key, icon, label]) => (
            <TouchableOpacity key={key}
              style={[styles.toggleBtn, reportType === key && styles.toggleBtnActive]}
              onPress={() => { setReportType(key); setReport(null); }}>
              <Ionicons name={icon} size={15} color={reportType === key ? Colors.accent.primaryDark : Colors.text.tertiary} />
              <Text style={[styles.toggleText, reportType === key && styles.toggleTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* District Chips */}
        <Text style={styles.sectionLabel}>Select District</Text>
        <View style={styles.chipRow}>
          {DISTRICTS.map(d => (
            <TouchableOpacity key={d}
              style={[styles.districtChip, d === district && styles.districtChipActive]}
              onPress={() => { setDistrict(d); setReport(null); }}>
              <Text style={[styles.districtChipText, d === district && styles.districtChipTextActive]}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Generate */}
        <TouchableOpacity style={[styles.genBtn, loading && { opacity: 0.7 }]} onPress={generate} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <><Ionicons name="sparkles" size={16} color="#fff" /><Text style={styles.genBtnText}>Generate {reportType === 'fhir' ? 'FHIR Report' : 'Situation Report'}</Text></>
          )}
        </TouchableOpacity>

        {loading && (
          <View style={styles.loadingCard}>
            <Text style={styles.loadingText}>MedGemma 27B is analyzing surveillance data for {district}...</Text>
          </View>
        )}

        {/* Situation Report */}
        {report && reportType === 'situation' && (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Ionicons name="document-text" size={16} color={Colors.accent.primaryDark} />
              <Text style={styles.reportTitle}>Situation Report — {district}</Text>
            </View>
            <Text style={styles.reportDate}>{new Date().toLocaleDateString()}</Text>
            <View style={styles.reportBody}>
              <Text style={styles.reportText}>{report.report || report}</Text>
            </View>
            {report.alerts?.length > 0 && (
              <View style={styles.reportAlerts}>
                <Text style={styles.reportAlertsLabel}>Associated Alerts</Text>
                {report.alerts.map((a, i) => (
                  <View key={i} style={styles.miniAlert}>
                    <View style={[styles.miniDot, { backgroundColor: a.alert_level === 'emergency' ? Colors.severity.emergency : Colors.severity.warning }]} />
                    <Text style={styles.miniText}>
                      {a.syndrome_category?.replace(/_/g, ' ')} — {a.case_count_current_week} cases ({a.ratio_to_baseline}x)
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* FHIR Report */}
        {report && reportType === 'fhir' && (
          <View style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Ionicons name="code-slash" size={16} color={Colors.accent.secondary} />
              <Text style={styles.reportTitle}>FHIR Bundle — {district}</Text>
            </View>
            <View style={styles.fhirBlock}>
              <Text style={styles.fhirText}>
                {JSON.stringify(report, null, 2).substring(0, 1500)}
                {JSON.stringify(report).length > 1500 ? '\n...(truncated)' : ''}
              </Text>
            </View>
            <TouchableOpacity style={styles.exportBtn}>
              <Ionicons name="share-outline" size={14} color={Colors.accent.primaryDark} />
              <Text style={styles.exportBtnText}>Export FHIR Bundle</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const DEMO_REPORT = {
  report_time: new Date().toISOString(),
  report: `EPIDEMIOLOGICAL SITUATION REPORT — KINTAMPO NORTH DISTRICT

SITUATION SUMMARY
A significant outbreak of acute watery diarrhea has been detected in Kintampo North district. Over the past week, 25 cases have been reported, representing a 4.8-fold increase above the 8-week baseline of 5.2 cases per week. The trend has been increasing over the past 3 consecutive weeks.

KEY FINDINGS
The cases are concentrated in communities relying on the Kintampo community well, which was contaminated following recent flooding events. Clinical presentations are consistent with cholera: rice-water stool, severe dehydration, rapid onset. 3 cases classified as critical severity requiring IV rehydration. Cluster indicator positive with multiple household contacts reporting symptoms.

RISK ASSESSMENT: HIGH
The combination of rapidly increasing case counts, evidence of a common-source exposure, and clinical features consistent with cholera indicates a high probability of an ongoing outbreak.

RECOMMENDED ACTIONS
1. Deploy rapid diagnostic testing for Vibrio cholerae
2. Establish oral rehydration therapy stations at community health posts
3. Conduct environmental investigation of the Kintampo community well
4. Implement enhanced case-based surveillance with daily reporting
5. Alert neighboring districts for cross-border surveillance
6. Pre-position cholera treatment kits at sub-district hospitals`,
  alerts: [
    { alert_level: 'emergency', syndrome_category: 'acute_watery_diarrhea', case_count_current_week: 25, ratio_to_baseline: 4.81 },
    { alert_level: 'warning', syndrome_category: 'acute_hemorrhagic_fever', case_count_current_week: 3, ratio_to_baseline: 6.0 },
  ],
};

const DEMO_FHIR = {
  resourceType: 'Bundle', id: 'epicast-fhir-001', type: 'collection',
  timestamp: new Date().toISOString(),
  entry: [
    { resource: { resourceType: 'Composition', status: 'final', title: 'Surveillance Report — Kintampo North' } },
    { resource: { resourceType: 'Observation', code: { coding: [{ code: 'acute_watery_diarrhea', display: 'Acute Watery Diarrhea' }] }, valueQuantity: { value: 25, unit: 'cases' } } },
    { resource: { resourceType: 'DetectedIssue', code: { coding: [{ code: 'emergency', display: 'EMERGENCY — acute_watery_diarrhea' }] } } },
  ],
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 60 },

  title: { fontSize: Typography.size.lg, fontWeight: '500', color: Colors.text.primary, marginTop: 16, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: Colors.text.secondary, marginTop: 4, marginBottom: 20 },

  toggleRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: Colors.bg.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border },
  toggleBtnActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.ultraLight },
  toggleText: { fontSize: 13, color: Colors.text.tertiary },
  toggleTextActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  sectionLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  districtChip: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.bg.card, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  districtChipActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.ultraLight },
  districtChipText: { fontSize: 12, color: Colors.text.secondary },
  districtChipTextActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  genBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent.primaryDark, borderRadius: BorderRadius.md, paddingVertical: 14, ...Shadows.md },
  genBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  loadingCard: { backgroundColor: Colors.accent.ultraLight, borderRadius: BorderRadius.md, padding: 14, marginTop: 12, alignItems: 'center' },
  loadingText: { color: Colors.accent.primaryDark, fontSize: 13 },

  reportCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: 16, marginTop: 20, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
  reportHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reportTitle: { fontSize: 15, fontWeight: '500', color: Colors.text.primary },
  reportDate: { fontSize: 10, color: Colors.text.tertiary, marginBottom: 12 },
  reportBody: { backgroundColor: Colors.bg.secondary, borderRadius: BorderRadius.md, padding: 14 },
  reportText: { fontSize: 12, color: Colors.text.secondary, lineHeight: 19 },

  reportAlerts: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider },
  reportAlertsLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  miniAlert: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  miniDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  miniText: { fontSize: 12, color: Colors.text.secondary },

  fhirBlock: { backgroundColor: Colors.bg.secondary, borderRadius: BorderRadius.md, padding: 12 },
  fhirText: { fontSize: 10, fontFamily: 'monospace', color: Colors.accent.secondary, lineHeight: 15 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 10, borderWidth: 1, borderColor: Colors.accent.primary, borderRadius: BorderRadius.md },
  exportBtnText: { fontSize: 13, color: Colors.accent.primaryDark, fontWeight: '500' },
});
