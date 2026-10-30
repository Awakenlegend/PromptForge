# ⚡ PromptForge

### Transform Ideas into Extraordinary AI Art

PromptForge is an AI-powered prompt enhancement and image generation platform that transforms simple ideas into detailed, visually rich prompts. It helps users analyze reference-image styles, generate AI images, and compare results using original and enhanced prompts.

---

## ✨ Features

* **AI-Powered Prompt Enhancement** – Transform simple text descriptions into detailed, expressive image-generation prompts.
* **Reference Image Analysis** – Upload reference images to analyze their visual styles, composition, lighting, colors, and artistic elements.
* **Multiple AI Providers** – Choose between Google Gemini, Groq, and Cloudflare Workers AI for prompt enhancement and analysis.
* **AI Image Generation** – Generate images using supported models:

  * SDXL Lightning
  * FLUX
  * FLUX.2 Klein
  * Nano Banana
* **Image Comparison** – Compare images generated from original and enhanced prompts.
* **Interactive Interface** – Responsive, modern dark-themed interface designed for an intuitive user experience.

---

## 🛠️ Tech Stack

| Category         | Technologies                                    |
| ---------------- | ----------------------------------------------- |
| Frontend         | React, Vite, Tailwind CSS                       |
| Backend          | Python, FastAPI, Uvicorn                        |
| AI Providers     | Google Gemini, Groq, Cloudflare Workers AI      |
| Image Generation | SDXL Lightning, FLUX, FLUX.2 Klein, Nano Banana |
| Version Control  | Git, GitHub                                     |

---

## 📂 Project Structure

```text
PromptForge/
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .gitignore
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   └── .gitignore
│
├── .env.example
├── .gitignore
└── README.md
```

---

## 📋 Requirements

Make sure you have the following installed:

* Python 3.10 or higher
* Node.js 18 or higher
* npm
* Git

### API Credentials

Configure the API credentials required by the providers you intend to use:

| Provider              | Required Credentials     |
| --------------------- | ------------------------ |
| Google Gemini         | Gemini API Key           |
| Groq                  | Groq API Key             |
| Cloudflare Workers AI | Account ID and API Token |

---

## ⚙️ Installation & Setup

Follow these steps to run PromptForge locally.

### 1. Clone the Repository

```bash
git clone https://github.com/Awakenlegend/PromptForge.git

cd PromptForge
```

### 2. Backend Setup

Create and activate a Python virtual environment.

**Windows:**

```bash
python -m venv .venv

.venv\Scripts\activate
```

**macOS / Linux:**

```bash
python3 -m venv .venv

source .venv/bin/activate
```

Install the dependencies:

```bash
pip install -r backend/requirements.txt
```

Start the FastAPI backend:

```bash
uvicorn backend.main:app --reload --port 8000
```

Backend URL:

```text
http://localhost:8000
```

Interactive API documentation:

```text
http://localhost:8000/docs
```

### 3. Frontend Setup

Open another terminal and navigate to the frontend directory.

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

---

## 🔑 Environment Configuration

Create a `.env` file in the project root directory.

Add your API credentials:

```env
GOOGLE_API_KEY=your_google_api_key

CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token

GROQ_API_KEY=your_groq_api_key

GEMINI_MODEL=your_supported_gemini_model

FRONTEND_ORIGINS=http://localhost:5173

PORT=8000
```

Replace the placeholder values with your actual credentials.

**Security Guidelines:**

* Never commit `.env` files to GitHub.
* Never expose API keys in frontend code.
* Keep all provider credentials on the backend.
* Use `.env.example` to document the required environment variables without including actual credentials.

---

## 🔌 API Endpoints

PromptForge uses a FastAPI backend to handle prompt enhancement, image analysis, image generation, and comparison.

| Method | Endpoint           | Description                                  |
| ------ | ------------------ | -------------------------------------------- |
| GET    | `/health`          | Check API health status                      |
| GET    | `/enhance-models`  | List available prompt-enhancement providers  |
| GET    | `/analysis-models` | List available image-analysis providers      |
| POST   | `/enhance`         | Enhance a text prompt                        |
| POST   | `/upload`          | Upload and analyze a reference image         |
| POST   | `/generate-image`  | Generate an AI image                         |
| POST   | `/compare-images`  | Compare original and enhanced prompt results |

---

## 💡 Example: Prompt Enhancement

Example request using cURL:

```bash
curl -X POST http://localhost:8000/enhance \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a futuristic city at night",
    "model": "Flux",
    "enhance_provider": "groq-qwen"
  }'
```

The backend processes the original prompt using the selected AI provider and returns an enhanced prompt.

---

## 🖼️ Image Upload Requirements

| Requirement       | Specification       |
| ----------------- | ------------------- |
| Request Type      | multipart/form-data |
| Accepted Files    | Image files only    |
| Maximum File Size | 10 MB               |

---

## 📸 Screenshots

Screenshots of the PromptForge interface will be available here.

### Main Workspace

<!-- Replace with your actual screenshot -->

<!-- ![PromptForge Main Workspace](docs/screenshots/main-workspace.png) -->

---

## 🚀 Future Improvements

Potential improvements for future releases:

* User authentication and personalized workspaces.
* Prompt history and saved generations.
* Additional image-generation models.
* Advanced prompt optimization techniques.
* Cloud-based image storage.
* Download and export enhanced prompts.

---

## 🤝 Contributing

Contributions, suggestions, and feature requests are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Push your branch.
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License.

Copyright (c) 2026 Mohammed Farhan.

See the [LICENSE](LICENSE) file for details.

---

## 👨‍💻 Author

**Mohammed Farhan**

B.Tech Computer Science Engineering (AI & ML)

* GitHub: [@Awakenlegend](https://github.com/Awakenlegend)
* LinkedIn: [Mohammed Farhan](https://www.linkedin.com/in/awaken-legend/)

---

<p align="center">
  Built with ❤️ and AI.
  <br>
  <strong>PromptForge — From Ideas to Images.</strong>
</p>
