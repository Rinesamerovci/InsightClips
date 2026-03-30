from fastapi import FastAPI

app = FastAPI(title="InsightClips Core API")

@app.get("/")
def read_root():
    return {"message": "Hello World from InsightClips Backend"}