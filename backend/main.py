from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
from typing import List

app = FastAPI()

# Enable CORS so your HTML file can talk to this Python server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

DRILLS_DIR = "drills"
if not os.path.exists(DRILLS_DIR):
    os.makedirs(DRILLS_DIR)

# This matches the "Data Packet" we built in JavaScript
class DrillData(BaseModel):
    name: str
    tags: str
    explanation: str
    rinkMode: str
    canvasState: dict

@app.post("/save-drill")
async def save_drill(drill: DrillData):
    # Sanitize filename
    filename = "".join([c for c in drill.name if c.isalnum() or c in (' ', '_')]).rstrip()
    filename = filename.replace(" ", "_").lower() + ".json"
    
    file_path = os.path.join(DRILLS_DIR, filename)
    
    with open(file_path, "w") as f:
        f.write(drill.model_dump_json(indent=2))
    
    return {"message": f"Drill saved as {filename}"}

@app.get("/list-drills")
async def list_drills():
    files = [f for f in os.listdir(DRILLS_DIR) if f.endswith('.json')]
    return {"drills": files}

@app.get("/get-drill/{filename}")
async def get_drill(filename: str):
    file_path = os.path.join(DRILLS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Drill not found")
    
    with open(file_path, "r") as f:
        return json.load(f)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)