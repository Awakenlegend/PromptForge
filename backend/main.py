import asyncio
import base64
import json
import os
import random
import traceback
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field


# ============================================================
# CONFIGURATION
# ============================================================

ROOT_DIR = Path(__file__).resolve().parent.parent
# override=True ensures .env values always take precedence over any
# identically-named variables already present in the system environment.
load_dotenv(ROOT_DIR / ".env", override=True)

# Support both GOOGLE_API_KEY (legacy) and GEMINI_API_KEY (new standard).
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

CLOUDFLARE_API_BASE = (
    "https://api.cloudflare.com/client/v4/accounts/"
    f"{CLOUDFLARE_ACCOUNT_ID}/ai/run"
)

# Cloudflare Workers AI model identifiers.
# SDXL Lightning supports negative_prompt and seed.
# FLUX schnell supports prompt and steps; it does not expose
# the same negative-prompt controls as SDXL Lightning.
GENERATION_MODELS = {
    "sdxl-lightning": "@cf/bytedance/stable-diffusion-xl-lightning",
    "flux": "@cf/black-forest-labs/flux-1-schnell",
    "flux-2-klein-4b": "@cf/black-forest-labs/flux-2-klein-4b",
    "nano-banana": "google/nano-banana",
}

# Text-enhancement provider registry (no Moondream — vision-only model).
ENHANCE_MODELS: dict[str, dict] = {
    "groq-qwen": {
        "provider": "Groq",
        "model_name": "Qwen 3.8 27B",
        "model_id": "qwen/qwen3.8-27b",
    },
    "gemini": {
        "provider": "Google Gemini",
        "model_name": GEMINI_MODEL,
        "model_id": GEMINI_MODEL,
    },
    "cf-llama-4-scout": {
        "provider": "Cloudflare Workers AI",
        "model_name": "Llama 4 Scout 17B",
        "model_id": "@cf/meta/llama-4-scout-17b-16e-instruct",
    },
    "cf-mistral-small": {
        "provider": "Cloudflare Workers AI",
        "model_name": "Mistral Small 3.1 24B",
        "model_id": "@cf/mistralai/mistral-small-3.1-24b-instruct",
    },
}

# Image-analysis provider registry.
# Each entry maps a user-facing key to provider metadata.
# The "gemini" entry is populated after GEMINI_MODEL is resolved above.
ANALYSIS_MODELS: dict[str, dict] = {
    "groq-qwen": {
        "provider": "Groq",
        "model_name": "Qwen 3.8 27B",
        "model_id": "qwen/qwen3.8-27b",
    },
    "gemini": {
        "provider": "Google Gemini",
        "model_name": GEMINI_MODEL,
        "model_id": GEMINI_MODEL,
    },
    "cf-llama-4-scout": {
        "provider": "Cloudflare Workers AI",
        "model_name": "Llama 4 Scout 17B",
        "model_id": "@cf/meta/llama-4-scout-17b-16e-instruct",
    },
    "cf-mistral-small": {
        "provider": "Cloudflare Workers AI",
        "model_name": "Mistral Small 3.1 24B",
        "model_id": "@cf/mistralai/mistral-small-3.1-24b-instruct",
    },
    "cf-moondream": {
        "provider": "Cloudflare Workers AI",
        "model_name": "Moondream 3.1",
        "model_id": "@cf/moondream/moondream3.1-9B-A2B",
    },
}

if not GOOGLE_API_KEY:
    raise RuntimeError(
        "Neither GOOGLE_API_KEY nor GEMINI_API_KEY is set in the root .env file."
    )

if not CLOUDFLARE_ACCOUNT_ID:
    raise RuntimeError("CLOUDFLARE_ACCOUNT_ID is missing from the root .env file.")

if not CLOUDFLARE_API_TOKEN:
    raise RuntimeError("CLOUDFLARE_API_TOKEN is missing from the root .env file.")

gemini_client = genai.Client(api_key=GOOGLE_API_KEY)


# ============================================================
# FASTAPI APPLICATION
# ============================================================

app = FastAPI(
    title="PromptForge API",
    description="AI prompt optimization and image generation using Gemini and Cloudflare Workers AI.",
    version="4.0.0",
)


# ============================================================
# CORS
# ============================================================

