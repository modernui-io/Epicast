import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows, SyndromeLabels, AlertLevelConfig } from '../utils/theme';
import api from '../services/api';

const { width: SW } = Dimensions.get('window');

function StatCard({ label, value, icon, color, subtitle }) {
  return (
    <View style={[styles.statCard]}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
    </View>
  );
}

function SyndromeBar({ syndrome, count, maxCount }) {
  const color = Colors.syndrome[syndrome] || Colors.text.tertiary;
  const label = SyndromeLabels[syndrome] || syndrome;
  const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <View style={styles.syndromeRow}>
      <View style={styles.syndromeInfo}>
        <View style={[styles.syndromeDot, { backgroundColor: color }]} />
        <Text style={styles.syndromeLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.syndromeBarBg}>
        <View style={[styles.syndromeBarFill, { width: `${barWidth}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.syndromeCount, { color }]}>{count}</Text>
    </View>
  );
}

function EncounterRow({ encounter }) {
  const sevColors = { mild: Colors.severity.low, moderate: Colors.severity.watch, severe: Colors.severity.warning, critical: Colors.severity.emergency };
  const color = sevColors[encounter.severity] || Colors.text.tertiary;
  const name = SyndromeLabels[encounter.syndrome] || encounter.syndrome || 'Unknown';
  return (
    <View style={styles.encounterRow}>
      <View style={[styles.encounterDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.encounterName} numberOfLines={1}>{name}</Text>
        <Text style={styles.encounterMeta}>{encounter.district || 'Unknown'} · {encounter.time}</Text>
      </View>
      <View style={[styles.sevChip, { backgroundColor: color + '15' }]}>
        <Text style={[styles.sevChipText, { color }]}>{(encounter.severity || '').toUpperCase()}</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([api.getDashboard(), api.getAlerts()]);
      setDashboard(d); setAlerts(a); setServerOnline(true);
    } catch {
      setServerOnline(false); setDashboard(DEMO_DASH); setAlerts(DEMO_ALERTS);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = useCallback(() => { setRefreshing(true); fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
        <Text style={{ color: Colors.text.secondary, marginTop: 12, fontSize: 14 }}>Connecting to EpiCast...</Text>
      </View>
    );
  }

  const synEntries = Object.entries(dashboard?.syndrome_distribution || {}).sort((a, b) => b[1] - a[1]);
  const maxSyn = synEntries.length > 0 ? synEntries[0][1] : 1;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Gradient Header */}
        <LinearGradient
          colors={['#10B981', '#14B8A6', '#06B6D4']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 16 }]}
        >
          <View style={styles.headerTop}>
            <Text style={styles.appName}>epicast</Text>
            <View style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: serverOnline ? '#10B981' : '#F59E0B' }]} />
              <Text style={styles.statusText}>{serverOnline ? 'LIVE' : 'DEMO'}</Text>
            </View>
          </View>

          <View style={styles.quickActions}>
            <Text style={styles.quickLabel}>Quick access</Text>
            <View style={styles.quickRow}>
              <View style={styles.quickPill}><Ionicons name="add" size={14} color="rgba(255,255,255,0.9)" /><Text style={styles.quickPillText}>New Encounter</Text></View>
              <View style={styles.quickPill}><Text style={styles.quickPillText}>Run Scan</Text></View>
              <View style={styles.quickPill}><Text style={styles.quickPillText}>Alerts</Text></View>
            </View>
          </View>

          {/* Floating rewards-style card */}
          <View style={styles.floatingCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.floatingHint}>Your surveillance <Text style={{ fontWeight: '500' }}>activity score</Text> this month</Text>
              <Text style={styles.floatingValue}>{dashboard?.total_encounters || 0}<Text style={styles.floatingUnit}> encounters</Text></Text>
            </View>
            <Text style={styles.floatingScore}>{alerts?.total_alerts || 0}</Text>
          </View>
        </LinearGradient>

        {/* Spacer for floating card overlap */}
        <View style={{ height: 40 }} />

        {/* Alert Badges */}
        {alerts && alerts.total_alerts > 0 && (
          <View style={styles.alertRow}>
            {['emergency', 'warning', 'watch'].map(lvl => {
              const count = alerts.by_level?.[lvl] || 0;
              if (count === 0) return null;
              const cfg = AlertLevelConfig[lvl];
              return (
                <View key={lvl} style={[styles.alertBadge, { backgroundColor: cfg.color + '12' }]}>
                  <View style={[styles.alertBadgeDot, { backgroundColor: cfg.color }]} />
                  <Text style={[styles.alertBadgeText, { color: cfg.color }]}>{count} {cfg.label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard label="Encounters" value={dashboard?.total_encounters || 0} icon="people" color={Colors.accent.primary} subtitle="Total processed" />
          <StatCard label="Active Alerts" value={alerts?.total_alerts || 0} icon="alert-circle" color={alerts?.by_level?.emergency > 0 ? Colors.severity.emergency : Colors.severity.watch} subtitle="Monitoring" />
          <StatCard label="Districts" value={dashboard?.districts?.length || 0} icon="location" color={Colors.accent.secondary} subtitle="Under surveillance" />
          <StatCard label="Syndromes" value={Object.keys(dashboard?.syndrome_distribution || {}).length} icon="analytics" color="#8B5CF6" subtitle="Tracked" />
        </View>

        {/* Syndrome Distribution */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Syndrome Distribution</Text>
          <View style={styles.card}>
            {synEntries.map(([s, c]) => <SyndromeBar key={s} syndrome={s} count={c} maxCount={maxSyn} />)}
            {synEntries.length === 0 && <Text style={styles.emptyText}>No encounters recorded yet</Text>}
          </View>
        </View>

        {/* Recent Encounters */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Encounters</Text>
          <View style={styles.card}>
            {(dashboard?.recent_encounters || []).slice(0, 6).map((e, i) => <EncounterRow key={e.id || i} encounter={e} />)}
            {(!dashboard?.recent_encounters?.length) && <Text style={styles.emptyText}>No encounters yet. Tap "Intake" to begin.</Text>}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by MedGemma · MedASR · MedSigLIP</Text>
          <Text style={[styles.footerText, { opacity: 0.5, marginTop: 4 }]}>Google Health AI Developer Foundations</Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Demo Data ────────────────────────────────────────
const DEMO_DASH = {
  total_encounters: 147,
  syndrome_distribution: {
    acute_watery_diarrhea: 38, acute_febrile_illness: 31, acute_respiratory_infection: 28,
    acute_bloody_diarrhea: 18, acute_rash_fever: 12, acute_neurological_syndrome: 8,
    acute_hemorrhagic_fever: 7, unexplained_cluster: 5,
  },
  districts: ['Kintampo North', 'Tamale Metro', 'Wa Municipal', 'Bolgatanga', 'Kassena Nankana'],
  recent_encounters: [
    { id: 'e1', time: '2 min ago', district: 'Kintampo North', syndrome: 'acute_watery_diarrhea', severity: 'severe' },
    { id: 'e2', time: '10 min ago', district: 'Kintampo North', syndrome: 'acute_watery_diarrhea', severity: 'moderate' },
    { id: 'e3', time: '20 min ago', district: 'Tamale Metro', syndrome: 'acute_febrile_illness', severity: 'moderate' },
    { id: 'e4', time: '30 min ago', district: 'Kintampo North', syndrome: 'acute_watery_diarrhea', severity: 'critical' },
    { id: 'e5', time: '1h ago', district: 'Wa Municipal', syndrome: 'acute_respiratory_infection', severity: 'mild' },
    { id: 'e6', time: '1.5h ago', district: 'Bolgatanga', syndrome: 'acute_hemorrhagic_fever', severity: 'severe' },
  ],
};
const DEMO_ALERTS = { total_alerts: 4, by_level: { emergency: 1, warning: 2, watch: 1 } };

// ─── Styles ───────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.secondary },
  center: { justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { paddingHorizontal: Spacing.xl, paddingBottom: 80, zIndex: 1 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appName: { fontSize: Typography.size['2xl'], fontWeight: Typography.weight.medium, color: '#fff', letterSpacing: -0.5 },
  statusPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  statusText: { fontSize: 10, fontWeight: '600', color: Colors.text.secondary, letterSpacing: 0.5 },

  quickActions: { marginTop: 24 },
  quickLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500', marginBottom: 10 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, gap: 4 },
  quickPillText: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  floatingCard: {
    position: 'absolute', bottom: -36, left: Spacing.xl, right: Spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: BorderRadius.xl,
    padding: 20, flexDirection: 'row', alignItems: 'flex-start',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  floatingHint: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  floatingValue: { fontSize: 32, fontWeight: '500', color: 'rgba(255,255,255,0.95)', letterSpacing: -1 },
  floatingUnit: { fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.65)' },
  floatingScore: { fontSize: 36, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  // Alert badges
  alertRow: { flexDirection: 'row', paddingHorizontal: Spacing.xl, gap: 8, marginBottom: 16 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  alertBadgeDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  alertBadgeText: { fontSize: 11, fontWeight: '600' },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xl, gap: 10, marginBottom: 24 },
  statCard: {
    width: (SW - Spacing.xl * 2 - 10) / 2,
    backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl,
    padding: 16, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm,
  },
  statIcon: { marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '500', color: Colors.text.primary, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: Colors.text.secondary, fontWeight: '500', marginTop: 2 },
  statSubtitle: { fontSize: 10, color: Colors.text.tertiary, marginTop: 1 },

  // Sections
  section: { paddingHorizontal: Spacing.xl, marginBottom: 24 },
  sectionTitle: { fontSize: 12, color: Colors.text.tertiary, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  card: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.xl, padding: 16, borderWidth: 1, borderColor: Colors.border, ...Shadows.sm },

  // Syndrome bars
  syndromeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  syndromeInfo: { flexDirection: 'row', alignItems: 'center', width: 130 },
  syndromeDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  syndromeLabel: { fontSize: 10, color: Colors.text.secondary, flex: 1 },
  syndromeBarBg: { flex: 1, height: 5, backgroundColor: Colors.bg.elevated, borderRadius: 3, marginHorizontal: 8, overflow: 'hidden' },
  syndromeBarFill: { height: '100%', borderRadius: 3 },
  syndromeCount: { fontSize: 12, fontWeight: '600', width: 26, textAlign: 'right' },

  // Encounters
  encounterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  encounterDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  encounterName: { fontSize: 13, fontWeight: '500', color: Colors.text.primary },
  encounterMeta: { fontSize: 10, color: Colors.text.tertiary, marginTop: 2 },
  sevChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sevChipText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },

  emptyText: { color: Colors.text.tertiary, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  footer: { alignItems: 'center', paddingVertical: 24 },
  footerText: { fontSize: 10, color: Colors.text.tertiary, letterSpacing: 0.3 },
});
