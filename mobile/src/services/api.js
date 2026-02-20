/**
 * EpiCast API Service
 *
 * High-level API that screens call. Combines:
 *   - RunPod serverless (ML inference)
 *   - 3-tier cache (memory → AsyncStorage → Supabase)
 *   - Supabase (persistent encounter storage)
 *
 * Cached routes:   extract, cough/analyze, image/triage
 * Fresh routes:    health, dashboard, alerts, surveillance/report
 */

import { callRunPod, checkHealth, warmUp } from './runpod';
import { cacheGet, cacheSet, narrativeHash } from './cache';
import { supabase } from './supabase';

// ── Cached ML Inference ───────────────────────────────────────────────────

/**
 * Extract syndromic signal from clinical narrative.
 * Results are cached across all 3 tiers.
 *
 * @param {string} narrative - Clinical narrative text
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Syndromic signal JSON
 */
export async function extractSyndrome(narrative, onProgress = null) {
  if (!narrative?.trim()) throw new Error('No narrative provided');

  // Check cache
  const cached = await cacheGet('extract', narrative);
  if (cached) return cached;

  // Call RunPod
  const result = await callRunPod('extract', { narrative }, onProgress);

  // Cache result
  if (result && !result.error) {
    await cacheSet('extract', narrative, result);
  }

  return result;
}

/**
 * Analyze cough audio using HeAR model.
 * Results are cached by audio hash.
 *
 * @param {string} audioBase64 - Base64-encoded audio data
 * @param {string} format - Audio format (default: 'wav')
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Cough classification result
 */
export async function analyzeCough(audioBase64, format = 'wav', onProgress = null) {
  if (!audioBase64) throw new Error('No audio data provided');

  // Cache key uses first 100 chars of base64 (enough for uniqueness)
  const cacheKey = audioBase64.slice(0, 100);

  const cached = await cacheGet('cough', cacheKey);
  if (cached) return cached;

  const result = await callRunPod('cough/analyze', {
    audio_base64: audioBase64,
    format,
  }, onProgress);

  if (result && !result.error) {
    await cacheSet('cough', cacheKey, result);
  }

  return result;
}

/**
 * Triage clinical photo using MedGemma 4B vision.
 * Results are cached by image hash.
 *
 * @param {string} imageBase64 - Base64-encoded image data
 * @param {string} clinicalContext - Optional narrative context
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Image classification result
 */
export async function triageImage(imageBase64, clinicalContext = null, onProgress = null) {
  if (!imageBase64) throw new Error('No image data provided');

  const cacheKey = imageBase64.slice(0, 100);

  const cached = await cacheGet('image', cacheKey);
  if (cached) return cached;

  const result = await callRunPod('image/triage', {
    image_base64: imageBase64,
    clinical_context: clinicalContext,
  }, onProgress);

  if (result && !result.error) {
    await cacheSet('image', cacheKey, result);
  }

  return result;
}

// ── Multi-Modal ───────────────────────────────────────────────────────────

/**
 * Fuse multiple modality results into a combined assessment.
 * Not cached (lightweight math, no GPU).
 *
 * @param {object} textResult  - From extractSyndrome()
 * @param {object} coughResult - From analyzeCough() or null
 * @param {object} imageResult - From triageImage() or null
 * @returns {object} Fused confidence + agreement analysis
 */
export async function fuseModalities(textResult, coughResult = null, imageResult = null) {
  return callRunPod('fuse', {
    text_result: textResult || null,
    cough_result: coughResult || null,
    image_result: imageResult || null,
  });
}

/**
 * Full multi-modal encounter — runs all available models in one RunPod call.
 * Use this instead of calling extract + cough + image separately to save
 * round trips (especially important with cold starts).
 *
 * @param {object} params
 * @param {string} params.narrative - Clinical narrative
 * @param {string} params.audioBase64 - Cough audio (optional)
 * @param {string} params.imageBase64 - Clinical photo (optional)
 * @param {string} params.district - District name
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Combined results from all models + fusion
 */