# If FRONTEND_ORIGINS is set in the environment, restrict to those exact
# origins (comma-separated).  Otherwise allow any origin so the dev server
# works regardless of which port Vite picks (5173, 5174, …).
#
# Note: allow_credentials must be False when allow_origins=["*"].
# This app never sends browser cookies or Authorization headers from the
# client — all secrets live server-side — so credentials mode is not needed.

_configured_origins = os.getenv("FRONTEND_ORIGINS", "")

if _configured_origins.strip():
    origins = [
        o.strip() for o in _configured_origins.split(",") if o.strip()
    ]
    _allow_credentials = True
else:
    origins = ["*"]
    _allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PROMPT-ENHANCEMENT MODEL SETTINGS
# ============================================================

ALLOWED_TARGET_MODELS = {
    "SD 1.5",
    "SDXL",
    "SD 3",
    "Flux",
    "Midjourney",
    "Nano Banana",
}

PROMPT_STYLE_BLOCK = """
SD 1.5:
Use concise, tag-style, comma-separated descriptive prompts.

SDXL:
Use clear natural language and descriptive visual details.
A separate negative prompt may be supported.

Stable Diffusion 3:
Use natural sentences and descriptive language.

Flux:
Use coherent natural-language descriptions, specific visual
details, composition, lighting, and atmosphere.

Midjourney:
Use natural language and relevant parameters only when requested.

Nano Banana:
Use clear natural language describing subject, scene, composition,
lighting, style, and important details.
"""

MODEL_INSTRUCTIONS = """
Transform the user's rough image prompt into a clear, detailed
prompt suitable for the selected target image model.

1. Preserve the user's original subject, action, and intent.
2. Describe the subject specifically.
3. Include a suitable medium and artistic style when relevant.
4. Describe composition, framing, and camera perspective.
5. Include relevant colors, lighting, atmosphere, and textures.
6. Do not add unrelated objects, people, or events.
7. Avoid making the prompt unnecessarily long.
8. Adapt the writing style to the selected target model.
9. Return ONLY a valid JSON object with:
   "positive_prompt" and "negative_prompt".
10. Return an empty negative_prompt if it is not appropriate.
"""

EXAMPLES = """
Example:
{
  "positive_prompt": "A cinematic photograph of a lone warrior
  standing in a misty ancient forest, detailed weathered armor,
  tall trees fading into the background, soft rays of golden
  morning light, atmospheric depth, natural earthy colors.",
  "negative_prompt": "blurry, low quality, distorted anatomy,
  duplicate subjects, unwanted text, watermark"
}
"""

TEXT_SYSTEM_PROMPT = f"""
You are an expert image prompt engineer.
Improve the user's prompt while preserving the original intent.

{PROMPT_STYLE_BLOCK}

{MODEL_INSTRUCTIONS}

{EXAMPLES}
"""

IMAGE_SYSTEM_PROMPT = f"""
You are an expert visual analyst and image prompt engineer.

Analyze the uploaded image's visible artistic style, medium,
composition, camera perspective, color palette, lighting,
textures, and atmosphere.

Focus on the visual style rather than reproducing the specific
subject matter. Create a prompt that applies a similar visual
style to a different subject. Do not claim exact reproduction.

{PROMPT_STYLE_BLOCK}

{MODEL_INSTRUCTIONS}

{EXAMPLES}
"""


# ============================================================
# REQUEST SCHEMAS
# ============================================================

class PromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
    model: str = Field(..., min_length=1)
    enhance_provider: str = Field(default="groq-qwen")


class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    model: Literal[
        "sdxl-lightning",
        "flux",
        "flux-2-klein-4b",
        "nano-banana",
    ] = "sdxl-lightning"
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    seed: int | None = None
    negative_prompt: str = Field(default="", max_length=1000)
    num_steps: int = Field(default=4, ge=1, le=20)
    guidance: float = Field(default=7.5, ge=0, le=20)


class CompareImagesRequest(BaseModel):
    original_prompt: str = Field(..., min_length=1, max_length=2000)
    enhanced_prompt: str = Field(..., min_length=1, max_length=2000)
    model: Literal[
        "sdxl-lightning",
        "flux",
        "flux-2-klein-4b",
        "nano-banana",
    ] = "sdxl-lightning"
    width: int = Field(default=1024, ge=256, le=2048)
    height: int = Field(default=1024, ge=256, le=2048)
    seed: int | None = 42
    negative_prompt: str = Field(default="", max_length=1000)
    num_steps: int = Field(default=4, ge=1, le=20)
    guidance: float = Field(default=7.5, ge=0, le=20)


