"""
EpiCast API — FastAPI backend connecting all agents.

Endpoints:
    POST /encounter           — Submit a clinical encounter (text or audio)
    POST /encounter/image     — Submit a clinical image for triage
    GET  /surveillance/scan   — Run anomaly scan across all districts
    GET  /surveillance/report — Generate situation report for a district
    GET  /alerts              — Get active alerts
    POST /alert/advisory      — Generate health advisory for an alert
    GET  /fhir/report         — Generate FHIR surveillance report
    GET  /dashboard           — Dashboard summary data

Usage:
    uvicorn src.api.app:app --host 0.0.0.0 --port 8000 --reload
"""

import os
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from loguru import logger


# ============================================================================
# Global state (initialized at startup)
# ============================================================================
_state = {
    "intake_agent": None,
    "image_agent": None,
    "surveillance_agent": None,
    "alert_agent": None,
    "database": None,
    "initialized": False,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models and agents at startup."""
    logger.info("Initializing EpiCast...")

    # Check for edge mode (4B only) vs full mode (4B + 27B)
    edge_mode = os.environ.get("EPICAST_EDGE_MODE", "true").lower() == "true"

    from src.agents.surveillance_agent import SurveillanceDatabase

    _state["database"] = SurveillanceDatabase()

    try:
        from src.models.medgemma_loader import load_medgemma_4b

        # Load MedGemma 4B (always needed)
        lora_path = os.environ.get("EPICAST_LORA_PATH", None)
        model_4b, proc_4b = load_medgemma_4b(
            model_id=os.environ.get("MEDGEMMA_4B_ID", "google/medgemma-4b-it"),
            quantize="4bit",
            lora_adapter_path=lora_path,
        )

        # Initialize Intake Agent
        from src.agents.intake_agent import IntakeAgent
        use_medasr = os.environ.get("EPICAST_USE_MEDASR", "false").lower() == "true"
        _state["intake_agent"] = IntakeAgent(
            model=model_4b,
            processor=proc_4b,
            use_medasr=use_medasr,
        )

        # Initialize Image Triage Agent
        from src.agents.image_triage_agent import ImageTriageAgent
        _state["image_agent"] = ImageTriageAgent(
            medgemma_model=model_4b,
            medgemma_processor=proc_4b,
        )

        # Load 27B if not in edge mode
        model_27b, proc_27b = None, None
        if not edge_mode:
            try:
                from src.models.medgemma_loader import load_medgemma_27b
                model_27b, proc_27b = load_medgemma_27b(quantize="4bit")
            except Exception as e:
                logger.warning(f"27B model not loaded (edge mode fallback): {e}")

        # Initialize Surveillance Agent
        from src.agents.surveillance_agent import SurveillanceAgent
        _state["surveillance_agent"] = SurveillanceAgent(
            database=_state["database"],
            model_27b=model_27b,
            processor_27b=proc_27b,
            model_4b=model_4b,
            processor_4b=proc_4b,
        )

        # Initialize Alert Agent
        from src.agents.alert_agent import AlertAgent
        _state["alert_agent"] = AlertAgent(
            model=model_27b or model_4b,
            processor=proc_27b or proc_4b,
        )

        _state["initialized"] = True
        mode_str = "EDGE (4B only)" if edge_mode else "FULL (4B + 27B)"
        logger.info(f"EpiCast initialized successfully in {mode_str} mode")

    except Exception as e:
        logger.error(f"Initialization failed: {e}")
        logger.info("Running in DEMO mode without models")

    yield

    logger.info("Shutting down EpiCast...")


# ============================================================================
# FastAPI App
# ============================================================================
app = FastAPI(
    title="EpiCast API",
    description="Agentic Disease Surveillance System powered by MedGemma",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Request/Response Models
# ============================================================================
class EncounterRequest(BaseModel):
    narrative: str
    district: Optional[str] = None
    facility_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class AdvisoryRequest(BaseModel):
    alert_id: str
    language: str = "english"
    audience: str = "community"


# ============================================================================
# Endpoints
# ============================================================================
@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "initialized": _state["initialized"],
        "total_encounters": _state["database"].total_encounters if _state["database"] else 0,
    }


@app.post("/encounter")
async def submit_encounter(request: EncounterRequest):
    """Submit a clinical encounter for syndromic extraction."""
    if not _state["intake_agent"]:
        raise HTTPException(503, "Intake agent not initialized")

    encounter = _state["intake_agent"].process_encounter(
        narrative=request.narrative,
        location_lat=request.latitude,
        location_lon=request.longitude,
        district=request.district,
        facility_name=request.facility_name,
    )

    # Store in database
    _state["database"].add_encounter(encounter)

    # Serialize response
    signal_data = None
    if encounter.syndromic_signal:
        signal_data = encounter.syndromic_signal.model_dump()

    return {
        "encounter_id": encounter.encounter_id,
        "timestamp": encounter.timestamp.isoformat(),
        "syndromic_signal": signal_data,
        "total_encounters": _state["database"].total_encounters,
    }


@app.get("/surveillance/scan")
async def run_surveillance_scan(district: Optional[str] = None):
    """Run anomaly detection scan across districts."""
    if not _state["surveillance_agent"]:
        raise HTTPException(503, "Surveillance agent not initialized")

    districts = [district] if district else None
    alerts = _state["surveillance_agent"].scan_for_anomalies(districts=districts)

    return {
        "scan_time": datetime.now().isoformat(),
        "alerts_count": len(alerts),
        "alerts": [a.model_dump() for a in alerts],
    }


@app.get("/surveillance/report")
async def generate_report(district: str):
    """Generate situation report for a district."""
    if not _state["surveillance_agent"]:
        raise HTTPException(503, "Surveillance agent not initialized")

    alerts = _state["surveillance_agent"].scan_for_anomalies(districts=[district])
    report = _state["surveillance_agent"].generate_situation_report(district, alerts)

    return {
        "district": district,
        "report_time": datetime.now().isoformat(),
        "report": report,
        "alerts": [a.model_dump() for a in alerts],
    }


@app.get("/alerts")
async def get_alerts():
    """Get all active surveillance alerts."""
    if not _state["surveillance_agent"]:
        raise HTTPException(503, "Surveillance agent not initialized")

    alerts = _state["surveillance_agent"].scan_for_anomalies()

    return {
        "timestamp": datetime.now().isoformat(),
        "total_alerts": len(alerts),
        "by_level": {
            "emergency": len([a for a in alerts if a.alert_level == "emergency"]),
            "warning": len([a for a in alerts if a.alert_level == "warning"]),
            "watch": len([a for a in alerts if a.alert_level == "watch"]),
        },
        "alerts": [a.model_dump() for a in alerts],
    }


@app.post("/alert/advisory")
async def generate_advisory(request: AdvisoryRequest):
    """Generate a health advisory for an alert."""
    if not _state["alert_agent"]:
        raise HTTPException(503, "Alert agent not initialized")

    # Find the alert
    alerts = _state["surveillance_agent"].scan_for_anomalies()
    target = next((a for a in alerts if a.alert_id == request.alert_id), None)

    if not target and alerts:
        target = alerts[0]  # Demo fallback

    if not target:
        raise HTTPException(404, "Alert not found")

    advisory = _state["alert_agent"].generate_health_advisory(
        alert=target,
        language=request.language,
        audience=request.audience,
    )

    return {
        "alert_id": target.alert_id,
        "language": request.language,
        "audience": request.audience,
        "advisory": advisory,
    }


@app.get("/fhir/report")
async def generate_fhir_report(district: str):
    """Generate FHIR-compatible surveillance report."""
    if not _state["alert_agent"] or not _state["database"]:
        raise HTTPException(503, "System not initialized")

    now = datetime.now()
    period_start = now - timedelta(days=7)

    alerts = _state["surveillance_agent"].scan_for_anomalies(districts=[district])
    syndrome_counts = _state["database"].syndrome_distribution

    report = _state["alert_agent"].generate_fhir_report(
        district=district,
        period_start=period_start,
        period_end=now,
        syndrome_counts=syndrome_counts,
        alerts=alerts,
    )

    return report


@app.get("/dashboard")
async def dashboard_data():
    """Get dashboard summary data."""
    db = _state["database"]
    if not db:
        return {"error": "Database not initialized"}

    # Run scan
    alerts = []
    if _state["surveillance_agent"]:
        alerts = _state["surveillance_agent"].scan_for_anomalies()

    return {
        "timestamp": datetime.now().isoformat(),
        "total_encounters": db.total_encounters,
        "syndrome_distribution": db.syndrome_distribution,
        "districts": list(set(db._signal_districts)),
        "active_alerts": {
            "total": len(alerts),
            "emergency": len([a for a in alerts if a.alert_level == "emergency"]),
            "warning": len([a for a in alerts if a.alert_level == "warning"]),
            "watch": len([a for a in alerts if a.alert_level == "watch"]),
        },
        "recent_encounters": [
            {
                "id": e.encounter_id,
                "time": e.timestamp.isoformat(),
                "district": e.district,
                "syndrome": e.syndromic_signal.syndrome_category if e.syndromic_signal else None,
                "severity": e.syndromic_signal.severity.value if e.syndromic_signal else None,
            }
            for e in db.encounters[-20:]  # Last 20
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
