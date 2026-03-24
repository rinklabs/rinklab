"""
Hockey Coach Tool
=================
Run with:  streamlit run app.py

Architecture note
-----------------
Stamps (players, nets, pylons, pucks) are rendered directly onto the PIL
background image rather than injected as Fabric.js objects.  This avoids a
race condition in streamlit-drawable-canvas where re-keying the canvas to
inject initial_drawing causes it to momentarily return an empty object list,
which looked like the user had deleted everything.

The canvas therefore only tracks freehand strokes / shapes.  Stamps are
tracked in st.session_state["stamps"] and composited onto the rink before
the background is passed to st_canvas.
"""

import copy, io, json, math, os, uuid, base64
from datetime import datetime

import numpy as np
import streamlit as st
from PIL import Image, ImageDraw, ImageFont
from streamlit_drawable_canvas import st_canvas  # pip: streamlit-drawable-canvas-fix

# ─────────────────────────────────────────────────────────────────────────────
# App config
# ─────────────────────────────────────────────────────────────────────────────
st.set_page_config(page_title="Hockey Coach", page_icon="🏒", layout="wide")

DRILLS_FILE    = "drills.json"
PRACTICES_FILE = "practices.json"

CATEGORIES = [
    "Skating", "Passing", "Shooting", "Puck Handling",
    "Checking", "Goalie", "Warmup / Fitness", "Game Situation",
]

# ─────────────────────────────────────────────────────────────────────────────
# Rink constants  (NHL rulebook, all in feet; 4 px / ft)
# Half-rink: x = 0 (centre ice) → 100 ft (end boards); y = ±42.5 ft
# ─────────────────────────────────────────────────────────────────────────────
SCALE         = 4
MARGIN        = 10
CANVAS_W      = MARGIN + int(100 * SCALE) + MARGIN   # 420
CANVAS_H      = MARGIN + int(85  * SCALE) + MARGIN   # 350
RINK_HALF_W   = 42.5
CORNER_R_FT   = 28.0
GOAL_LINE_FT  = 89.0
BLUE_LINE_FT  = 25.0
FO_X_FT       = 69.0
FO_Y_FT       = 22.0
FO_R_FT       = 15.0
NET_HALF_W_FT = 3.0
NET_DEPTH_FT  = 4.0
CREASE_SIDE_FT  = 4.0
CREASE_DEPTH_FT = 4.5
CREASE_R_FT     = 6.0