# ============================================================
# VALIDATION AND GEMINI HELPERS
# ============================================================

def validate_target_model(model: str) -> None:
    if model not in ALLOWED_TARGET_MODELS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported prompt target model. Allowed: "
            + ", ".join(sorted(ALLOWED_TARGET_MODELS)),
        )


def parse_gemini_response(raw: str) -> dict:
    if not raw:
        raise ValueError("Gemini returned an empty response.")

    raw = raw.strip()

    if raw.startswith("```"):
        lines = raw.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        raw = "\n".join(lines).strip()

    result = json.loads(raw)

    if not isinstance(result, dict):
        raise ValueError("Gemini did not return a JSON object.")

    positive = result.get("positive_prompt")
    negative = result.get("negative_prompt", "")

    if not isinstance(positive, str) or not positive.strip():
        raise ValueError("Missing or invalid positive_prompt.")

    if not isinstance(negative, str):
        raise ValueError("Missing or invalid negative_prompt.")

    return {
        "positive_prompt": positive.strip(),
        "negative_prompt": negative.strip(),
    }


async def generate_gemini_prompt(system_instruction: str, contents) -> dict:
    # Retry temporary overload/rate-limit errors.
    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                gemini_client.models.generate_content,
                model=GEMINI_MODEL,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                ),
                contents=contents,
            )

            if not response.text:
                raise ValueError("Gemini returned an empty response.")

            return parse_gemini_response(response.text)

        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid Gemini response: {exc}",
            ) from exc

        except Exception as exc:
            message = str(exc)
            temporary = any(
                marker in message.upper()
                for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED")
            )

            print(
                f"Gemini attempt {attempt + 1}/3 failed: "
                f"{type(exc).__name__}: {message}"
            )

            if temporary and attempt < 2:
                await asyncio.sleep((2 ** attempt) + random.uniform(0, 0.5))
                continue

            if temporary:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Gemini is currently experiencing high demand. "
                        "Please wait 30 seconds, then try enhancing your prompt again."
                    ),
                ) from exc

            raise HTTPException(
                status_code=502,
                detail="Gemini prompt generation failed. Check server logs and model availability.",
            ) from exc


# ============================================================
# CLOUDFLARE WORKERS AI IMAGE GENERATION
# ============================================================

