/**
 * EpiCast API Service
 * Connects React Native app to FastAPI backend on H100.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:8000';

class EpiCastAPI {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async _fetch(endpoint, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        signal: controller.signal,
        ...options,
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError' || error.message.includes('Network request failed')) {
        throw new Error('Cannot reach EpiCast server.');
      }
      throw error;
    }
  }

  async healthCheck() { return this._fetch('/health'); }

  async submitEncounter({ narrative, district, facilityName, latitude, longitude }) {
    return this._fetch('/encounter', {
      method: 'POST',
      body: JSON.stringify({ narrative, district, facility_name: facilityName, latitude, longitude }),
    });
  }

  async runSurveillanceScan(district = null) {
    const params = district ? `?district=${encodeURIComponent(district)}` : '';
    return this._fetch(`/surveillance/scan${params}`);
  }

  async generateReport(district) {
    return this._fetch(`/surveillance/report?district=${encodeURIComponent(district)}`);
  }

  async getAlerts() { return this._fetch('/alerts'); }

  async generateAdvisory({ alertId, language = 'english', audience = 'community' }) {
    return this._fetch('/alert/advisory', {
      method: 'POST',
      body: JSON.stringify({ alert_id: alertId, language, audience }),
    });
  }

  async getFHIRReport(district) {
    return this._fetch(`/fhir/report?district=${encodeURIComponent(district)}`);
  }

  async getDashboard() { return this._fetch('/dashboard'); }

  async transcribeAudio(audioBase64, format = 'wav') {
    return this._fetch('/transcribe', {
      method: 'POST',
      body: JSON.stringify({ audio_base64: audioBase64, format }),
    });
  }

  async classifyImage(imageBase64, clinicalContext = null) {
    return this._fetch('/image-triage', {
      method: 'POST',
      body: JSON.stringify({ image_base64: imageBase64, clinical_context: clinicalContext }),
    });
  }

  async getHearSpectrogram() { return this._fetch('/hear/spectrogram'); }

  async analyzeCough(audioBase64, format = 'wav') {
    return this._fetch('/cough/analyze', {
      method: 'POST',
      body: JSON.stringify({ audio_base64: audioBase64, format }),
    });
  }
}

export const api = new EpiCastAPI();
export default api;
