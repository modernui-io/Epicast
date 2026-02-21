/**
 * EpiCast API Service — Hybrid On-Device + Cloud
 *
 * Routing (strict):
 *   On-device only: extractSyndrome (MedGemma 4B), triageImage (MedSigLIP)
 *   Cloud only:     analyzeCough (HeAR via RunPod), generateReport (27B)
 *
 * If on-device model is not ready, throw — do NOT fall back to cloud for
 * extraction or image triage.
 *
 * RunPod endpoints used: cough/analyze, surveillance/report
 */

import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { callRunPod, checkHealth, warmUp } from './runpod';
import { cacheGet, cacheSet } from './cache';

const LOCAL_SERVER_URL = (process.env.EXPO_PUBLIC_LOCAL_SERVER_URL || '').trim();

/** Returns true when the local Mac server is configured (non-empty URL). */
export function isUsingLocalServer() {
  return !!LOCAL_SERVER_URL;
}
import {
  extractSyndromeOnDevice,
  triageImageOnDevice,
  isModelReady as isOnDeviceReady,
  isVisionReady,
  initOnDeviceModel,
  releaseModel,
} from './onDeviceAI';
import { initHearModel, analyzeCoughOnDevice, releaseHearModel } from './onDeviceCough';
import { computeFusion } from './fusion';
import { areLlamaModelsReady, areHearModelsReady } from './modelManager';

/**
 * Ensure on-device LLaMA model is loaded.
 * Lazy re-init if released (app backgrounded).
 * Returns true if ready, false if models not downloaded yet.
 */
async function ensureOnDeviceReady() {
  if (isOnDeviceReady()) return true;

  const modelsDownloaded = await areLlamaModelsReady();
  if (!modelsDownloaded) return false;

  try {
    return await initOnDeviceModel();
  } catch {
    return false;
  }
}

// ── On-Device Inference ───────────────────────────────────────────────────────

/**
 * Extract syndromic signal from clinical narrative.
 * ON-DEVICE ONLY — MedGemma 4B via llama.rn.
 * No cloud fallback. Throws if model not loaded yet.
 *
 * @param {string} narrative - Clinical narrative text
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Syndromic signal JSON
 */
export async function extractSyndrome(narrative, onProgress = null) {
  if (!narrative?.trim()) throw new Error('No narrative provided');

  // Check cache first
  const cached = await cacheGet('extract', narrative);
  if (cached) return cached;

  // Ensure model is ready — lazy re-init if backgrounded
  const ready = await ensureOnDeviceReady();
  if (!ready) {
    const downloaded = await areLlamaModelsReady();
    if (!downloaded) {
      throw new Error('AI models not downloaded. Download MedGemma from Settings to use on-device extraction.');
    }
    throw new Error('AI model loading — please wait 30 seconds and try again.');
  }

  onProgress?.('Analyzing on-device...');
  const result = await extractSyndromeOnDevice(narrative);

  if (!result.success || !result.data) {
    throw new Error('On-device extraction failed — please try again.');
  }

  const data = { ...result.data, _source: 'on-device', _model: result.model };
  await cacheSet('extract', narrative, data);
  return data;
}

/**
 * Triage clinical photo.
 * ON-DEVICE ONLY — MedGemma 4B vision (MedSigLIP) via llama.rn.
 * No cloud fallback. Throws if vision model not loaded.
 *
 * @param {string} imageBase64 - Base64-encoded image
 * @param {string} clinicalContext - Optional narrative context
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Image classification result
 */
