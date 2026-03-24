# 🏒 Hockey Coach Tool

A free, self-hosted Streamlit app for house-league coaches to draw drills,
build a drill library, and plan timed practices — no subscription required.

---

## Features

| Page | What you can do |
|---|---|
| 🎨 Draw a Drill | Draw on an interactive rink canvas; save with name, category & notes |
| 📚 Drill Library | Browse, search, edit, and delete saved drills |
| 📋 Practice Planner | Assemble drills into a timed schedule; export a printable HTML file with rink diagrams |

---

## Python version note

**Python 3.11 or 3.12 is recommended.** Python 3.13 should work, but some
dependencies are newer and less battle-tested on it. If you hit problems,
install 3.11 via Homebrew (see below) and use that instead.

---

## Installation (Homebrew / macOS)

### Step 1 — Check what Python you have

```bash
python3 --version
```

If it shows 3.11 or 3.12, you're in good shape. If it shows 3.13 and you'd
prefer to play it safe, install 3.11:

```bash
brew install python@3.11
```

### Step 2 — Create a virtual environment

A virtual environment keeps these packages separate from your system Python.
Run this once, inside the `hockey_tool/` folder:

```bash
# Using the default Homebrew python3:
python3 -m venv .venv

# Or, if you installed python@3.11 above:
python3.11 -m venv .venv
```

### Step 3 — Activate the environment

```bash
source .venv/bin/activate
```

Your prompt will change to show `(.venv)`. You'll need to repeat this step
each time you open a new terminal before running the app.

### Step 4 — Install dependencies

```bash
pip install -r requirements.txt
```

---

## Running the app

Make sure the virtual environment is active (you should see `(.venv)` in your
prompt), then:

```bash
streamlit run app.py
```

Your browser will open automatically at `http://localhost:8501`.
To stop the app, press `Ctrl-C` in the terminal.

---

## Sharing between coaches

All data is stored in two plain JSON files:

- `drills.json` — your drill library
- `practices.json` — saved practice plans

**Option A – Shared folder (easiest)**
Put the entire `hockey_tool/` folder inside a shared Dropbox, OneDrive, or
Google Drive folder. Each coach installs Streamlit once, then runs
`streamlit run app.py` from that shared folder. Drills saved by one coach
appear for everyone (after a moment for sync).

**Option B – Export / import**
Each coach runs a local copy. Share specific practice plans by sending
the exported `.html` file by email. For drill sharing, you can copy-paste
entries between `drills.json` files — it is standard JSON.

---

## Drawing tips

| Color convention | Meaning |
|---|---|
| 🔴 Red | Player skating path |
| 🔵 Blue | Pass or puck movement |
| 🟤 Brown | Shot on net |
| ⚫ Black | Cones, zones, or positioning |

Use **Freehand** for curved paths, **Line** for straight passes and shots,
and **Circle / Rectangle** to mark zones or cone setups.

---

## Modifying the code

`app.py` is a single well-commented file. Common customisations:

- **Add categories** — edit the `CATEGORIES` list near the top
- **Change rink dimensions** — adjust `RINK_W` and `RINK_H`
- **Change where data is saved** — edit `DRILLS_FILE` and `PRACTICES_FILE`
  (e.g. point them at a network path)
- **Change rink markings** — the `make_rink()` function uses Pillow drawing
  commands and is easy to adjust
