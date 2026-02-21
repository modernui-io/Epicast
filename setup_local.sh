#!/bin/bash
# EpiCast Local Server Setup for Mac (Apple Silicon, 18GB RAM)
# Run this once to set everything up.

set -e

echo "=================================="
echo "EpiCast Local Server Setup"
echo "=================================="

# 1. Python deps
echo ""
echo "[1/4] Installing Python dependencies..."
pip install flask flask-cors onnxruntime numpy librosa joblib soundfile huggingface_hub

# 2. llama.cpp
echo ""
echo "[2/4] Installing llama.cpp..."
if command -v llama-server &> /dev/null; then
    echo "  llama.cpp already installed"
else
    echo "  Installing via Homebrew..."
    brew install llama.cpp
fi

# 3. Download models
echo ""
echo "[3/4] Downloading models..."
mkdir -p models/hear models/medgemma-27b

# HeAR ONNX + classifier
echo "  Downloading HeAR ONNX..."
huggingface-cli download Janeodum/epicast-hear-mobile --local-dir ./models/hear

# MedGemma 27B GGUF - Q3_K_M (13.4GB, fits in 18GB RAM with headroom)
echo ""
echo "  Downloading MedGemma 27B Q3_K_M (13.4 GB)..."
huggingface-cli download bartowski/google_medgemma-27b-it-GGUF \
    --include "google_medgemma-27b-it-Q3_K_M.gguf" \
    --local-dir ./models/medgemma-27b

# 4. Instructions
echo ""
echo "=================================="
echo "[4/4] Setup complete!"
echo "=================================="
echo ""
echo "To run:"
echo ""
echo "  Terminal 1 (MedGemma 27B):"
echo "    llama-server -m ./models/medgemma-27b/google_medgemma-27b-it-Q3_K_M.gguf -c 4096 --host 0.0.0.0 --port 8081"
echo ""
echo "  Terminal 2 (EpiCast server):"
echo "    python epicast_local_server.py"
echo ""
echo "  Then point your React Native app to:"
echo "    http://$(ipconfig getifaddr en0):5050"
echo ""
echo "  Test:"
echo "    curl http://localhost:5050/health"
echo ""