async def generate_cloudflare_image(
    prompt: str,
    model: str,
    width: int,
    height: int,
    seed: int | None,
    negative_prompt: str,
    num_steps: int,
    guidance: float,
) -> dict:
    if model not in GENERATION_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported image model. Choose sdxl-lightning, flux, "
                "flux-2-klein-4b, or nano-banana."
            ),
        )

    model_id = GENERATION_MODELS[model]
    headers = {"Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"}
    url = f"{CLOUDFLARE_API_BASE}/{model_id}"

    try:
        async with httpx.AsyncClient(timeout=240.0, follow_redirects=True) as client:
            if model == "flux-2-klein-4b":
                # FLUX.2 Klein requires multipart/form-data and fixed 4-step inference.
                multipart_fields = {
                    "prompt": (None, prompt),
                    "width": (None, str(width)),
                    "height": (None, str(height)),
                    "guidance": (None, str(guidance)),
                }
                if seed is not None:
                    multipart_fields["seed"] = (None, str(seed))

                response = await client.post(
                    url,
                    headers=headers,
                    files=multipart_fields,
                )

            elif model == "nano-banana":
                # Nano Banana uses Cloudflare's unified /ai/run request format.
                nano_url = (
                    "https://api.cloudflare.com/client/v4/accounts/"
                    f"{CLOUDFLARE_ACCOUNT_ID}/ai/run"
                )
                response = await client.post(
                    nano_url,
                    headers={**headers, "Content-Type": "application/json"},
                    json={
                        "model": model_id,
                        "input": {
                            "prompt": prompt,
                            "aspect_ratio": "1:1" if width == height else "16:9",
                            "image_size": "1K",
                            "output_format": "png",
                        },
                    },
                )

            elif model == "sdxl-lightning":
                payload = {
                    "prompt": prompt,
                    "negative_prompt": negative_prompt,
                    "width": width,
                    "height": height,
                    "num_steps": min(num_steps, 20),
                    "guidance": guidance,
                }
                if seed is not None:
                    payload["seed"] = seed
                response = await client.post(
                    url,
                    headers={**headers, "Content-Type": "application/json"},
                    json=payload,
                )

            else:
                # Existing FLUX.1 Schnell request.
                response = await client.post(
                    url,
                    headers={**headers, "Content-Type": "application/json"},
                    json={"prompt": prompt, "steps": min(num_steps, 8)},
                )

            if response.status_code >= 400:
                print(
                    "Cloudflare image API error:",
                    response.status_code,
                    response.text[:2000],
                )
                raise HTTPException(
                    status_code=502,
                    detail=(
                        f"Cloudflare image generation failed (HTTP {response.status_code}). "
                        "Check model access, account limits, token permissions, and parameters."
                    ),
                )

            content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
            image_data = None
            mime_type = content_type if content_type.startswith("image/") else "image/png"

            # Workers AI image models can return raw image bytes rather than JSON.
            raw = response.content
            is_image_bytes = (
                content_type.startswith("image/")
                or raw.startswith(b"\\x89PNG\\r\\n\\x1a\\n")
                or raw.startswith(b"\\xff\\xd8\\xff")
                or (raw.startswith(b"RIFF") and raw[8:12] == b"WEBP")
            )

            if is_image_bytes:
                image_data = raw
                if raw.startswith(b"\\xff\\xd8\\xff"):
                    mime_type = "image/jpeg"
                elif raw.startswith(b"RIFF") and raw[8:12] == b"WEBP":
                    mime_type = "image/webp"
                elif raw.startswith(b"\\x89PNG\\r\\n\\x1a\\n"):
                    mime_type = "image/png"
            else:
                body = response.json()
                result = body.get("result", body) if isinstance(body, dict) else {}

                if model == "nano-banana":
                    image_url = result.get("image") if isinstance(result, dict) else None
                    if not image_url:
                        raise ValueError(
                            f"Nano Banana response did not contain result.image: {str(body)[:1000]}"
                        )

                    # Accept only HTTPS URLs on Cloudflare's documented image hosts.
                    from urllib.parse import urlparse

                    parsed = urlparse(image_url)
                    host = parsed.hostname or ""
                    trusted_host = (
                        parsed.scheme == "https"
                        and (
                            host == "r2.dev"
                            or host.endswith(".r2.dev")
                            or host == "aig.cloudflare.com"
                            or host.endswith(".aig.cloudflare.com")
                        )
                    )
                    if not trusted_host:
                        raise ValueError("Nano Banana returned an unexpected image URL host.")

                    image_response = await client.get(image_url)
                    image_response.raise_for_status()
                    image_data = image_response.content
                    mime_type = image_response.headers.get(
                        "content-type", "image/png"
                    ).split(";", 1)[0].strip().lower()
                    if not mime_type.startswith("image/"):
                        mime_type = "image/png"
                else:
                    image_b64 = result.get("image") if isinstance(result, dict) else None
                    if not image_b64:
                        raise ValueError(
                            f"Cloudflare response did not contain result.image: {str(body)[:1000]}"
                        )
                    image_data = base64.b64decode(image_b64)

            if not image_data:
                raise ValueError("Cloudflare returned an empty image.")

            data_uri = (
                f"data:{mime_type};base64,"
                + base64.b64encode(image_data).decode("utf-8")
            )

            return {
                "image_data": data_uri,
                "model": model,
                "model_id": model_id,
                "seed": seed if model in ("sdxl-lightning", "flux-2-klein-4b") else None,
            }

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Cloudflare image generation timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Cloudflare image generation error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Could not process the Cloudflare image-generation response.",
        ) from exc


# ============================================================
# IMAGE-ANALYSIS PROVIDER HELPERS
# ============================================================