export async function processMultimodal({
  narrative, audioBase64 = null, imageBase64 = null,
  district = null, latitude = null, longitude = null,
}, onProgress = null) {
  const result = await callRunPod('encounter/multimodal', {
    narrative,
    audio_base64: audioBase64,
    image_base64: imageBase64,
    district,
    latitude,
    longitude,
  }, onProgress);

  // Cache individual sub-results for future reuse
  if (result?.text && !result.text.error) {
    await cacheSet('extract', narrative, result.text);
  }
  if (result?.cough && !result.cough.error && audioBase64) {
    await cacheSet('cough', audioBase64.slice(0, 100), result.cough);
  }
  if (result?.image && !result.image.error && imageBase64) {
    await cacheSet('image', imageBase64.slice(0, 100), result.image);
  }

  return result;
}

// ── Encounter Submission (RunPod + Supabase) ──────────────────────────────

/**
 * Submit an encounter: extract syndromic signal via RunPod, then store in Supabase.
 *
 * @param {object} params
 * @param {string} params.narrative - Clinical narrative
 * @param {string} params.district - District name
 * @param {string} params.facilityName - Facility name
 * @param {number} params.latitude
 * @param {number} params.longitude
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Encounter result with syndromic signal
 */
export async function submitEncounter({
  narrative, district, facilityName, latitude, longitude,
}, onProgress = null) {
  // Extract syndromic signal (uses cache if available)
  const signal = await extractSyndrome(narrative, onProgress);

  // Store encounter in Supabase
  onProgress?.('Saving encounter...');
  try {
    const { data: user } = await supabase.auth.getUser();
    await supabase.from('encounters').insert({
      narrative_text: narrative,
      narrative_hash: narrativeHash(narrative),
      syndromic_signal: signal,
      syndrome_category: signal?.syndrome_category,
      severity: signal?.severity,
      district_name: district,
      facility_name: facilityName,
      latitude,
      longitude,
      user_id: user?.user?.id || null,
    });
  } catch {
    // Supabase write is best-effort — don't fail the encounter
  }

  return {
    syndromic_signal: signal,
    district,
    timestamp: new Date().toISOString(),
  };
}

// ── Fresh Data (Never Cached) ─────────────────────────────────────────────

/**
 * Health check — also warms up the RunPod worker.
 */
export async function healthCheck() {
  return checkHealth();
}

/**
 * Pre-warm the RunPod worker. Call on app open.
 */
export { warmUp };

/**
 * Get dashboard stats. Always fetched fresh.
 */
export async function getDashboard(onProgress = null) {
  return callRunPod('dashboard', {}, onProgress);
}

/**
 * Get active alerts. Always fetched fresh.
 */
export async function getAlerts(onProgress = null) {
  return callRunPod('alerts', {}, onProgress);
}

/**
 * Run anomaly detection scan across districts.
 */
export async function runSurveillanceScan(district = null, onProgress = null) {
  return callRunPod('surveillance/scan', { district }, onProgress);
}

/**
 * Generate a situation report using MedGemma 27B. Always fresh.
 *
 * @param {string} district - District to report on
 * @param {string} reportType - 'situation_report' (default)
 * @param {function} onProgress - Optional progress callback
 */
export async function generateReport(district, reportType = 'situation_report', onProgress = null) {
  return callRunPod('surveillance/report', {
    district,
    report_type: reportType,
  }, onProgress);
}

// ── Legacy compatibility ──────────────────────────────────────────────────
// These map old EpiCastAPI class methods to the new functional API
// so existing screens don't break during migration.

class EpiCastAPI {
  async healthCheck() { return healthCheck(); }

  async submitEncounter({ narrative, district, facilityName, latitude, longitude }) {
    return submitEncounter({ narrative, district, facilityName, latitude, longitude });
  }

  async runSurveillanceScan(district = null) {
    return runSurveillanceScan(district);
  }

  async generateReport(district) {
    return generateReport(district);
  }

  async getAlerts() { return getAlerts(); }

  async getDashboard() { return getDashboard(); }

  async transcribeAudio(audioBase64, format = 'wav') {
    // MedASR is handled internally by the extract route on RunPod
    return callRunPod('extract', { audio_base64: audioBase64, format });
  }

  async classifyImage(imageBase64, clinicalContext = null) {
    return triageImage(imageBase64, clinicalContext);
  }

  async analyzeCough(audioBase64, format = 'wav') {
    return analyzeCough(audioBase64, format);
  }

  async fuseModalities(textResult, coughResult, imageResult) {
    return fuseModalities(textResult, coughResult, imageResult);
  }
}

export const api = new EpiCastAPI();
export default api;
