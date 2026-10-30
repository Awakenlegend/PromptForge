PromptForge

PromptForge is an AI-powered prompt enhancement and image generation platform. It helps users transform rough ideas into detailed image prompts, analyze the visual style of reference images, generate images, and compare original prompts with enhanced prompts.

Features

•
AI-powered prompt enhancement

•
Reference-image style analysis

•
Support for Gemini, Groq, and Cloudflare Workers AI

•
Image generation with SDXL Lightning, Flux, Flux.2 Klein, and Nano Banana

•
Original-versus-enhanced image comparison

•
Responsive dark-themed React interface

Tech Stack

•
Frontend: React, Vite, Tailwind CSS

•
Backend: FastAPI, Python, Uvicorn

•
AI Providers: Google Gemini, Groq, Cloudflare Workers AI

Project Structure

Plain Text


art-prompt-enhancer-main/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .env.example
└── README.md



Requirements

•
Python 3.10+

•
Node.js 18+

•
npm

•
Google Gemini API key

•
Cloudflare Account ID and API token

•
Groq API key, if using Groq features

Configuration

Create a .env file in the project root:

Plain Text


GOOGLE_API_KEY=your_google_api_key
# GEMINI_API_KEY=your_google_api_key
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
GROQ_API_KEY=your_groq_api_key
GEMINI_MODEL=gemini-3.8-flash
FRONTEND_ORIGINS=http://localhost:5173
PORT=8000



Never commit .env or expose API keys in frontend code.

Installation

Backend

Bash


python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000



Frontend

Bash


cd frontend
npm install
npm run dev



Open the frontend at 

http://localhost:5173.

The backend is available at 

http://localhost:8000. Interactive API documentation is available at 

http://localhost:8000/docs.

API Endpoints

Method
Endpoint
Description
GET
/health
Check API status
GET
/enhance-models
List prompt-enhancement providers
GET
/analysis-models
List image-analysis providers
POST
/enhance
Enhance a text prompt
POST
/upload
Analyze an uploaded image
POST
/generate-image
Generate an image
POST
/compare-images
Compare original and enhanced prompts




Example: Enhance a Prompt

Bash


curl -X POST http://localhost:8000/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a futuristic city at night",
    "model": "Flux",
    "enhance_provider": "groq-qwen"
  }'



Image Upload Requirements

•
Request type: multipart/form-data

•
Accepted files: images only

•
Maximum file size: 10 MB

Screenshots

Add the main workspace screenshot to docs/screenshots/ and replace the placeholder below.

Main Workspace

<!-- ![PromptForge main workspace](docs/screenshots/main-workspace.png) -->



  



License

MIT License

Copyright (c) Mohammed Farhan

This project is licensed under the 

MIT License.

# PromptForge