def _handle_provider_error(
    provider_name: str, status_code: int, body_text: str
) -> None:
    """Convert a failed provider HTTP response into an HTTPException."""
    print(f"{provider_name} API error {status_code}: {body_text[:500]}")
    if status_code in (401, 403):
        raise HTTPException(
            status_code=502,
            detail=(
                f"{provider_name}: Invalid or missing API key. "
                "Check your credentials."
            ),
        )
    if status_code == 429:
        raise HTTPException(
            status_code=429,
            detail=(
                f"{provider_name}: Rate limit exceeded. "
                "Please wait a moment and try again."
            ),
        )
    if status_code == 413:
        raise HTTPException(
            status_code=413,
            detail=f"{provider_name}: Image is too large for this model.",
        )
    if status_code == 400:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{provider_name}: Bad request — "
                "the image format or content may not be supported."
            ),
        )
    raise HTTPException(
        status_code=502,
        detail=(
            f"{provider_name}: Request failed (HTTP {status_code}). "
            "Try again later."
        ),
    )


async def analyze_with_groq(
    image_content: bytes,
    content_type: str,
    target_model: str,
) -> dict:
    """Analyze an image with Groq Qwen 3.8 27B vision."""
    if not GROQ_API_KEY or not GROQ_API_KEY.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "Groq API key is not configured. "
                "Set GROQ_API_KEY=gsk_... in your .env file "
                "and restart the server."
            ),
        )

    image_b64 = base64.b64encode(image_content).decode("utf-8")
    data_uri = f"data:{content_type};base64,{image_b64}"

    payload = {
        "model": "qwen/qwen3.8-27b",
        "messages": [
            {
                "role": "system",
                "content": IMAGE_SYSTEM_PROMPT.strip(),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": data_uri},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Analyze this image's visual style, composition, colors, "
                            "lighting, and artistic technique. Create a prompt that "
                            "applies the same visual style to a different subject. "
                            f"Target model: {target_model}. "
                            "Return ONLY valid JSON with "
                            "positive_prompt and negative_prompt."
                        ),
                    },
                ],
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code >= 400:
            _handle_provider_error(
                "Groq Qwen 3.8 27B",
                response.status_code,
                response.text,
            )

        body = response.json()
        content = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

        if not content or not content.strip():
            raise HTTPException(
                status_code=502,
                detail="Groq Qwen 3.8 27B returned an empty response.",
            )

        try:
            return parse_gemini_response(content)
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid Groq response format: {exc}",
            ) from exc

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Groq request timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Groq analysis error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Groq analysis failed. Check server logs.",
        ) from exc


async def analyze_with_cloudflare_vision(
    model_id: str,
    model_name: str,
    image_content: bytes,
    content_type: str,
    target_model: str,
) -> dict:
    """Analyze an image with a Cloudflare Workers AI multimodal chat model."""
    image_b64 = base64.b64encode(image_content).decode("utf-8")
    data_uri = f"data:{content_type};base64,{image_b64}"

    payload = {
        "messages": [
            {
                "role": "system",
                "content": IMAGE_SYSTEM_PROMPT.strip(),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": data_uri},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Analyze this image's visual style, composition, colors, "
                            "lighting, and artistic technique. Create a prompt that "
                            "applies the same visual style to a different subject. "
                            f"Target model: {target_model}. "
                            "Return ONLY valid JSON with "
                            "positive_prompt and negative_prompt."
                        ),
                    },
                ],
            },
        ],
        "max_tokens": 1024,
        "temperature": 0.3,
        "stream": False,
    }

    url = f"{CLOUDFLARE_API_BASE}/{model_id}"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code >= 400:
            _handle_provider_error(
                f"Cloudflare {model_name}",
                response.status_code,
                response.text,
            )

        body = response.json()
        result = body.get("result", body) if isinstance(body, dict) else {}
        raw = result.get("response", "") if isinstance(result, dict) else ""

        if not raw or not raw.strip():
            raise HTTPException(
                status_code=502,
                detail=f"Cloudflare {model_name} returned an empty response.",
            )

        try:
            return parse_gemini_response(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid {model_name} response format: {exc}",
            ) from exc

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Cloudflare {model_name} request timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Cloudflare {model_name} error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Cloudflare {model_name} analysis failed. Check server logs.",
        ) from exc


