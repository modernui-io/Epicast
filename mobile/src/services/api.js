/**
 * EpiCast API Service
 * Connects React Native app to FastAPI backend on H100.
 */

const API_BASE_URL = __DEV__
  ? 'http://192.168.1.100:8000'
  : 'https://epicast-api.your-domain.com';

class EpiCastAPI {
  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async _fetch(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error.message.includes('Network request failed')) {
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
}

export const api = new EpiCastAPI();
export default api;