export async function triageImage(imageBase64, clinicalContext = null, onProgress = null) {
  if (!imageBase64) throw new Error('No image data provided');

  const cacheKey = imageBase64.slice(0, 100);
  const cached = await cacheGet('image', cacheKey);
  if (cached) return cached;

  // Ensure LLaMA is loaded (vision is part of the same model)
  const ready = await ensureOnDeviceReady();
  if (!ready) {
    throw new Error('AI model loading — please wait and try again.');
  }

  if (!isVisionReady()) {
    throw new Error('Vision model not available — the vision projector may still be loading.');
  }

  onProgress?.('Analyzing image on-device...');

  // llama.rn needs a local filesystem path — write base64 to a temp file
  const tmpUri = `${FileSystem.cacheDirectory}triage_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(tmpUri, imageBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  try {
    // Strip file:// prefix — llama.rn expects a raw path, not a URI
    const localPath = tmpUri.replace('file://', '');
    const result = await triageImageOnDevice(localPath, clinicalContext || '');

    if (!result.success || !result.data) {
      throw new Error('On-device image triage failed — please try again.');
    }

    const data = { ...result.data, _source: 'on-device' };
    await cacheSet('image', cacheKey, data);
    return data;
  } finally {
    FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => { });
  }
}

// ── Cloud-Only Inference ──────────────────────────────────────────────────────

/**
 * Analyze cough audio using HeAR model.
 * CLOUD ONLY — RunPod endpoint: cough/analyze
 *
 * @param {string} audioBase64 - Base64-encoded audio data
 * @param {string} format - Audio format (default: 'wav')
 * @param {function} onProgress - Optional progress callback
 * @returns {object} Cough classification result
 */
export async function analyzeCough(audioBase64, format = 'wav', onProgress = null) {
  if (!audioBase64) throw new Error('No audio data provided');

  const cacheKey = audioBase64.slice(0, 100);
  const cached = await cacheGet('cough', cacheKey);
  if (cached) return cached;

  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    throw new Error('No internet connection. Cough analysis requires cloud connectivity.');
  }

  // ── Local Mac server ──────────────────────────────────────────────────────
  if (LOCAL_SERVER_URL) {
    onProgress?.('Analyzing cough (local server)...');
    const tmpUri = `${FileSystem.cacheDirectory}cough_${Date.now()}.${format}`;
    await FileSystem.writeAsStringAsync(tmpUri, audioBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    try {
      const formData = new FormData();
      formData.append('audio', { uri: tmpUri, type: `audio/${format}`, name: `cough.${format}` });
      const res = await fetch(`${LOCAL_SERVER_URL}/v1/hear/classify`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      data._source = 'local';
      await cacheSet('cough', cacheKey, data);
      return data;
    } finally {
      FileSystem.deleteAsync(tmpUri, { idempotent: true }).catch(() => { });
    }
  }

  // ── RunPod (production) ───────────────────────────────────────────────────
  onProgress?.('Analyzing cough biomarkers via cloud...');
  const result = await callRunPod('cough/analyze', { audio_base64: audioBase64, format }, onProgress);

  if (result && !result.error) {
    result._source = 'cloud';
    await cacheSet('cough', cacheKey, result);
  }

  return result;
}

// ── Multi-Modal Fusion ────────────────────────────────────────────────────────

/**
 * Fuse multiple modality results. Pure JS — no network call.
 */
export async function fuseModalities(textResult, coughResult = null, imageResult = null) {
  return computeFusion(textResult, coughResult, imageResult);
}

// ── Encounter Submission ──────────────────────────────────────────────────────

/**
 * Submit an encounter: extract syndromic signal on-device, store in Supabase.
 */
export async function submitEncounter({
  narrative, district, facilityName, latitude, longitude,
}, onProgress = null) {
  const signal = await extractSyndrome(narrative, onProgress);

  return {
    syndromic_signal: signal,
    district,
    timestamp: new Date().toISOString(),
  };
}

// ── Cloud-Only Endpoints ──────────────────────────────────────────────────────

export async function generateReport(district, reportType = 'situation_report', onProgress = null) {
  // ── Local Mac server ──────────────────────────────────────────────────────
  if (LOCAL_SERVER_URL) {
    onProgress?.('Generating report (local MedGemma 27B)...');
    const prompt = `Generate a ${reportType.replace(/_/g, ' ')} for ${district}.`;
    const res = await fetch(`${LOCAL_SERVER_URL}/v1/report/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, max_tokens: 2048 }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return { report: data.text, tokens_used: data.tokens_used, _source: 'local' };
  }

  // ── RunPod (production) ───────────────────────────────────────────────────
  return callRunPod('surveillance/report', { district, report_type: reportType }, onProgress);
}

export async function getDashboard(onProgress = null) {
  return callRunPod('dashboard', {}, onProgress);
}

export async function getAlerts(onProgress = null) {
  return callRunPod('alerts', {}, onProgress);
}

export async function runSurveillanceScan(district = null, onProgress = null) {
  return callRunPod('surveillance/scan', { district }, onProgress);
}

export async function healthCheck() {
  return checkHealth();
}

export { warmUp };

// ── App Initialization ───────────────────────────────────────────────────────

/**
 * Initialize on-device MedGemma at startup.
 * Cough (HeAR) is cloud-only — no HeAR init needed here.
 */
export async function initializeEpiCast(onProgress) {
  const modelReady = await initOnDeviceModel(onProgress);

  // Pre-warm RunPod for cough analysis (non-blocking)
  NetInfo.fetch().then(state => {
    if (state.isConnected) warmUp();
  });

  return {
    onDeviceReady: modelReady,
    visionReady: isVisionReady(),
  };
}

// ── Legacy Compatibility ──────────────────────────────────────────────────────

class EpiCastAPI {
  async healthCheck() { return healthCheck(); }

  async submitEncounter({ narrative, district, facilityName, latitude, longitude }) {
    return submitEncounter({ narrative, district, facilityName, latitude, longitude });
  }

  async runSurveillanceScan(district = null) { return runSurveillanceScan(district); }
  async generateReport(district) { return generateReport(district); }
  async getAlerts() { return getAlerts(); }
  async getDashboard() { return getDashboard(); }

  async transcribeAudio(audioBase64, format = 'wav') {
    // MedASR transcription — cloud only (Whisper on RunPod)
    return callRunPod('transcribe', { audio_base64: audioBase64, format });
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