async def analyze_with_cloudflare_moondream(
    image_content: bytes,
    content_type: str,
    target_model: str,
) -> dict:
    """Analyze an image with Cloudflare Moondream 3.1 (task-based image-to-text)."""
    image_b64 = base64.b64encode(image_content).decode("utf-8")
    data_uri = f"data:{content_type};base64,{image_b64}"

    question = (
        "Describe the visual style of this image in a way that could serve as a "
        "text-to-image generation prompt. Cover: artistic style and medium "
        "(e.g. oil painting, digital illustration, photography), composition and "
        "framing, color palette, lighting, mood, atmosphere, and visual textures. "
        "Write it as a descriptive phrase or sentence — not a bullet list. "
        f"Target model: {target_model}."
    )

    model_id = "@cf/moondream/moondream3.1-9B-A2B"
    url = f"{CLOUDFLARE_API_BASE}/{model_id}"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    }
    payload = {
        "task": "query",
        "image": data_uri,
        "question": question,
        "max_tokens": 512,
        "reasoning": False,
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code >= 400:
            _handle_provider_error(
                "Cloudflare Moondream 3.1",
                response.status_code,
                response.text,
            )

        body = response.json()
        result = body.get("result", body) if isinstance(body, dict) else {}
        answer = result.get("answer", "") if isinstance(result, dict) else ""

        if not answer or not answer.strip():
            raise HTTPException(
                status_code=502,
                detail=(
                    "Moondream 3.1 returned an empty description. "
                    "Try a different image or model."
                ),
            )

        return {
            "positive_prompt": answer.strip(),
            "negative_prompt": "",
        }

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Cloudflare Moondream 3.1 request timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Cloudflare Moondream error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Cloudflare Moondream 3.1 analysis failed. Check server logs.",
        ) from exc


async def enhance_with_groq(prompt: str, target_model: str) -> dict:
    """Enhance a text prompt using Groq Qwen 3.8 27B."""
    if not GROQ_API_KEY or not GROQ_API_KEY.strip():
        raise HTTPException(
            status_code=503,
            detail=(
                "Groq API key is not configured. "
                "Set GROQ_API_KEY=gsk_... in your .env file "
                "and restart the server."
            ),
        )

    payload = {
        "model": "qwen/qwen3.8-27b",
        "messages": [
            {
                "role": "system",
                "content": TEXT_SYSTEM_PROMPT.strip(),
            },
            {
                "role": "user",
                "content": (
                    f"User's original prompt: {prompt}\n"
                    f"Target image model: {target_model}\n"
                    "Preserve the user's original intent. "
                    "Return ONLY valid JSON with "
                    "positive_prompt and negative_prompt."
                ),
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": 1024,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code >= 400:
            _handle_provider_error(
                "Groq Qwen 3.8 27B",
                response.status_code,
                response.text,
            )

        body = response.json()
        content = (
            body.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )

        if not content or not content.strip():
            raise HTTPException(
                status_code=502,
                detail="Groq Qwen 3.8 27B returned an empty response.",
            )

        try:
            return parse_gemini_response(content)
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid Groq response format: {exc}",
            ) from exc

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail="Groq request timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Groq enhancement error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail="Groq enhancement failed. Check server logs.",
        ) from exc


async def enhance_with_cloudflare_text(
    model_id: str,
    model_name: str,
    prompt: str,
    target_model: str,
) -> dict:
    """Enhance a text prompt using a Cloudflare Workers AI text model."""
    payload = {
        "messages": [
            {
                "role": "system",
                "content": TEXT_SYSTEM_PROMPT.strip(),
            },
            {
                "role": "user",
                "content": (
                    f"User's original prompt: {prompt}\n"
                    f"Target image model: {target_model}\n"
                    "Preserve the user's original intent. "
                    "Return ONLY valid JSON with "
                    "positive_prompt and negative_prompt."
                ),
            },
        ],
        "max_tokens": 1024,
        "temperature": 0.3,
        "stream": False,
    }

    url = f"{CLOUDFLARE_API_BASE}/{model_id}"
    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(url, headers=headers, json=payload)

        if response.status_code >= 400:
            _handle_provider_error(
                f"Cloudflare {model_name}",
                response.status_code,
                response.text,
            )

        body = response.json()
        result = body.get("result", body) if isinstance(body, dict) else {}
        raw = result.get("response", "") if isinstance(result, dict) else ""

        if not raw or not raw.strip():
            raise HTTPException(
                status_code=502,
                detail=f"Cloudflare {model_name} returned an empty response.",
            )

        try:
            return parse_gemini_response(raw)
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Invalid {model_name} response format: {exc}",
            ) from exc

    except HTTPException:
        raise
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Cloudflare {model_name} request timed out. Try again.",
        ) from exc
    except Exception as exc:
        print(f"Cloudflare {model_name} enhancement error: {type(exc).__name__}: {exc}")
        raise HTTPException(
            status_code=502,
            detail=f"Cloudflare {model_name} enhancement failed. Check server logs.",
        ) from exc