def _px(x_ft: float, y_ft: float) -> tuple[int, int]:
    return (
        int(MARGIN + x_ft * SCALE),
        int(MARGIN + (RINK_HALF_W - y_ft) * SCALE),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Base rink (cached — drawn once)
# ─────────────────────────────────────────────────────────────────────────────

@st.cache_data
def make_rink() -> Image.Image:
    W, H = CANVAS_W, CANVAS_H
    CR   = int(CORNER_R_FT * SCALE)
    left, right = MARGIN, W - MARGIN
    top, bottom  = MARGIN, H - MARGIN
    tr_cx, tr_cy = right - CR, top    + CR
    br_cx, br_cy = right - CR, bottom - CR

    img = Image.new("RGB", (W, H), "#7A8B99")
    d   = ImageDraw.Draw(img)

    # Ice polygon
    pts: list[tuple[float, float]] = [(left, top), (tr_cx, top)]
    for a in range(270, 361):
        r = math.radians(a)
        pts.append((tr_cx + CR * math.cos(r), tr_cy + CR * math.sin(r)))
    pts.append((right, br_cy))
    for a in range(0, 91):
        r = math.radians(a)
        pts.append((br_cx + CR * math.cos(r), br_cy + CR * math.sin(r)))
    pts.append((left, bottom))
    d.polygon(pts, fill="#D9EEF7")

    # Boards
    bc, bw = "#222222", 3
    atr = [tr_cx-CR, tr_cy-CR, tr_cx+CR, tr_cy+CR]
    abr = [br_cx-CR, br_cy-CR, br_cx+CR, br_cy+CR]
    d.line([(left, top), (tr_cx, top)],     fill=bc, width=bw)
    d.arc(atr, start=270, end=360,           fill=bc, width=bw)
    d.line([(right, tr_cy), (right, br_cy)], fill=bc, width=bw)
    d.arc(abr, start=0,   end=90,            fill=bc, width=bw)
    d.line([(br_cx, bottom), (left, bottom)],fill=bc, width=bw)
    d.line([(left, top), (left, bottom)], fill="#CC0000", width=3)  # centre line

    # Goal-line board intercept
    gx = _px(GOAL_LINE_FT, 0)[0]
    dx_g = gx - tr_cx
    dy_g = int(math.sqrt(max(CR*CR - dx_g*dx_g, 0)))
    gl_top_y, gl_bot_y = tr_cy - dy_g, br_cy + dy_g
    d.line([(gx, gl_top_y), (gx, gl_bot_y)], fill="#CC0000", width=2)

    # Blue line
    bx = _px(BLUE_LINE_FT, 0)[0]
    d.line([(bx, top+1), (bx, bottom-1)], fill="#1a3acc", width=4)

    # Face-off circles + dots
    fo_r = int(FO_R_FT * SCALE)
    dot_r = 5
    for y_ft in (FO_Y_FT, -FO_Y_FT):
        fx, fy = _px(FO_X_FT, y_ft)
        d.ellipse([fx-fo_r, fy-fo_r, fx+fo_r, fy+fo_r], outline="#CC0000", width=2)
        d.ellipse([fx-dot_r, fy-dot_r, fx+dot_r, fy+dot_r], fill="#CC0000")
        for hx_off in (-fo_r, fo_r):
            d.line([(fx+hx_off, fy-8), (fx+hx_off, fy+8)], fill="#CC0000", width=2)

    # Neutral-zone dots
    for y_ft in (FO_Y_FT, -FO_Y_FT):
        nx, ny = _px(BLUE_LINE_FT - 5, y_ft)
        d.ellipse([nx-dot_r, ny-dot_r, nx+dot_r, ny+dot_r], fill="#CC0000")

    # Crease
    gcx, gcy = _px(GOAL_LINE_FT, 0)
    cr_r = int(CREASE_R_FT * SCALE)
    top_gl = _px(GOAL_LINE_FT,  CREASE_SIDE_FT)
    bot_gl = _px(GOAL_LINE_FT, -CREASE_SIDE_FT)
    top_fr = _px(GOAL_LINE_FT - CREASE_DEPTH_FT,  CREASE_SIDE_FT)
    bot_fr = _px(GOAL_LINE_FT - CREASE_DEPTH_FT, -CREASE_SIDE_FT)

    crease_poly: list[tuple[float, float]] = [top_gl, top_fr]
    for a in range(222, 137, -1):
        ra = math.radians(a)
        crease_poly.append((gcx + cr_r * math.cos(ra), gcy + cr_r * math.sin(ra)))
    crease_poly += [bot_fr, bot_gl]
    d.polygon(crease_poly, fill="#bdd9f0")
    cc, cw = "#CC0000", 2
    d.line([top_gl, top_fr], fill=cc, width=cw)
    d.arc([gcx-cr_r, gcy-cr_r, gcx+cr_r, gcy+cr_r], start=138, end=222, fill=cc, width=cw)
    d.line([bot_fr, bot_gl], fill=cc, width=cw)

    # Net
    net_top = _px(GOAL_LINE_FT,  NET_HALF_W_FT)
    net_bot = _px(GOAL_LINE_FT, -NET_HALF_W_FT)
    net_bk  = _px(GOAL_LINE_FT + NET_DEPTH_FT, 0)[0]
    d.rectangle([gx+1, net_top[1]+1, net_bk-1, net_bot[1]-1], fill="#F0DADA")
    for x in range(gx+2, net_bk-1, 4):
        d.line([(x, net_top[1]+1), (x, net_bot[1]-1)], fill="#CC9999", width=1)
    for y in range(net_top[1]+2, net_bot[1]-1, 4):
        d.line([(gx+1, y), (net_bk-1, y)], fill="#CC9999", width=1)
    nf, nw2 = "#CC0000", 2
    d.line([net_top, net_bot], fill=nf, width=3)
    d.line([net_top, (net_bk, net_top[1])], fill=nf, width=nw2)
    d.line([net_bot, (net_bk, net_bot[1])], fill=nf, width=nw2)
    d.line([(net_bk, net_top[1]), (net_bk, net_bot[1])], fill=nf, width=nw2)

    return img


# ─────────────────────────────────────────────────────────────────────────────
# Stamp rendering onto PIL background
# ─────────────────────────────────────────────────────────────────────────────

PLAYER_COLORS: dict[str, tuple[str, str]] = {
    "F":  ("#FFFFFF", "#111111"),
    "D":  ("#d0e8ff", "#003399"),
    "C":  ("#fff0a0", "#886600"),
    "G":  ("#d4f5d4", "#005500"),
    "Co": ("#f5d4f5", "#660066"),
}

STAMP_DEFS: dict[str, tuple[str, str]] = {
    # kind → (display label, button icon)
    "F":          ("F – Forward",   "👤"),
    "D":          ("D – Defence",   "👤"),
    "C":          ("C – Centre",    "👤"),
    "G":          ("G – Goalie",    "👤"),
    "Co":         ("Co – Coach",    "🎽"),
    "net_full":   ("Net (full)",    "🥅"),
    "net_junior": ("Net (junior)",  "🥅"),
    "pylon":      ("Pylon",         "🔺"),
    "puck":       ("Puck",          "🏒"),
    "puck_group": ("Puck group",    "🏒"),
}


def _draw_stamp(d: ImageDraw.Draw, stamp: dict) -> None:
    """Render one stamp onto an ImageDraw surface at its (x, y) pixel position."""
    x, y = stamp["x"], stamp["y"]
    kind  = stamp["kind"]

    try:
        font = ImageFont.load_default(size=12)
    except TypeError:
        font = ImageFont.load_default()

    if kind in PLAYER_COLORS:
        bg, fg = PLAYER_COLORS[kind]
        r = 13
        d.ellipse([x-r, y-r, x+r, y+r], fill=bg, outline=fg, width=2)
        d.text((x, y), kind, fill=fg, font=font, anchor="mm")

    elif kind in ("net_full", "net_junior"):
        # Drawn as a rectangle; user rotates it mentally for the correct orientation
        hw = 8  if kind == "net_full" else 6    # half-depth  (px)
        hh = 12 if kind == "net_full" else 8    # half-height (px)
        d.rectangle([x-hw, y-hh, x+hw, y+hh],
                    fill="#F0DADA", outline="#CC0000", width=2)
        # crosshatch to look like mesh
        for lx in range(x-hw+2, x+hw-1, 3):
            d.line([(lx, y-hh+1), (lx, y+hh-1)], fill="#CC9999", width=1)

    elif kind == "pylon":
        r = 10
        d.polygon([(x, y-r), (x-r, y+r), (x+r, y+r)],
                  fill="#FF6600", outline="#993300")

    elif kind == "puck":
        r = 6
        d.ellipse([x-r, y-r, x+r, y+r], fill="#111111", outline="#444444", width=1)

    elif kind == "puck_group":
        r = 5
        for dx, dy in [(0,0),(13,0),(-13,0),(6,-11),(-6,-11)]:
            d.ellipse([x+dx-r, y+dy-r, x+dx+r, y+dy+r],
                      fill="#111111", outline="#444444", width=1)


def make_background(stamps: list[dict]) -> Image.Image:
    """Rink + all stamps composited on top."""
    img = make_rink().copy()
    if stamps:
        d = ImageDraw.Draw(img)
        for stamp in stamps:
            _draw_stamp(d, stamp)
    return img


# ─────────────────────────────────────────────────────────────────────────────
# Persistence
# ─────────────────────────────────────────────────────────────────────────────

def _load(path: str) -> list:
    return json.load(open(path)) if os.path.exists(path) else []

def _save(path: str, data: list) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

load_drills    = lambda: _load(DRILLS_FILE)
save_drills    = lambda d: _save(DRILLS_FILE, d)
load_practices = lambda: _load(PRACTICES_FILE)
save_practices = lambda p: _save(PRACTICES_FILE, p)


# ─────────────────────────────────────────────────────────────────────────────
# Image utilities
# ─────────────────────────────────────────────────────────────────────────────

def pil_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO(); img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()

def b64_to_pil(b64: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(b64)))

