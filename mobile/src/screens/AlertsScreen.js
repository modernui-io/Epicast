import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows, SyndromeLabels, AlertLevelConfig } from '../utils/theme';
import api from '../services/api';

function AlertCard({ alert }) {
  const cfg = AlertLevelConfig[alert.alert_level] || AlertLevelConfig.watch;
  const name = SyndromeLabels[alert.syndrome_category] || alert.syndrome_category;
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity style={[styles.alertCard, { borderLeftColor: cfg.color }]} onPress={() => setExpanded(!expanded)} activeOpacity={0.8}>
      <View style={styles.alertTop}>
        <View style={[styles.levelPill, { backgroundColor: cfg.color + '15' }]}>
          <View style={[styles.levelDot, { backgroundColor: cfg.color }]} />
          <Text style={[styles.levelText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
        <Text style={styles.alertDistrict}>{alert.district}</Text>
      </View>

      <Text style={styles.alertName}>{name}</Text>

      <View style={styles.metricsRow}>
        {[
          { val: alert.case_count_current_week, lab: 'This week' },
          { val: alert.case_count_baseline, lab: 'Baseline' },
          { val: alert.ratio_to_baseline + 'x', lab: 'Ratio', color: cfg.color },
        ].map((m, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.metricDiv} />}
            <View style={styles.metric}>
              <Text style={[styles.metricVal, m.color && { color: m.color }]}>{m.val}</Text>
              <Text style={styles.metricLab}>{m.lab}</Text>
            </View>
          </React.Fragment>
        ))}
        <View style={styles.metricDiv} />
        <View style={styles.metric}>
          <Ionicons
            name={alert.trend === 'increasing' ? 'trending-up' : alert.trend === 'decreasing' ? 'trending-down' : 'remove'}
            size={18}
            color={alert.trend === 'increasing' ? Colors.severity.emergency : alert.trend === 'decreasing' ? Colors.success : Colors.text.tertiary}
          />
          <Text style={styles.metricLab}>{alert.trend}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.expandedContent}>
          {alert.situation_summary && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Situation Summary</Text>
              <Text style={styles.detailText}>{alert.situation_summary}</Text>
            </View>
          )}
          {alert.recommended_actions?.length > 0 && (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Recommended Actions</Text>
              {alert.recommended_actions.map((a, i) => (
                <View key={i} style={styles.actionRow}>
                  <Text style={styles.actionNum}>{i + 1}.</Text>
                  <Text style={styles.actionText}>{a}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.text.tertiary} />
      </View>
    </TouchableOpacity>
  );
}

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try { setAlerts(await api.getAlerts()); } catch { setAlerts(DEMO); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchAlerts(); }, [fetchAlerts]);

  if (loading) return <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator size="large" color={Colors.accent.primary} /></View>;

  const sorted = [...(alerts?.alerts || [])].sort((a, b) => {
    const o = { emergency: 0, warning: 1, watch: 2 };
    return (o[a.alert_level] ?? 3) - (o[b.alert_level] ?? 3);
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Surveillance Alerts</Text>
        <View style={styles.countRow}>
          {['emergency', 'warning', 'watch'].map(lvl => {
            const n = alerts?.by_level?.[lvl] || 0;
            const c = AlertLevelConfig[lvl];
            return (
              <View key={lvl} style={[styles.countChip, { backgroundColor: c.color + '12' }]}>
                <Text style={[styles.countChipText, { color: c.color }]}>{n} {c.label}</Text>
              </View>
            );
          })}
        </View>

        {sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={44} color={Colors.success} />
            <Text style={styles.emptyTitle}>All Clear</Text>
            <Text style={styles.emptyText}>No active alerts. All syndromes within expected ranges.</Text>
          </View>
        ) : (
          sorted.map((a, i) => <AlertCard key={a.alert_id || i} alert={a} />)
        )}
      </ScrollView>
    </View>
  );
}