async def route_text_enhancement(
    provider_key: str,
    prompt: str,
    target_model: str,
) -> dict:
    """Dispatch a text-enhancement request to the user-selected provider.

    No automatic fallback — if the selected provider fails, the error
    propagates directly to the caller.
    """
    if provider_key == "gemini":
        return await generate_gemini_prompt(
            system_instruction=TEXT_SYSTEM_PROMPT,
            contents=(
                f"User's original prompt: {prompt}\n"
                f"Target image model: {target_model}\n"
                "Preserve the user's original intent."
            ),
        )

    if provider_key == "groq-qwen":
        return await enhance_with_groq(
            prompt=prompt,
            target_model=target_model,
        )

    if provider_key == "cf-llama-4-scout":
        return await enhance_with_cloudflare_text(
            model_id="@cf/meta/llama-4-scout-17b-16e-instruct",
            model_name="Llama 4 Scout 17B",
            prompt=prompt,
            target_model=target_model,
        )

    if provider_key == "cf-mistral-small":
        return await enhance_with_cloudflare_text(
            model_id="@cf/mistralai/mistral-small-3.1-24b-instruct",
            model_name="Mistral Small 3.1 24B",
            prompt=prompt,
            target_model=target_model,
        )

    raise HTTPException(
        status_code=400,
        detail=(
            f"Unknown enhancement provider: '{provider_key}'. "
            "Allowed: " + ", ".join(ENHANCE_MODELS.keys())
        ),
    )


async def route_image_analysis(
    provider_key: str,
    image_content: bytes,
    content_type: str,
    target_model: str,
) -> dict:
    """Dispatch an image-analysis request to the user-selected provider.

    No automatic fallback — if the selected provider fails, the error
    propagates directly to the caller.
    """
    if provider_key == "gemini":
        return await generate_gemini_prompt(
            system_instruction=IMAGE_SYSTEM_PROMPT,
            contents=[
                types.Part.from_bytes(
                    data=image_content,
                    mime_type=content_type,
                ),
                (
                    "Analyze this image's visual style, composition, colors, "
                    "lighting, and artistic technique. Create a prompt that "
                    "applies the same visual style to a different subject. "
                    f"Target model: {target_model}"
                ),
            ],
        )

    if provider_key == "groq-qwen":
        return await analyze_with_groq(
            image_content=image_content,
            content_type=content_type,
            target_model=target_model,
        )

    if provider_key == "cf-llama-4-scout":
        return await analyze_with_cloudflare_vision(
            model_id="@cf/meta/llama-4-scout-17b-16e-instruct",
            model_name="Llama 4 Scout 17B",
            image_content=image_content,
            content_type=content_type,
            target_model=target_model,
        )

    if provider_key == "cf-mistral-small":
        return await analyze_with_cloudflare_vision(
            model_id="@cf/mistralai/mistral-small-3.1-24b-instruct",
            model_name="Mistral Small 3.1 24B",
            image_content=image_content,
            content_type=content_type,
            target_model=target_model,
        )

    if provider_key == "cf-moondream":
        return await analyze_with_cloudflare_moondream(
            image_content=image_content,
            content_type=content_type,
            target_model=target_model,
        )

    raise HTTPException(
        status_code=400,
        detail=(
            f"Unknown analysis provider: '{provider_key}'. "
            "Allowed: " + ", ".join(ANALYSIS_MODELS.keys())
        ),
    )


# ============================================================
# HEALTH CHECKS
# ============================================================

