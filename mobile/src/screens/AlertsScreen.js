import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows, SyndromeLabels, AlertLevelConfig } from '../utils/theme';
import { supabase } from '../services/supabase';
import { ECOWAS_COUNTRIES, getCountryFlag } from '../utils/geo';
import api from '../services/api';
import AlertCard from '../components/AlertCard';

const FILTER_LEVELS = ['all', 'emergency', 'warning', 'watch'];
const SORT_OPTIONS = ['severity', 'recent'];

export default function AlertsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterCountry, setFilterCountry] = useState(null);
  const [sortBy, setSortBy] = useState('severity');
  const [showCountryFilter, setShowCountryFilter] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      // Try Supabase first
      let query = supabase
        .from('alerts')
        .select(`
          id, created_at, alert_level, syndrome_category,
          case_count_current_week, case_count_baseline, ratio_to_baseline,
          trend, weeks_above_threshold, situation_summary,
          recommended_actions, evidence_summary, country_code,
          district_id, is_active
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (filterLevel !== 'all') {
        query = query.eq('alert_level', filterLevel);
      }
      if (filterCountry) {
        query = query.eq('country_code', filterCountry);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Enrich with district names
      const districtIds = [...new Set((data || []).map(a => a.district_id).filter(Boolean))];
      let districtMap = {};
      if (districtIds.length > 0) {
        const { data: districts } = await supabase
          .from('districts')
          .select('id, name')
          .in('id', districtIds);
        (districts || []).forEach(d => { districtMap[d.id] = d.name; });
      }

      setAlerts((data || []).map(a => ({
        ...a,
        alert_id: a.id,
        district: districtMap[a.district_id] || 'Unknown District',
      })));
    } catch {
      // Fallback to API then demo data
      try {
        const res = await api.getAlerts();
        setAlerts(res?.alerts || DEMO_ALERTS);
      } catch {
        setAlerts(DEMO_ALERTS);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterLevel, filterCountry]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Realtime subscription
  useEffect(() => {
    const sub = supabase
      .channel('alerts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [fetchAlerts]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchAlerts(); }, [fetchAlerts]);

  // Sort
  const sorted = [...alerts].sort((a, b) => {
    if (sortBy === 'severity') {
      const o = { emergency: 0, warning: 1, watch: 2 };
      return (o[a.alert_level] ?? 3) - (o[b.alert_level] ?? 3);
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // Count by level
  const countByLevel = {};
  alerts.forEach(a => { countByLevel[a.alert_level] = (countByLevel[a.alert_level] || 0) + 1; });

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Surveillance Alerts</Text>

        {/* Level summary chips */}
        <View style={styles.countRow}>
          {['emergency', 'warning', 'watch'].map(lvl => {
            const n = countByLevel[lvl] || 0;
            const c = AlertLevelConfig[lvl];
            return (
              <View key={lvl} style={[styles.countChip, { backgroundColor: c.color + '12' }]}>
                <Text style={[styles.countChipText, { color: c.color }]}>{n} {c.label}</Text>
              </View>
            );
          })}
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTER_LEVELS.map(lvl => {
            const active = lvl === filterLevel;
            return (
              <TouchableOpacity
                key={lvl}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilterLevel(lvl)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {lvl === 'all' ? 'All' : AlertLevelConfig[lvl]?.label || lvl}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Country filter + sort */}
        <View style={styles.controlRow}>
          <TouchableOpacity style={styles.countryFilterBtn} onPress={() => setShowCountryFilter(!showCountryFilter)}>
            <Ionicons name="globe-outline" size={14} color={Colors.text.secondary} />
            <Text style={styles.countryFilterText}>
              {filterCountry ? `${getCountryFlag(filterCountry)} ${filterCountry}` : 'All countries'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={Colors.text.tertiary} />
          </TouchableOpacity>

          <View style={styles.sortRow}>
            {SORT_OPTIONS.map(s => (
              <TouchableOpacity key={s} style={[styles.sortChip, sortBy === s && styles.sortChipActive]} onPress={() => setSortBy(s)}>
                <Ionicons name={s === 'severity' ? 'alert-circle-outline' : 'time-outline'} size={12} color={sortBy === s ? Colors.accent.primaryDark : Colors.text.tertiary} />
                <Text style={[styles.sortText, sortBy === s && styles.sortTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Country filter dropdown */}
        {showCountryFilter && (
          <View style={styles.countryDropdown}>
            <TouchableOpacity style={styles.countryItem} onPress={() => { setFilterCountry(null); setShowCountryFilter(false); }}>
              <Text style={[styles.countryItemText, !filterCountry && styles.countryItemActive]}>All Countries</Text>
            </TouchableOpacity>
            {ECOWAS_COUNTRIES.map(c => (
              <TouchableOpacity key={c.code} style={styles.countryItem} onPress={() => { setFilterCountry(c.code); setShowCountryFilter(false); }}>
                <Text style={[styles.countryItemText, filterCountry === c.code && styles.countryItemActive]}>
                  {c.flag} {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Alert list */}
        {sorted.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="shield-checkmark-outline" size={44} color={Colors.success} />
            <Text style={styles.emptyTitle}>All Clear</Text>
            <Text style={styles.emptyText}>No active alerts matching your filters.</Text>
          </View>
        ) : (
          sorted.map((a, i) => (
            <AlertCard
              key={a.alert_id || a.id || i}
              alert={a}
              onViewOnMap={() => navigation?.navigate('Map')}
              onGenerateReport={() => navigation?.navigate('Reports')}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const DEMO_ALERTS = [
  { alert_id: 'a1', alert_level: 'emergency', syndrome_category: 'acute_watery_diarrhea', district: 'Kintampo North', country_code: 'GH', case_count_current_week: 25, case_count_baseline: 5.2, ratio_to_baseline: 4.81, trend: 'increasing', weeks_above_threshold: 3, situation_summary: 'Significant cluster of acute watery diarrhea. 25 cases this week represent a nearly 5-fold increase above baseline. Pattern consistent with possible cholera outbreak.', recommended_actions: ['Deploy rapid diagnostic testing', 'Activate oral rehydration stations', 'Investigate water sources', 'Alert neighboring districts'] },
  { alert_id: 'a2', alert_level: 'warning', syndrome_category: 'acute_hemorrhagic_fever', district: 'Bolgatanga', country_code: 'GH', case_count_current_week: 3, case_count_baseline: 0.5, ratio_to_baseline: 6.0, trend: 'increasing', weeks_above_threshold: 1, situation_summary: 'Three cases of hemorrhagic fever. Two are healthcare workers.', recommended_actions: ['Case investigation with contact tracing', 'Infection control measures', 'Collect specimens for lab confirmation'] },
  { alert_id: 'a3', alert_level: 'warning', syndrome_category: 'acute_rash_fever', district: 'Tamale Metro', country_code: 'GH', case_count_current_week: 12, case_count_baseline: 3.0, ratio_to_baseline: 4.0, trend: 'increasing', weeks_above_threshold: 2, situation_summary: 'Measles-like illness cluster in unvaccinated children aged 1-5.', recommended_actions: ['Laboratory confirmation', 'Ring vaccination campaign', 'Enhanced school surveillance'] },
  { alert_id: 'a4', alert_level: 'watch', syndrome_category: 'acute_respiratory_infection', district: 'Wa Municipal', country_code: 'GH', case_count_current_week: 18, case_count_baseline: 12.0, ratio_to_baseline: 1.5, trend: 'stable', weeks_above_threshold: 1, situation_summary: 'Moderate increase in respiratory infections. Likely seasonal.', recommended_actions: ['Continue routine surveillance', 'Monitor for SARI cases'] },
];

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.secondary },
  scroll: { paddingHorizontal: Spacing.xl, paddingBottom: 40 },

  title: { fontSize: Typography.size.lg, fontWeight: '500', color: Colors.text.primary, marginTop: 16, marginBottom: 10, letterSpacing: -0.3 },

  countRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  countChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countChipText: { fontSize: 10, fontWeight: '700' },

  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: Colors.bg.card, borderRadius: 20, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.ultraLight },
  filterChipText: { fontSize: 12, color: Colors.text.secondary, textTransform: 'capitalize' },
  filterChipTextActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  countryFilterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.bg.card, borderRadius: BorderRadius.sm, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  countryFilterText: { fontSize: 12, color: Colors.text.secondary },
  sortRow: { flexDirection: 'row', gap: 6 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.bg.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  sortChipActive: { borderColor: Colors.accent.primary, backgroundColor: Colors.accent.ultraLight },
  sortText: { fontSize: 11, color: Colors.text.tertiary, textTransform: 'capitalize' },
  sortTextActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  countryDropdown: { backgroundColor: Colors.bg.card, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, marginBottom: 12, maxHeight: 200, overflow: 'hidden', ...Shadows.sm },
  countryItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  countryItemText: { fontSize: 13, color: Colors.text.secondary },
  countryItemActive: { color: Colors.accent.primaryDark, fontWeight: '600' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: Colors.success, marginTop: 12 },
  emptyText: { fontSize: 13, color: Colors.text.tertiary, textAlign: 'center', marginTop: 6 },
});
