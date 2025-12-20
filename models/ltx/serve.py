"""
LTX Video Generation Serving API
Supports custom GCS destination paths or default bucket
"""

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field, validator
import os
import torch
import logging
from typing import Optional
from diffusers import DiffusionPipeline
from google.cloud import storage
import uuid
from datetime import datetime
import re
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LTX Video Generation API",
    description="Text-to-video generation using LTX-Video from Hugging Face",
    version="1.0.0"
)

# Global state
pipe = None
storage_client = None
DEFAULT_BUCKET = os.environ.get("DEFAULT_OUTPUT_BUCKET")
PROJECT_ID = os.environ.get("PROJECT_ID")
HF_MODEL_ID = os.environ.get("HF_MODEL_ID", "Lightricks/LTX-Video")
ENABLE_XFORMERS = os.environ.get("ENABLE_XFORMERS", "true").lower() == "true"


class InferenceRequest(BaseModel):
    """Request model for video generation"""
    prompt: str = Field(..., description="Text prompt for video generation", min_length=1)
    negative_prompt: Optional[str] = Field("", description="Negative prompt for video generation")
    seed: int = Field(42, description="Random seed for reproducibility", ge=0)
    height: int = Field(704, description="Video height in pixels", ge=256, le=1024)
    width: int = Field(1216, description="Video width in pixels", ge=256, le=1920)
    num_frames: int = Field(121, description="Number of frames to generate", ge=1, le=240)
    num_inference_steps: int = Field(50, description="Number of denoising steps", ge=1, le=100)
    guidance_scale: float = Field(7.5, description="Guidance scale for generation", ge=1.0, le=20.0)
    gcs_destination: Optional[str] = Field(
        None, 
        description="Custom GCS path (e.g., 'gs://bucket/path/video.mp4'). If not provided, uses default bucket"
    )
    
    @validator('gcs_destination')
    def validate_gcs_path(cls, v):
        if v is not None:
            if not v.startswith('gs://'):
                raise ValueError("GCS destination must start with 'gs://'")
            if not v.endswith('.mp4'):
                raise ValueError("GCS destination must end with '.mp4'")
            # Check for valid GCS path format
            pattern = r'^gs://[a-z0-9][a-z0-9_-]*[a-z0-9](/[^\s]*)?\.mp4$'
            if not re.match(pattern, v):
                raise ValueError("Invalid GCS path format")
        return v


class InferenceResponse(BaseModel):
    """Response model for video generation"""
    video_url: str
    video_path: str
    seed: int
    gcs_bucket: str
    gcs_blob: str
    generation_time_seconds: float
    metadata: dict


def parse_gcs_path(gcs_path: str) -> tuple[str, str]:
    """Parse GCS path into bucket and blob path"""
    path = gcs_path.replace("gs://", "")
    parts = path.split("/", 1)
    bucket_name = parts[0]
    blob_path = parts[1] if len(parts) > 1 else ""
    return bucket_name, blob_path


@app.on_event("startup")
async def startup_event():
    """Load the model on startup"""
    global pipe, storage_client
    
    logger.info("=" * 60)
    logger.info("Starting LTX Video Generation Service")
    logger.info(f"Model: {HF_MODEL_ID}")
    logger.info(f"Project ID: {PROJECT_ID}")
    logger.info(f"Default Bucket: {DEFAULT_BUCKET}")
    logger.info("=" * 60)
    
    try:
        # Initialize GCS client
        logger.info("Initializing Google Cloud Storage client...")
        storage_client = storage.Client(project=PROJECT_ID)
        
        # Verify default bucket exists
        if DEFAULT_BUCKET:
            try:
                bucket = storage_client.bucket(DEFAULT_BUCKET)
                bucket.exists()
                logger.info(f"✓ Default bucket verified: {DEFAULT_BUCKET}")
            except Exception as e:
                logger.warning(f"Default bucket check failed: {e}")
        
        # Load the model
        logger.info(f"Loading LTX Video model from Hugging Face: {HF_MODEL_ID}")
        logger.info("This may take several minutes on first run...")
        
        pipe = DiffusionPipeline.from_pretrained(
            HF_MODEL_ID,
            torch_dtype=torch.float16,
            use_safetensors=True,
            low_cpu_mem_usage=True
        )
        
        # Move to GPU if available
        if torch.cuda.is_available():
            pipe = pipe.to("cuda")
            gpu_name = torch.cuda.get_device_name(0)
            gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1e9
            logger.info(f"✓ Model loaded on GPU: {gpu_name}")
            logger.info(f"✓ GPU Memory: {gpu_memory:.2f} GB")
        else:
            logger.warning("⚠ GPU not available, using CPU (this will be very slow)")
        
        # Enable memory optimizations
        logger.info("Enabling memory optimizations...")
        pipe.enable_attention_slicing()
        
        if ENABLE_XFORMERS and hasattr(pipe, 'enable_xformers_memory_efficient_attention'):
            try:
                pipe.enable_xformers_memory_efficient_attention()
                logger.info("✓ xFormers memory efficient attention enabled")
            except Exception as e:
                logger.warning(f"Could not enable xFormers: {e}")
        
        # Enable model CPU offload if needed
        if hasattr(pipe, 'enable_model_cpu_offload'):
            # pipe.enable_model_cpu_offload()
            logger.info("Model CPU offload available but not enabled")
        
        logger.info("=" * 60)
        logger.info("✓ Service ready to accept requests")
        logger.info("=" * 60)
        
    except Exception as e:
        logger.error(f"Failed to initialize service: {e}")
        logger.error(traceback.format_exc())
        raise