@app.get("/")
async def root():
    return {
        "message": "PromptForge API is running",
        "prompt_enhancement": GEMINI_MODEL,
        "image_generation_provider": "Cloudflare Workers AI",
        "available_generation_models": list(GENERATION_MODELS.keys()),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/analysis-models")
async def get_analysis_models():
    """Return the available image-analysis providers and the default selection."""
    return {
        "models": [
            {
                "key": key,
                "provider": info["provider"],
                "model_name": info["model_name"],
                "model_id": info["model_id"],
            }
            for key, info in ANALYSIS_MODELS.items()
        ],
        "default": "groq-qwen",
    }


@app.get("/enhance-models")
async def get_enhance_models():
    """Return the available text-enhancement providers and the default selection."""
    return {
        "models": [
            {
                "key": key,
                "provider": info["provider"],
                "model_name": info["model_name"],
                "model_id": info["model_id"],
            }
            for key, info in ENHANCE_MODELS.items()
        ],
        "default": "groq-qwen",
    }


# ============================================================
# ENDPOINT 1: ENHANCE TEXT PROMPT
# ============================================================

@app.post("/enhance")
async def enhance_prompt(request: PromptRequest):
    validate_target_model(request.model)

    if request.enhance_provider not in ENHANCE_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown enhancement provider: '{request.enhance_provider}'. "
                "Allowed: " + ", ".join(ENHANCE_MODELS.keys())
            ),
        )

    result = await route_text_enhancement(
        provider_key=request.enhance_provider,
        prompt=request.prompt,
        target_model=request.model,
    )

    provider_info = ENHANCE_MODELS[request.enhance_provider]

    return {
        "original_prompt": request.prompt,
        "model": request.model,
        "positive_prompt": result["positive_prompt"],
        "negative_prompt": result["negative_prompt"],
        "enhance_provider": request.enhance_provider,
        "enhance_provider_name": provider_info["provider"],
        "enhance_model_name": provider_info["model_name"],
    }


# ============================================================
# ENDPOINT 2: ANALYZE UPLOADED IMAGE STYLE
# ============================================================

@app.post("/upload")
async def analyze_uploaded_image(
    file: UploadFile,
    model: str = Form(...),
    analysis_provider: str = Form(default="groq-qwen"),
):
    validate_target_model(model)

    if analysis_provider not in ANALYSIS_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unknown analysis provider: '{analysis_provider}'. "
                "Allowed: " + ", ".join(ANALYSIS_MODELS.keys())
            ),
        )

    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted.")

    try:
        image_content = await file.read(10 * 1024 * 1024 + 1)

        if len(image_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image must be under 10 MB.")

        if not image_content:
            raise HTTPException(status_code=400, detail="Uploaded image is empty.")

        result = await route_image_analysis(
            provider_key=analysis_provider,
            image_content=image_content,
            content_type=content_type,
            target_model=model,
        )

        provider_info = ANALYSIS_MODELS[analysis_provider]

        return {
            "model": model,
            "positive_prompt": result["positive_prompt"],
            "negative_prompt": result["negative_prompt"],
            "analysis_provider": analysis_provider,
            "analysis_provider_name": provider_info["provider"],
            "analysis_model_name": provider_info["model_name"],
        }

    finally:
        await file.close()


# ============================================================
# ENDPOINT 3: GENERATE ONE IMAGE
# ============================================================

@app.post("/generate-image")
async def generate_image(request: ImageGenerationRequest):
    return await generate_cloudflare_image(
        prompt=request.prompt,
        model=request.model,
        width=request.width,
        height=request.height,
        seed=request.seed,
        negative_prompt=request.negative_prompt,
        num_steps=request.num_steps,
        guidance=request.guidance,
    )


# ============================================================
# ENDPOINT 4: ORIGINAL VS ENHANCED COMPARISON
# ============================================================

@app.post("/compare-images")
async def compare_images(request: CompareImagesRequest):
    original_task = generate_cloudflare_image(
        prompt=request.original_prompt,
        model=request.model,
        width=request.width,
        height=request.height,
        seed=request.seed,
        negative_prompt=request.negative_prompt,
        num_steps=request.num_steps,
        guidance=request.guidance,
    )

    enhanced_task = generate_cloudflare_image(
        prompt=request.enhanced_prompt,
        model=request.model,
        width=request.width,
        height=request.height,
        seed=request.seed,
        negative_prompt=request.negative_prompt,
        num_steps=request.num_steps,
        guidance=request.guidance,
    )

    original, enhanced = await asyncio.gather(original_task, enhanced_task)

    return {
        "model": request.model,
        "original": {
            "prompt": request.original_prompt,
            **original,
        },
        "enhanced": {
            "prompt": request.enhanced_prompt,
            **enhanced,
        },
    }


# ============================================================
# RUN LOCALLY
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )