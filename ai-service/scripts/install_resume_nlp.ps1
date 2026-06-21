# Install resume NLP Python deps + default spaCy English model (Windows).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
python -m pip install -r requirements.txt
python -m spacy download en_core_web_sm
