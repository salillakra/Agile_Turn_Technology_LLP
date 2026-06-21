#!/usr/bin/env sh
# Install resume NLP Python deps + default spaCy English model.
set -e
cd "$(dirname "$0")/.."
python -m pip install -r requirements.txt
python -m spacy download en_core_web_sm
