"""Generate Professor Amber, a ginger cat teacher mascot: a character sheet plus an illustration series, as SVG."""
from math import cos, pi, sin
from pathlib import Path

O, FUR, DARK, CREAM, PINK, IRIS = "#2B2320", "#D98A45", "#B5652A", "#F7EBDD", "#D9958A", "#8DA868"
NAVY, LAPEL, WINE, GOLD, GREEN, WOOD = "#33415C", "#3F5074", "#8C2F39", "#C9A24B", "#5B7F62", "#9C6B43"
CSS = (
    ".o{stroke:#2B2320;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}"
    ".n{fill:none;stroke-linecap:round;stroke-linejoin:round}.t{stroke-width:1.5}.b{stroke-width:3}"
    "text{font-family:Georgia,'Times New Roman',serif}"
)


def at(x, y, s, body):
    return f'<g transform="translate({x},{y}) scale({s})">{body}</g>'


def mirror(body):
    return body + f'<g transform="scale(-1,1)">{body}</g>'


def t(x, y, size, s, color=O, anchor="middle", style=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" style="fill:{color};text-anchor:{anchor};{style}">{s}</text>'


def thick(d, w, color):
    # Outlined thick stroke: a dark pass under a thinner colored pass
    return f'<path class="n" d="{d}" stroke="{O}" stroke-width="{w + 4.4}"/><path class="n" d="{d}" stroke="{color}" stroke-width="{w}"/>'


def limb(x1, y1, x2, y2):
    # Blazer sleeve from the shoulder to a cream paw
    return thick(f"M{x1},{y1}L{x2},{y2}", 15, NAVY) + f'<circle class="o" cx="{x2}" cy="{y2}" r="8.5" fill="{CREAM}"/>'


def spark(x, y, r):
    return f'<path class="o t" fill="{GOLD}" transform="translate({x},{y})" d="M0,{-r}Q0,0 {r},0Q0,0 0,{r}Q0,0 {-r},0Q0,0 0,{-r}Z"/>'


def star5(x, y, r):
    pts = " ".join(f"{x + k * sin(i * pi / 5):.1f},{y - k * cos(i * pi / 5):.1f}" for i in range(10) for k in [r if i % 2 == 0 else r * 0.45])
    return f'<polygon class="o" fill="{GOLD}" points="{pts}"/>'


def fish(x, y, s=1, color="#fff"):
    return at(x, y, s, f'<g class="n" stroke="{color}" stroke-width="2.5"><ellipse rx="17" ry="9"/><path d="M15,0L28,-8L28,8Z"/><circle cx="-8" cy="-2" r="1"/></g>')


def almond(pupil_y, pupil_ry):
    return (
        f'<path class="o t" fill="{IRIS}" d="M-10,1C-6,-9 5,-10 10,-2C6,8-5,9-10,1Z"/><ellipse cy="{pupil_y}" rx="2.8" ry="{pupil_ry}" fill="{O}"/>'
        '<circle cx="-3" cy="-3.5" r="1.6" fill="#fff"/><path class="o n b" d="M-10,1C-6,-9 5,-10 10,-2"/>'
    )


# Eye shapes describe the right eye around its center (mirrored for the left); mouths hang below the nose at (0,21)
EYES = {
    "open": almond(-0.5, 5.2),
    "look": almond(-2.5, 4),
    "happy": '<path class="o n b" d="M-9,2Q0,-8 9,2"/>',
    "sleepy": '<path class="o n b" d="M-9,-1Q0,6 9,-1"/>',
    "wide": f'<circle class="o t" r="9" fill="{IRIS}"/><circle r="3" fill="{O}"/><circle cx="-3" cy="-3.5" r="1.6" fill="#fff"/>',
    "half": f'<path class="o t" fill="{IRIS}" d="M-10,0L10,-1C6,8-5,9-10,0Z"/><ellipse cy="3" rx="2.6" ry="3.5" fill="{O}"/><path class="o n b" d="M-11,0L11,-1"/>',
    "glint": '<circle r="16.5" fill="#F4F8FA"/><path class="n" stroke="#B9D3E0" stroke-width="4" d="M-8,7L7,-8M1,10L10,1"/>',
}
W = "M-12,23Q-11,29-6,29Q0,29 0,21Q0,29 6,29Q11,29 12,23"
MOUTHS = {
    "w": f'<path class="o n t" d="{W}"/>',
    "smile": f'<path class="o t" fill="#8C3A3A" d="M-6,29Q0,29 0,21Q0,29 6,29Q5,38 0,38Q-5,38-6,29Z"/><path class="o n t" d="{W}"/>',
    "o": '<ellipse class="o t" cy="29" rx="3.5" ry="4.5" fill="#8C3A3A"/>',
    "flat": '<path class="o n t" d="M-7,28L7,28"/>',
    "frown": '<path class="o n t" d="M-8,30Q0,24 8,30"/>',
    "smirk": '<path class="o n t" d="M-9,25Q3,32 11,23"/>',
}


def head(eyes="open", mouth="w", extra=""):
    left, right = (eyes, eyes) if isinstance(eyes, str) else eyes
    eye = lambda kind, side: f'<g transform="translate({25 * side},-3) scale({side},1) rotate(-8)">{EYES[kind]}</g>'
    return (
        mirror(f'<path class="o" fill="{FUR}" d="M-52,-16L-50,-76Q-47,-84-40,-78L-10,-44Z"/><path fill="{PINK}" d="M-45,-34L-45,-68L-24,-46Z"/>')
        + f'<path class="o" fill="{FUR}" d="M0,-50C34,-50 58,-30 58,-2C58,10 62,16 70,24C56,26 50,40 30,47C18,51-18,51-30,47C-50,40-56,26-70,24C-62,16-58,10-58,-2C-58,-30-34,-50 0,-50Z"/>'
        + f'<path class="n" stroke="{DARK}" stroke-width="5" d="M0,-42L0,-30M-13,-40L-11,-29M13,-40L11,-29"/>'
        + mirror(f'<path class="n" stroke="{DARK}" stroke-width="4" d="M54,6L45,9M56,15L47,17"/>')
        + f'<ellipse cy="24" rx="26" ry="18" fill="{CREAM}"/>'
        + mirror(f'<path class="o n t" opacity=".7" d="M30,22L70,15M30,26L73,27M30,30L69,37"/><circle cx="25" cy="-3" r="18" fill="#fff" opacity=".3"/>')
        + eye(left, -1) + eye(right, 1)
        + mirror('<circle class="o n" cx="25" cy="-3" r="18"/><path class="o n" d="M43,-5L56,-9"/>')
        + '<path class="o n" d="M-7,-5Q0,-10 7,-5"/>'
        + f'<path class="o t" fill="{PINK}" d="M-5,14Q0,12 5,14Q3,20 0,20.5Q-3,20-5,14Z"/>'
        + MOUTHS[mouth] + extra
    )


TAIL, TIP = "M-40,160C-80,176-112,150-104,112", "C-101,98-108,88-118,86"
IDLE = limb(-40, 64, -52, 122) + limb(40, 64, 52, 122)


def cat(eyes="open", mouth="w", arms=IDLE):
    # Layers back to front: shadow, tail, trousers, blazer, shirt and tie, feet, head, arms with held props
    return (
        '<ellipse cy="188" rx="72" ry="7" opacity=".1"/>'
        + thick(TAIL + TIP, 11, FUR) + f'<path class="n" d="M-104,112{TIP}" stroke="{CREAM}" stroke-width="11"/>'
        + mirror('<rect class="o" x="5" y="140" width="27" height="38" rx="4" fill="#3A3A44"/>')
        + f'<path class="o" fill="{NAVY}" d="M-30,44C-46,60-50,110-46,150L46,150C50,110 46,60 30,44Z"/>'
        + f'<path class="o t" fill="#fff" d="M-15,46L0,100L15,46Z"/>'
        + f'<path class="o t" fill="{WINE}" d="M-5,50L5,50L3,60L6,86L0,93L-6,86L-3,60Z"/><path class="o n t" d="M-3,60L3,60"/>'
        + mirror(f'<path class="o t" fill="{LAPEL}" d="M-15,46L0,100L-9,102L-26,62Z"/>')
        + f'<path class="o n t" d="M0,100L0,150"/><circle cx="0" cy="120" r="3" fill="{GOLD}"/><circle cx="0" cy="136" r="3" fill="{GOLD}"/>'
        + mirror(f'<ellipse class="o" cx="20" cy="178" rx="17" ry="8" fill="{CREAM}"/>')
        + head(eyes, mouth) + arms
    )


def card(bg, caption, body):
    return f'<rect width="400" height="400" rx="24" fill="{bg}"/>' + body + t(200, 374, 24, caption, style="font-style:italic")


def sheet():
    info = [("Tenure", "Nine lives and counting"), ("Look", "Round specs, navy blazer, wine tie"), ("Temper", "Patient, precise, naps at noon"),
            ("Loves", "Dried fish and tidy handwriting"), ("Motto", "&#8220;Curiosity made the cat.&#8221;")]
    lines = "".join(t(300, 150 + i * 28, 14.5, f'<tspan style="fill:{DARK};font-weight:bold">{k}</tspan>  {v}', anchor="start") for i, (k, v) in enumerate(info))
    palette = "".join(f'<circle class="o t" cx="{316 + i * 43}" cy="316" r="15" fill="{c}"/>' + t(316 + i * 43, 350, 8, c) for i, c in enumerate([FUR, DARK, CREAM, NAVY, WINE, GOLD, O]))
    return (
        '<rect width="610" height="400" rx="24" fill="#F3EDE2"/>' + at(158, 120, 1, cat())
        + t(300, 84, 30, "Professor Amber", anchor="start", style="font-weight:bold")
        + t(300, 110, 15, "Homeroom teacher · Whisker Academy", DARK, "start", "font-style:italic") + lines + palette
    )


def expressions():
    faces = [
        ("Happy", "happy", "smile", ""),
        ("Stern", "half", "frown", mirror('<path class="o n b" d="M-44,-34L-17,-25"/>')),
        ("Surprised", "wide", "o", t(82, -40, 34, "!!", WINE, style="font-weight:bold")),
        ("Thinking", "look", "flat", t(82, -40, 34, "?", NAVY, style="font-weight:bold")),
        ("Sleepy", "sleepy", "w", t(88, -46, 20, "z z z", "#7A6A99", style="font-style:italic")),
        ("Smug", "glint", "smirk", spark(45, -22, 10)),
    ]
    cells = "".join(
        at(110 + i % 3 * 195, 140 + i // 3 * 165, 0.9, head(e, m, x)) + t(110 + i % 3 * 195, 210 + i // 3 * 165, 17, name, style="font-style:italic")
        for i, (name, e, m, x) in enumerate(faces)
    )
    return '<rect width="610" height="400" rx="24" fill="#E4EAE4"/>' + t(305, 40, 20, "Professor Amber · Expressions", style="font-weight:bold") + cells


def class_begins():
    board = (
        f'<rect x="170" y="40" width="206" height="140" rx="4" fill="#2F5548" stroke="{WOOD}" stroke-width="8"/>'
        + t(273, 76, 15, "Lesson 1 · Fish Arithmetic", "#CFE0D8", style="font-style:italic")
        + fish(206, 122) + t(250, 131, 28, "+", "#fff") + fish(284, 122) + t(328, 131, 28, "=", "#fff") + t(354, 133, 32, "?", "#E8C66A")
    )
    pointer = f'<path class="n" stroke="{WOOD}" stroke-width="4" d="M76,40L225,-28"/><circle cx="225" cy="-28" r="3.5" fill="{WINE}"/>'
    return card("#F3EDE2", "Class is in session.", board + at(115, 175, 0.82, cat(arms=limb(-40, 64, -52, 122) + pointer + limb(38, 62, 76, 40))))


def reading():
    book = (
        f'<path class="o" fill="{WINE}" d="M0,112L-44,103L-44,141L0,150L44,141L44,103Z"/>'
        '<path class="o t" fill="#fff" d="M0,112L-44,103L-44,98L0,107L44,98L44,103Z"/><path class="o n t" d="M0,112L0,150"/>'
        + fish(21, 126, 0.55, GOLD) + limb(-40, 66, -48, 126) + limb(40, 66, 48, 126)
    )
    notes = "".join(t(x, y, 34, s, c, style="font-style:italic") for x, y, s, c in [(64, 110, "A", NAVY), (338, 90, "&#931;", WINE), (344, 214, "&#960;", GREEN), (60, 226, "&#8730;", "#7A6A99")])
    return card("#E6E9F0", "Read widely.", notes + at(206, 122, 1, cat("happy", arms=book)))


def full_marks():
    paper = at(-94, 18, 1, (
        '<g transform="rotate(-8)"><rect class="o" x="-32" y="-42" width="64" height="84" rx="3" fill="#fff"/>'
        '<path class="n" stroke="#C9CED6" stroke-width="2.5" d="M-22,-29L22,-29M-22,-19L6,-19"/>'
        + t(0, 12, 30, "A+", WINE, style="font-weight:bold") + f'<path class="n" stroke="{WINE}" stroke-width="2" d="M-20,21L20,17M-20,27L20,23"/></g>'
    ))
    pen = f'<path class="n" stroke="{WINE}" stroke-width="6" d="M67,51L86,12"/><path class="n" stroke="{O}" stroke-width="2.5" d="M86,12L89,6"/>'
    desk = (
        f'<rect class="o" x="20" y="262" width="360" height="80" rx="8" fill="{WOOD}"/>'
        + "".join(f'<rect class="o t" x="{282 - i * 5}" y="{249 - i * 13}" width="80" height="13" rx="3" fill="{c}"/>' for i, c in enumerate([NAVY, GREEN, GOLD]))
        + f'<circle class="o" cx="58" cy="249" r="13" fill="{WINE}"/><path class="o n t" d="M58,238Q58,231 63,227"/>'
    )
    arms = paper + limb(-38, 62, -70, 46) + pen + limb(38, 62, 70, 46)
    return card("#E4EAE4", "Full marks!", at(212, 118, 0.9, cat("happy", "smile", "")) + desk + at(212, 118, 0.9, arms))


def well_done():
    sparks = spark(70, 120, 10) + spark(340, 76, 13) + spark(326, 236, 8) + spark(84, 60, 7)
    return card("#F0E4DF", "Well done.", sparks + at(196, 122, 1, cat("happy", "smile", limb(-40, 64, -52, 122) + star5(90, 4, 24) + limb(38, 62, 82, 32))))


def any_questions():
    bubble = '<path class="o" fill="#fff" d="M128.7,112.4A64,42 0 1 1 147.4,99L166,130Z"/>' + t(92, 95, 46, "?", WINE, style="font-weight:bold")
    return card("#E6E9F0", "Any questions?", bubble + at(238, 140, 0.95, cat(mouth="smile", arms=limb(-40, 64, -52, 122) + limb(38, 62, 88, 22))))


def class_dismissed():
    bell = at(84, 92, 1.3, (
        f'<g transform="rotate(-18)"><path class="o n" d="M0,-18L0,-25"/><path class="o" fill="{GOLD}" d="M-16,8Q-16,-16 0,-18Q16,-16 16,8L21,14L-21,14Z"/>'
        f'<circle class="o t" cy="19" r="4" fill="{O}"/><path class="o n t" d="M-30,-10Q-37,1-30,12M30,-10Q37,1 30,12"/></g>'
    ))
    case = f'<path class="o n" d="M-64,132Q-52,112-40,132"/><rect class="o" x="-80" y="132" width="56" height="36" rx="4" fill="{WOOD}"/><rect class="o t" x="-57" y="144" width="10" height="8" rx="2" fill="{GOLD}"/>'
    wave = '<path class="o n t" d="M102,4Q109,14 106,28M111,-2Q121,14 115,34"/>'
    arms = case + limb(-40, 64, -52, 122) + limb(38, 62, 88, 22) + wave
    return card("#EFE6D2", "Class dismissed.", bell + t(84, 152, 15, "ring, ring", style="font-style:italic") + at(226, 128, 0.95, cat(("happy", "open"), "smile", arms)))


def save(name, w, h, body):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><style>{CSS}</style>{body}</svg>'
    (Path(__file__).parent / f"{name}.svg").write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    sheets = {"01_character_sheet": sheet(), "02_expressions": expressions()}
    cards = {
        "03_class_begins": class_begins(), "04_reading": reading(), "05_full_marks": full_marks(),
        "06_well_done": well_done(), "07_any_questions": any_questions(), "08_class_dismissed": class_dismissed(),
    }
    overview = '<rect width="1280" height="1280" fill="#FBF8F3"/>'
    for i, (name, body) in enumerate(sheets.items()):
        save(name, 610, 400, body)
        overview += at(20 + i * 630, 20, 1, body)
    for i, (name, body) in enumerate(cards.items()):
        save(name, 400, 400, body)
        overview += at(20 + i % 3 * 420, 440 + i // 3 * 420, 1, body)
    save("00_overview", 1280, 1280, overview)
