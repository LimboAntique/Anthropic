"""Generate Professor Amber, a ginger cat teacher mascot, as SVG: one face per verdict level plus a full-marks card."""
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
    "wide": f'<circle class="o t" r="9" fill="{IRIS}"/><circle r="3" fill="{O}"/><circle cx="-3" cy="-3.5" r="1.6" fill="#fff"/>',
    "half": f'<path class="o t" fill="{IRIS}" d="M-10,0L10,-1C6,8-5,9-10,0Z"/><ellipse cy="3" rx="2.6" ry="3.5" fill="{O}"/><path class="o n b" d="M-11,0L11,-1"/>',
}
W = "M-12,23Q-11,29-6,29Q0,29 0,21Q0,29 6,29Q11,29 12,23"
MOUTHS = {
    "w": f'<path class="o n t" d="{W}"/>',
    "smile": f'<path class="o t" fill="#8C3A3A" d="M-6,29Q0,29 0,21Q0,29 6,29Q5,38 0,38Q-5,38-6,29Z"/><path class="o n t" d="{W}"/>',
    "o": '<ellipse class="o t" cy="29" rx="3.5" ry="4.5" fill="#8C3A3A"/>',
    "flat": '<path class="o n t" d="M-7,28L7,28"/>',
    "frown": '<path class="o n t" d="M-8,30Q0,24 8,30"/>',
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


# Faces share one viewBox so swapping them never shifts the layout; the right margin holds the "!!" and "?" marks
FACES = {
    "face_happy": head("happy", "smile"),
    "face_thinking": head("look", "flat", t(82, -40, 34, "?", NAVY, style="font-weight:bold")),
    "face_stern": head("half", "frown", mirror('<path class="o n b" d="M-44,-34L-17,-25"/>')),
    "face_surprised": head("wide", "o", t(82, -40, 34, "!!", WINE, style="font-weight:bold")),
}


def save(name, box, body):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}"><style>{CSS}</style>{body}</svg>'
    (Path(__file__).parent / f"{name}.svg").write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    for name, body in FACES.items():
        save(name, "-80 -92 190 150", body)
    save("full_marks", "0 0 400 400", full_marks())