@app.post("/predict", response_model=InferenceResponse)
async def predict(request: InferenceRequest):
    """Generate video from text prompt"""
    global pipe, storage_client
    
    if pipe is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet. Please wait.")
    
    start_time = datetime.now()
    
    try:
        logger.info("=" * 60)
        logger.info(f"New prediction request")
        logger.info(f"Prompt: {request.prompt}")
        logger.info(f"Frames: {request.num_frames}, Size: {request.width}x{request.height}")
        logger.info(f"Custom GCS: {request.gcs_destination or 'No (using default)'}")
        
        # Set random seed for reproducibility
        generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu")
        generator.manual_seed(request.seed)
        
        # Generate video
        logger.info("Starting video generation...")
        output = pipe(
            prompt=request.prompt,
            negative_prompt=request.negative_prompt,
            height=request.height,
            width=request.width,
            num_frames=request.num_frames,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            generator=generator,
        )
        
        logger.info("✓ Video generation complete")
        
        # Generate filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_id = str(uuid.uuid4())[:8]
        filename = f"ltx_video_{timestamp}_{video_id}.mp4"
        local_path = f"/tmp/{filename}"
        
        # Save video locally first
        logger.info(f"Saving video to: {local_path}")
        frames = output.frames[0]  # Get the first video
        
        # Save using imageio
        import imageio
        writer = imageio.get_writer(local_path, fps=24, codec='libx264', quality=8)
        for frame in frames:
            writer.append_data(frame)
        writer.close()
        
        logger.info(f"✓ Video saved locally ({os.path.getsize(local_path) / 1e6:.2f} MB)")
        
        # Determine GCS destination
        if request.gcs_destination:
            # Use custom destination
            bucket_name, blob_path = parse_gcs_path(request.gcs_destination)
            logger.info(f"Using custom GCS destination: gs://{bucket_name}/{blob_path}")
        else:
            # Use default bucket
            bucket_name = DEFAULT_BUCKET
            blob_path = f"videos/{filename}"
            logger.info(f"Using default GCS destination: gs://{bucket_name}/{blob_path}")
        
        # Upload to GCS
        try:
            bucket = storage_client.bucket(bucket_name)
            blob = bucket.blob(blob_path)
            
            logger.info("Uploading to GCS...")
            blob.upload_from_filename(
                local_path,
                content_type='video/mp4',
                timeout=300
            )
            
            # Make publicly accessible (optional - comment out for private videos)
            blob.make_public()
            video_url = blob.public_url
            
            logger.info(f"✓ Video uploaded to GCS: {video_url}")
            
            # Clean up local file
            os.remove(local_path)
            logger.info("✓ Local file cleaned up")
            
        except Exception as e:
            logger.error(f"Failed to upload to GCS: {e}")
            logger.error(traceback.format_exc())
            # If upload fails, return local path as fallback
            video_url = local_path
            blob_path = local_path
        
        # Calculate generation time
        end_time = datetime.now()
        generation_time = (end_time - start_time).total_seconds()
        
        logger.info(f"✓ Total generation time: {generation_time:.2f} seconds")
        logger.info("=" * 60)
        
        return InferenceResponse(
            video_url=video_url,
            video_path=filename,
            seed=request.seed,
            gcs_bucket=bucket_name,
            gcs_blob=blob_path,
            generation_time_seconds=generation_time,
            metadata={
                "prompt": request.prompt,
                "num_frames": request.num_frames,
                "resolution": f"{request.width}x{request.height}",
                "inference_steps": request.num_inference_steps,
                "guidance_scale": request.guidance_scale,
                "model": HF_MODEL_ID
            }
        )
        
    except Exception as e:
        logger.error(f"Prediction failed: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint for Vertex AI"""
    gpu_info = None
    if torch.cuda.is_available():
        gpu_info = {
            "name": torch.cuda.get_device_name(0),
            "memory_allocated_gb": torch.cuda.memory_allocated(0) / 1e9,
            "memory_reserved_gb": torch.cuda.memory_reserved(0) / 1e9,
            "memory_total_gb": torch.cuda.get_device_properties(0).total_memory / 1e9
        }
    
    return {
        "status": "healthy",
        "model_loaded": pipe is not None,
        "model_id": HF_MODEL_ID,
        "gpu_available": torch.cuda.is_available(),
        "gpu_info": gpu_info,
        "default_bucket": DEFAULT_BUCKET,
        "storage_client_initialized": storage_client is not None
    }


@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "service": "LTX Video Generation API",
        "version": "1.0.0",
        "model": HF_MODEL_ID,
        "endpoints": {
            "predict": "/predict",
            "health": "/health",
            "docs": "/docs"
        },
        "features": {
            "custom_gcs_destination": True,
            "default_bucket": DEFAULT_BUCKET,
            "gpu_acceleration": torch.cuda.is_available()
        }
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    logger.error(traceback.format_exc())
    return HTTPException(
        status_code=500,
        detail=f"Internal server error: {str(exc)}"
    )