def composite_strokes(arr: np.ndarray, stamps: list[dict]) -> Image.Image:
    """Merge rink+stamps background with the transparent stroke layer."""
    bg    = make_background(stamps).convert("RGBA")
    layer = Image.fromarray(arr.astype("uint8"), "RGBA")
    return Image.alpha_composite(bg, layer).convert("RGB")


# ─────────────────────────────────────────────────────────────────────────────
# Line-style helpers
# ─────────────────────────────────────────────────────────────────────────────

DASH_ARRAYS: dict[str, list | None] = {
    "Solid":     None,
    "Dashed":    [12, 6],
    "Dotted":    [3, 5],
    "Dash-dot":  [12, 4, 3, 4],
    "Long dash": [20, 8],
}

def _apply_style(obj: dict, style: str) -> None:
    da = DASH_ARRAYS.get(style)
    if da and obj.get("type") in ("path", "line"):
        obj["strokeDashArray"] = da


# ─────────────────────────────────────────────────────────────────────────────
# Session-state helpers  (strokes only; stamps are separate)
# ─────────────────────────────────────────────────────────────────────────────

def _init_ss() -> None:
    defaults = {
        "strokes":    [],   # Fabric.js objects from the canvas
        "stroke_hist": [],  # undo stack for strokes
        "stamps":     [],   # list of {id, kind, x, y}
        "stamp_hist": [],   # undo stack for stamps
        "canvas_key": "ck0",
    }
    for k, v in defaults.items():
        st.session_state.setdefault(k, v)

def _bump() -> None:
    st.session_state["canvas_key"] = str(uuid.uuid4())


def _push_stroke_history() -> None:
    h = st.session_state["stroke_hist"]
    h.append(copy.deepcopy(st.session_state["strokes"]))
    if len(h) > 40: h.pop(0)

def _push_stamp_history() -> None:
    h = st.session_state["stamp_hist"]
    h.append(copy.deepcopy(st.session_state["stamps"]))
    if len(h) > 40: h.pop(0)


