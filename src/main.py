from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import json
import os
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolves to HockeyDrills/drills/ regardless of where you run uvicorn from
DRILLS_DIR = os.path.join(os.path.dirname(__file__), '..', 'drills')
os.makedirs(DRILLS_DIR, exist_ok=True)


def title_to_filename(title: str) -> str:
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-') or 'untitled-drill'
    return slug + '.json'


@app.post("/save-drill")
async def save_drill(request: Request):
    """Accept the full scene JSON from io.js and write it to drills/."""
    scene = await request.json()
    title = scene.get('metadata', {}).get('title', 'Untitled Drill')
    filename = title_to_filename(title)
    file_path = os.path.join(DRILLS_DIR, filename)

    with open(file_path, 'w') as f:
        json.dump(scene, f, indent=2)

    return {"message": f"Saved as {filename}", "filename": filename}


@app.get("/list-drills")
async def list_drills():
    """Return metadata for every .json file in drills/."""
    entries = []
    for name in os.listdir(DRILLS_DIR):
        if not name.endswith('.json'):
            continue
        file_path = os.path.join(DRILLS_DIR, name)
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            meta = data.get('metadata', {})
            entries.append({
                "filename": name,
                "title":    meta.get('title',   name),
                "tags":     meta.get('tags',     []),
                "savedAt":  meta.get('savedAt',  None),
            })
        except Exception:
            pass  # skip corrupt files
    # Newest first
    entries.sort(key=lambda e: e['savedAt'] or '', reverse=True)
    return {"drills": entries}


@app.get("/get-drill/{filename}")
async def get_drill(filename: str):
    file_path = os.path.join(DRILLS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Drill not found")
    with open(file_path, 'r') as f:
        return json.load(f)


@app.delete("/delete-drill/{filename}")
async def delete_drill(filename: str):
    file_path = os.path.join(DRILLS_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Drill not found")
    os.remove(file_path)
    return {"message": f"Deleted {filename}"}


@app.get("/")
def read_root():
    return {"status": "online", "message": "Hockey Drill API is active"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="127.0.0.1", port=port)