const DEMO = {
  total_alerts: 4, by_level: { emergency: 1, warning: 2, watch: 1 },
  alerts: [
    { alert_id: 'a1', alert_level: 'emergency', syndrome_category: 'acute_watery_diarrhea', district: 'Kintampo North', case_count_current_week: 25, case_count_baseline: 5.2, ratio_to_baseline: 4.81, trend: 'increasing', weeks_above_threshold: 3, situation_summary: 'Significant cluster of acute watery diarrhea. 25 cases this week represent a nearly 5-fold increase. Pattern consistent with possible cholera outbreak — community well contamination suspected following recent flooding.', recommended_actions: ['Deploy rapid diagnostic testing for Vibrio cholerae', 'Activate oral rehydration therapy stations', 'Investigate community water sources', 'Alert neighboring districts', 'Prepare cholera treatment supplies'] },
    { alert_id: 'a2', alert_level: 'warning', syndrome_category: 'acute_hemorrhagic_fever', district: 'Bolgatanga', case_count_current_week: 3, case_count_baseline: 0.5, ratio_to_baseline: 6.0, trend: 'increasing', weeks_above_threshold: 1, situation_summary: 'Three cases of hemorrhagic fever. Two patients are healthcare workers. Any case requires immediate investigation.', recommended_actions: ['Immediate case investigation with contact tracing', 'Implement infection control measures', 'Collect specimens for laboratory confirmation'] },
    { alert_id: 'a3', alert_level: 'warning', syndrome_category: 'acute_rash_fever', district: 'Tamale Metro', case_count_current_week: 12, case_count_baseline: 3.0, ratio_to_baseline: 4.0, trend: 'increasing', weeks_above_threshold: 2, situation_summary: 'Measles-like illness cluster. Most cases are unvaccinated children aged 1–5.', recommended_actions: ['Confirm measles with laboratory testing', 'Ring vaccination campaign', 'Enhanced school surveillance'] },
    { alert_id: 'a4', alert_level: 'watch', syndrome_category: 'acute_respiratory_infection', district: 'Wa Municipal', case_count_current_week: 18, case_count_baseline: 12.0, ratio_to_baseline: 1.5, trend: 'stable', weeks_above_threshold: 1, situation_summary: 'Moderate increase in respiratory infections. Likely seasonal.', recommended_actions: ['Continue routine surveillance', 'Monitor for SARI cases'] },
  ],
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 40 },

  title: { fontSize: Typography.size.lg, fontWeight: '500', color: Colors.text.primary, marginTop: 16, marginBottom: 10, letterSpacing: -0.3 },
  countRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countChipText: { fontSize: 10, fontWeight: '700' },

  alertCard: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },
  alertTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  levelPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  levelDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  levelText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  alertDistrict: { fontSize: 12, color: Colors.text.secondary },
  alertName: { fontSize: 16, fontWeight: '500', color: Colors.text.primary, marginBottom: 12, letterSpacing: -0.2 },

  metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metric: { alignItems: 'center', flex: 1 },
  metricVal: { fontSize: 18, fontWeight: '500', color: Colors.text.primary, letterSpacing: -0.3 },
  metricLab: { fontSize: 10, color: Colors.text.tertiary, marginTop: 2 },
  metricDiv: { width: 1, height: 28, backgroundColor: Colors.divider },

  expandedContent: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider },
  detailBlock: { marginBottom: 12 },
  detailLabel: { fontSize: 10, color: Colors.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  detailText: { fontSize: 13, color: Colors.text.secondary, lineHeight: 19 },
  actionRow: { flexDirection: 'row', marginBottom: 4 },
  actionNum: { fontSize: 13, color: Colors.accent.primaryDark, fontWeight: '600', marginRight: 6 },
  actionText: { fontSize: 13, color: Colors.text.secondary, flex: 1, lineHeight: 19 },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.success, marginTop: 12 },
  emptyText: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', marginTop: 6 },
});
