from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize the FastAPI application with metadata
app = FastAPI(title="InsightClips", version="1.0.0")

# Add CORS middleware to allow communication with the Next.js frontend
# Configured for development on localhost ports 3000 and 3001
app.add_middleware(
    CORSMiddleware,
    allow_origins=["localhost:3000", "localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"], # Allows all HTTP methods (GET, POST, etc.)
    allow_headers=["*"], # Allows all headers
)

@app.get("/")
async def root():
    """
    Root endpoint to verify that the backend is reachable.
    """
    return {"message": "InsightClips Backend", "status": "running"}

@app.get("/health")
async def health_check():
    """
    Health check endpoint for monitoring system stability.
    """
    return {"status": "healthy"}