def _undo() -> None:
    """Undo the last action, whether a stroke or a stamp placement."""
    sh = st.session_state["stroke_hist"]
    th = st.session_state["stamp_hist"]
    # Undo whichever happened most recently (both stacks grow together)
    if sh or th:
        if sh:
            st.session_state["strokes"] = sh.pop()
        if th:
            st.session_state["stamps"] = th.pop()
        _bump()


def _add_stamp(kind: str) -> None:
    _push_stamp_history()
    _push_stroke_history()   # keep stacks in sync length-wise
    st.session_state["stamps"].append({
        "id": str(uuid.uuid4()),
        "kind": kind,
        "x": CANVAS_W // 2,
        "y": CANVAS_H // 2,
    })


def _clear_all() -> None:
    _push_stroke_history()
    _push_stamp_history()
    st.session_state["strokes"] = []
    st.session_state["stamps"]  = []
    _bump()


# ─────────────────────────────────────────────────────────────────────────────
# PDF helpers
# ─────────────────────────────────────────────────────────────────────────────

def _drill_pdf(drill: dict) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImg
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf  = io.BytesIO()
    doc  = SimpleDocTemplate(buf, pagesize=letter,
                             leftMargin=.75*inch, rightMargin=.75*inch,
                             topMargin=.75*inch, bottomMargin=.75*inch)
    ss   = getSampleStyleSheet()
    h1   = ParagraphStyle("H1", parent=ss["Heading1"],
                           textColor=colors.HexColor("#CC0000"), fontSize=22)
    sub  = ParagraphStyle("sub", parent=ss["Normal"],
                           textColor=colors.grey, fontSize=11)
    story = [Paragraph(f"🏒  {drill['name']}", h1), Spacer(1, 4),
             Paragraph(f"Category: {drill['category']}", sub), Spacer(1, 16)]
    if drill.get("image_b64"):
        pil  = b64_to_pil(drill["image_b64"])
        ibuf = io.BytesIO(); pil.save(ibuf, "PNG"); ibuf.seek(0)
        mw   = 6.5 * inch
        story += [RLImg(ibuf, width=mw, height=mw * pil.height / pil.width), Spacer(1, 16)]
    if drill.get("notes"):
        body = ss["Normal"]
        story.append(Paragraph("<b>Coaching notes</b>", body))
        story.append(Spacer(1, 4))
        for line in drill["notes"].splitlines():
            if line.strip():
                story.append(Paragraph(line, body))
    doc.build(story)
    return buf.getvalue()


def _practice_pdf(practice: dict, drills: list) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                    Table, TableStyle, Image as RLImg, HRFlowable)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    dmap  = {d["id"]: d for d in drills}
    buf   = io.BytesIO()
    doc   = SimpleDocTemplate(buf, pagesize=letter,
                              leftMargin=.75*inch, rightMargin=.75*inch,
                              topMargin=.75*inch, bottomMargin=.75*inch)
    ss    = getSampleStyleSheet()
    h1    = ParagraphStyle("H1", parent=ss["Heading1"],
                            textColor=colors.HexColor("#CC0000"), fontSize=22)
    h2    = ParagraphStyle("H2", parent=ss["Heading2"],
                            textColor=colors.HexColor("#1a3acc"), fontSize=14)
    sm    = ParagraphStyle("sm", parent=ss["Normal"],
                            textColor=colors.grey, fontSize=9)
    total = sum(i["duration_min"] for i in practice["items"])
    story = [Paragraph(f"🏒  {practice['name']}", h1),
             Paragraph(f"Date: {practice['date']}  ·  Total: {total} min", sm),
             Spacer(1, 18), Paragraph("Practice Schedule", h2), Spacer(1, 6)]

    rows  = [["Start", "Activity", "Category", "Min"]]
    clock = 0
    for item in practice["items"]:
        icon = "🏒" if item["type"] == "drill" else "💧"
        rows.append([f"{clock:02d}:00", f"{icon} {item['name']}",
                     item.get("category", ""), str(item["duration_min"])])
        clock += item["duration_min"]
    rows.append(["", "TOTAL", "", str(total)])

    tbl = Table(rows, colWidths=[.85*inch, 3.3*inch, 1.6*inch, .6*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1a3acc")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS",(0, 1), (-1, -2),
         [colors.white, colors.HexColor("#f0f4ff")]),
        ("BACKGROUND",    (0, -1), (-1, -1), colors.HexColor("#e0e0e0")),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID",          (0, 0), (-1, -1), .5, colors.HexColor("#cccccc")),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
    ]))
    story += [tbl, Spacer(1, 24)]

    drill_items = [i for i in practice["items"]
                   if i["type"] == "drill" and i.get("drill_id")]
    if drill_items:
        story.append(Paragraph("Drill Diagrams", h2))
    for item in drill_items:
        drill = dmap.get(item.get("drill_id"))
        if not drill: continue
        story += [Spacer(1,10),
                  HRFlowable(width="100%", thickness=1, color=colors.HexColor("#ddd")),
                  Spacer(1,6),
                  Paragraph(f"<b>{drill['name']}</b>  "
                             f"<font color='grey' size='9'>"
                             f"{drill['category']} · {item['duration_min']} min</font>",
                             ss["Normal"])]
        if item.get("notes"):
            story.append(Paragraph(f"<i>{item['notes']}</i>", sm))
        story.append(Spacer(1, 8))
        if drill.get("image_b64"):
            pil  = b64_to_pil(drill["image_b64"])
            ibuf = io.BytesIO(); pil.save(ibuf, "PNG"); ibuf.seek(0)
            mw   = 5.5 * inch
            story.append(RLImg(ibuf, width=mw, height=mw * pil.height / pil.width))
    doc.build(story)
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Stamp management panel  (called from page_draw's right column)
# ─────────────────────────────────────────────────────────────────────────────

def _stamp_panel() -> bool:
    """
    Render the stamp-add buttons and the positioned-stamps list.
    Returns True if anything changed that requires a background refresh.
    """
    st.markdown("**Stamps**")
    st.caption("Click to place at centre, then adjust position below.")

    changed = False

    # Add buttons – 2-column grid
    c1, c2 = st.columns(2)
    for i, (kind, (label, icon)) in enumerate(STAMP_DEFS.items()):
        col = c1 if i % 2 == 0 else c2
        with col:
            if st.button(f"{icon} {label}", key=f"add_{kind}",
                         use_container_width=True):
                _add_stamp(kind)
                changed = True

    stamps = st.session_state["stamps"]
    if stamps:
        st.markdown("---")
        st.markdown("**Placed stamps** — adjust position or remove")
        to_remove = None
        for idx, stamp in enumerate(stamps):
            label, icon = STAMP_DEFS[stamp["kind"]]
            with st.container(border=True):
                header_col, rm_col = st.columns([4, 1])
                with header_col:
                    st.caption(f"{icon} {label}")
                with rm_col:
                    if st.button("✕", key=f"rm_stamp_{stamp['id']}",
                                 use_container_width=True, help="Remove"):
                        to_remove = idx

                xc, yc = st.columns(2)
                with xc:
                    new_x = st.number_input(
                        "x (px)", min_value=0, max_value=CANVAS_W,
                        value=stamp["x"], step=4,
                        key=f"sx_{stamp['id']}",
                        label_visibility="visible",
                    )
                with yc:
                    new_y = st.number_input(
                        "y (px)", min_value=0, max_value=CANVAS_H,
                        value=stamp["y"], step=4,
                        key=f"sy_{stamp['id']}",
                        label_visibility="visible",
                    )
                if new_x != stamp["x"] or new_y != stamp["y"]:
                    stamp["x"] = new_x
                    stamp["y"] = new_y
                    changed = True

        if to_remove is not None:
            _push_stamp_history()
            _push_stroke_history()
            stamps.pop(to_remove)
            changed = True

    return changed


# ─────────────────────────────────────────────────────────────────────────────
# Page: Draw a Drill
# ─────────────────────────────────────────────────────────────────────────────

def page_draw() -> None:
    st.header("🎨 Draw a Drill")
    _init_ss()

    drills     = load_drills()
    editing_id = st.session_state.get("edit_drill_id")
    src        = next((d for d in drills if d["id"] == editing_id), None) \
                 if editing_id else None

    # One-time load when entering edit mode
    if src and not st.session_state.get("_edit_loaded"):
        saved = src.get("canvas_json") or {}
        st.session_state["strokes"] = saved.get("objects", [])
        st.session_state["stamps"]  = saved.get("stamps", [])
        st.session_state["stroke_hist"] = []
        st.session_state["stamp_hist"]  = []
        st.session_state["_edit_loaded"] = True
        _bump()

    left, right = st.columns([3, 1])

    # ── Right panel ───────────────────────────────────────────────────────────
    with right:
        st.subheader("Drill Info")
        name     = st.text_input("Name *", value=src["name"] if src else "")
        category = st.selectbox(
            "Category", CATEGORIES,
            index=CATEGORIES.index(src["category"])
                  if src and src["category"] in CATEGORIES else 0,
        )
        notes = st.text_area("Notes / coaching points",
                             value=src.get("notes", "") if src else "", height=80)

        st.divider()
        st.markdown("**Drawing tools**")
        tool = st.radio("", ["freedraw", "line", "rect", "circle", "transform"],
                        label_visibility="collapsed",
                        format_func=lambda x: {
                            "freedraw":  "✏️  Freehand",
                            "line":      "➖  Straight line",
                            "rect":      "▭  Rectangle",
                            "circle":    "⭕  Circle / oval",
                            "transform": "↔️  Move / select",
                        }[x])
        color = st.color_picker("Stroke colour", "#CC0000")
        width = st.slider("Stroke width", 1, 14, 2)

        line_style = "Solid"
        if tool in ("freedraw", "line"):
            line_style = st.selectbox("Line style", list(DASH_ARRAYS.keys()))

        fill_color = "rgba(0,0,0,0)"
        if tool in ("rect", "circle"):
            if st.checkbox("Fill shape"):
                fill_color = st.color_picker("Fill colour", "#CC000033")

        st.divider()
        stamp_changed = _stamp_panel()

        st.divider()
        u_col, c_col = st.columns(2)
        with u_col:
            can_undo = bool(st.session_state["stroke_hist"] or
                            st.session_state["stamp_hist"])
            if st.button("↩️ Undo", disabled=not can_undo,
                         use_container_width=True):
                _undo(); st.rerun()
        with c_col:
            if st.button("🗑️ Clear all", use_container_width=True):
                _clear_all(); st.rerun()

        if src:
            st.divider()
            st.info(f"Editing: **{src['name']}**")
            if st.button("✖ Cancel edit", use_container_width=True):
                for k in ("edit_drill_id", "_edit_loaded"):
                    st.session_state.pop(k, None)
                st.session_state.update(strokes=[], stamps=[],
                                        stroke_hist=[], stamp_hist=[])
                st.session_state["sidebar_nav"] = "📚 Drill Library"
                _bump(); st.rerun()

    # ── Left panel: canvas ────────────────────────────────────────────────────
    with left:
        if stamp_changed:
            st.rerun()

        bg      = make_background(st.session_state["stamps"])
        initial = {"version": "4.4.0", "objects": st.session_state["strokes"]}

        result = st_canvas(
            fill_color       = fill_color,
            stroke_width     = width,
            stroke_color     = color,
            background_image = bg,
            update_streamlit = True,
            height           = CANVAS_H,
            width            = CANVAS_W,
            drawing_mode     = tool,
            initial_drawing  = initial,
            key              = st.session_state["canvas_key"],
        )

    # ── Sync canvas strokes ───────────────────────────────────────────────────
    if result.json_data:
        returned = result.json_data.get("objects", [])
        prev_n   = len(st.session_state["strokes"])
        curr_n   = len(returned)

        if curr_n > prev_n:
            # New stroke drawn
            _push_stroke_history()
            _push_stamp_history()
            for obj in returned[prev_n:]:
                _apply_style(obj, line_style)
            st.session_state["strokes"] = returned
            if line_style != "Solid":
                _bump(); st.rerun()

        elif curr_n < prev_n and curr_n > 0:
            # Object deleted in canvas (transform mode + Delete key)
            _push_stroke_history()
            _push_stamp_history()
            st.session_state["strokes"] = returned

        elif curr_n == prev_n:
            # Moves / transforms — update positions silently
            st.session_state["strokes"] = returned

        # Note: curr_n == 0 and prev_n > 0 is ignored to protect against the
        # canvas returning an empty list on the first tick after a key change.

    # ── Save + export ─────────────────────────────────────────────────────────
    st.divider()
    s_col, pdf_col, _ = st.columns([2, 2, 3])

    with s_col:
        if st.button("💾 Save drill", type="primary", use_container_width=True):
            if not name.strip():
                st.error("Please enter a drill name.")
            else:
                img_b64 = None
                if result.image_data is not None:
                    img_b64 = pil_to_b64(
                        composite_strokes(result.image_data,
                                          st.session_state["stamps"]))
                now   = datetime.now().isoformat()
                cjson = {
                    "version": "4.4.0",
                    "objects": st.session_state["strokes"],
                    "stamps":  st.session_state["stamps"],
                }
                if src:
                    for d in drills:
                        if d["id"] == editing_id:
                            d.update(name=name.strip(), category=category,
                                     notes=notes, canvas_json=cjson,
                                     image_b64=img_b64, modified=now)
                    for k in ("edit_drill_id", "_edit_loaded"):
                        st.session_state.pop(k, None)
                else:
                    drills.append(dict(
                        id=str(uuid.uuid4()), name=name.strip(),
                        category=category, notes=notes,
                        canvas_json=cjson, image_b64=img_b64,
                        created=now, modified=now,
                    ))
                save_drills(drills)
                st.session_state.update(strokes=[], stamps=[],
                                        stroke_hist=[], stamp_hist=[])
                _bump()
                st.success(f"✅  {name} saved!")
                st.rerun()

    with pdf_col:
        if src and src.get("image_b64"):
            try:
                st.download_button(
                    "📄 Export drill PDF", data=_drill_pdf(src),
                    file_name=f"{src['name'].replace(' ', '_')}.pdf",
                    mime="application/pdf", use_container_width=True,
                )
            except ImportError:
                st.warning("Install **reportlab** to enable PDF export.")
        else:
            st.button("📄 Export drill PDF", disabled=True,
                      use_container_width=True,
                      help="Save the drill first to enable PDF export.")


# ─────────────────────────────────────────────────────────────────────────────
# Page: Drill Library
# ─────────────────────────────────────────────────────────────────────────────

def page_library() -> None:
    st.header("📚 Drill Library")
    drills = load_drills()
    if not drills:
        st.info("No drills yet — draw your first one in **🎨 Draw a Drill**.")
        return

    c1, c2 = st.columns([2, 3])
    with c1:
        cat_filter = st.multiselect("Category", CATEGORIES, default=CATEGORIES)
    with c2:
        search = st.text_input("Search", placeholder="Type to filter…")

    visible = [d for d in drills
               if d["category"] in cat_filter
               and search.lower() in d["name"].lower()]
    if not visible:
        st.warning("No drills match those filters.")
        return

    st.caption(f"{len(visible)} drill(s) shown")
    N = 3
    for row_start in range(0, len(visible), N):
        cols = st.columns(N)
        for col, drill in zip(cols, visible[row_start: row_start + N]):
            with col:
                with st.container(border=True):
                    if drill.get("image_b64"):
                        st.image(b64_to_pil(drill["image_b64"]),
                                 use_container_width=True)
                    else:
                        st.markdown("*(no image)*")
                    st.markdown(f"**{drill['name']}**")
                    st.caption(f"📁 {drill['category']}")
                    if drill.get("notes"):
                        with st.expander("Notes"):
                            st.write(drill["notes"])
                    e_col, pdf_col, d_col = st.columns(3)
                    with e_col:
                        if st.button("✏️", key=f"e_{drill['id']}",
                                     use_container_width=True, help="Edit"):
                            st.session_state["edit_drill_id"] = drill["id"]
                            st.session_state.pop("_edit_loaded", None)
                            st.session_state.update(strokes=[], stamps=[],
                                                    stroke_hist=[], stamp_hist=[])
                            st.session_state["sidebar_nav"] = "🎨 Draw a Drill"
                            _bump(); st.rerun()
                    with pdf_col:
                        if drill.get("image_b64"):
                            try:
                                st.download_button(
                                    "📄", data=_drill_pdf(drill),
                                    file_name=f"{drill['name'].replace(' ', '_')}.pdf",
                                    mime="application/pdf",
                                    key=f"pdf_{drill['id']}",
                                    use_container_width=True, help="PDF",
                                )
                            except ImportError:
                                st.button("📄", disabled=True,
                                          key=f"pdf_{drill['id']}",
                                          use_container_width=True)
                    with d_col:
                        if st.button("🗑️", key=f"del_{drill['id']}",
                                     use_container_width=True, help="Delete"):
                            st.session_state[f"_confirm_{drill['id']}"] = True
                    if st.session_state.get(f"_confirm_{drill['id']}"):
                        st.warning(f"Delete **{drill['name']}**?")
                        ya, na = st.columns(2)
                        with ya:
                            if st.button("Yes", key=f"y_{drill['id']}"):
                                save_drills([x for x in drills
                                             if x["id"] != drill["id"]])
                                st.session_state.pop(f"_confirm_{drill['id']}", None)
                                st.rerun()
                        with na:
                            if st.button("No", key=f"n_{drill['id']}"):
                                st.session_state.pop(f"_confirm_{drill['id']}", None)
                                st.rerun()


# ─────────────────────────────────────────────────────────────────────────────
# Page: Practice Planner
# ─────────────────────────────────────────────────────────────────────────────

def page_practice() -> None:
    st.header("📋 Practice Planner")
    drills    = load_drills()
    practices = load_practices()
    st.session_state.setdefault("plan_items", [])

    new_tab, saved_tab = st.tabs(["➕ Build practice", "📂 Saved practices"])

    with new_tab:
        i_col, _ = st.columns([2, 1])
        with i_col:
            pname = st.text_input("Practice name *",
                                  placeholder="e.g. Feb 6 – Shooting Focus")
            pdate = st.date_input("Date")

        st.subheader("Add items")
        d_tab, b_tab = st.tabs(["🏒 Drill from library", "💧 Break"])
        with d_tab:
            if drills:
                sel  = st.selectbox("Drill", [d["name"] for d in drills])
                dur  = st.number_input("Duration (min)", 1, 90, 10, key="dd")
                note = st.text_input("On-ice note", key="dn")
                if st.button("➕ Add drill"):
                    chosen = next(d for d in drills if d["name"] == sel)
                    st.session_state["plan_items"].append(dict(
                        type="drill", drill_id=chosen["id"],
                        name=chosen["name"], category=chosen["category"],
                        duration_min=dur, notes=note,
                    ))
                    st.rerun()
            else:
                st.info("Save some drills in the library first.")
        with b_tab:
            blabel = st.text_input("Label", placeholder="Water break…")
            bdur   = st.number_input("Duration (min)", 1, 20, 2, key="bd")
            if st.button("➕ Add break"):
                st.session_state["plan_items"].append(dict(
                    type="break", name=blabel or "Break", duration_min=bdur,
                ))
                st.rerun()

        items = st.session_state["plan_items"]
        if items:
            st.divider()
            st.subheader("Schedule")
            st.metric("Total ice time", f"{sum(i['duration_min'] for i in items)} min")
            clock = 0
            for idx, item in enumerate(items):
                with st.container(border=True):
                    ct, cn, cu, cd, cx = st.columns([1, 6, 1, 1, 1])
                    icon = "🏒" if item["type"] == "drill" else "💧"
                    with ct: st.markdown(f"`{clock:02d}:00`")
                    with cn:
                        st.markdown(f"{icon} **{item['name']}** — {item['duration_min']} min")
                        if item.get("category"): st.caption(f"📁 {item['category']}")
                        if item.get("notes"):    st.caption(f"💬 {item['notes']}")
                    with cu:
                        if idx > 0 and st.button("⬆️", key=f"u{idx}"):
                            items[idx-1], items[idx] = items[idx], items[idx-1]; st.rerun()
                    with cd:
                        if idx < len(items)-1 and st.button("⬇️", key=f"v{idx}"):
                            items[idx+1], items[idx] = items[idx], items[idx+1]; st.rerun()
                    with cx:
                        if st.button("✕", key=f"x{idx}"):
                            items.pop(idx); st.rerun()
                    clock += item["duration_min"]

            st.divider()
            sv, cl, ep = st.columns(3)
            with sv:
                if st.button("💾 Save practice", type="primary",
                             use_container_width=True):
                    if not pname.strip():
                        st.error("Name the practice first.")
                    else:
                        practices.append(dict(
                            id=str(uuid.uuid4()), name=pname.strip(),
                            date=str(pdate), items=items.copy(),
                            created=datetime.now().isoformat(),
                        ))
                        save_practices(practices)
                        st.session_state["plan_items"] = []
                        st.success("Practice saved!"); st.rerun()
            with cl:
                if st.button("🗑️ Clear all", use_container_width=True):
                    st.session_state["plan_items"] = []; st.rerun()
            with ep:
                try:
                    pdf = _practice_pdf(
                        dict(name=pname or "Draft", date=str(pdate), items=items),
                        drills)
                    st.download_button("📄 Export PDF", data=pdf,
                                       file_name="practice_plan.pdf",
                                       mime="application/pdf",
                                       use_container_width=True)
                except ImportError:
                    st.warning("Install **reportlab** for PDF export.")
        else:
            st.info("Add drills and breaks above to build your schedule.")

    with saved_tab:
        if not practices:
            st.info("No practices saved yet.")
        else:
            for p in sorted(practices, key=lambda x: x["date"], reverse=True):
                total = sum(i["duration_min"] for i in p["items"])
                with st.expander(
                    f"📅 **{p['date']}** — {p['name']}  ·  "
                    f"{total} min  ·  {len(p['items'])} items"
                ):
                    clock = 0
                    for item in p["items"]:
                        icon = "🏒" if item["type"] == "drill" else "💧"
                        note = f"  *{item['notes']}*" if item.get("notes") else ""
                        st.markdown(f"`{clock:02d}:00`  {icon} **{item['name']}**"
                                    f" ({item['duration_min']} min){note}")
                        clock += item["duration_min"]
                    ex_col, de_col = st.columns(2)
                    with ex_col:
                        try:
                            st.download_button(
                                "📄 Export PDF", data=_practice_pdf(p, drills),
                                file_name=f"{p['date']}_practice.pdf",
                                mime="application/pdf",
                                key=f"ex_{p['id']}", use_container_width=True,
                            )
                        except ImportError:
                            st.warning("Install reportlab for PDF.")
                    with de_col:
                        if st.button("🗑️ Delete practice",
                                     key=f"dp_{p['id']}", use_container_width=True):
                            save_practices([x for x in practices if x["id"] != p["id"]])
                            st.rerun()


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    with st.sidebar:
        st.title("🏒 Hockey Coach")
        st.caption("House league practice tool")
        st.divider()
        page = st.radio(
            "Navigate",
            ["🎨 Draw a Drill", "📚 Drill Library", "📋 Practice Planner"],
            key="sidebar_nav",
        )
        st.divider()
        st.caption(
            "Data lives in `drills.json` and `practices.json` next to "
            "`app.py`. Put the folder in a shared Dropbox to sync "
            "between coaches."
        )

    {
        "🎨 Draw a Drill":     page_draw,
        "📚 Drill Library":    page_library,
        "📋 Practice Planner": page_practice,
    }[page]()


if __name__ == "__main__":
    main()
