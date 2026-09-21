"""Generate Professor Amber, a ginger cat teacher mascot, as SVG: one face per verdict, and the exam proctor owl."""
from pathlib import Path

O, FUR, DARK, CREAM, PINK, IRIS = "#2B2320", "#D98A45", "#B5652A", "#F7EBDD", "#D9958A", "#8DA868"
NAVY, WINE, GOLD = "#33415C", "#8C2F39", "#C9A24B"
CSS = (
    ".o{stroke:#2B2320;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}"
    ".n{fill:none;stroke-linecap:round;stroke-linejoin:round}.t{stroke-width:1.5}.b{stroke-width:3}"
    "text{font-family:Georgia,'Times New Roman',serif}"
)


def mirror(body):
    return body + f'<g transform="scale(-1,1)">{body}</g>'


def t(x, y, size, s, color=O, anchor="middle", style=""):
    return f'<text x="{x}" y="{y}" font-size="{size}" style="fill:{color};text-anchor:{anchor};{style}">{s}</text>'


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


# Faces share one viewBox so swapping them never shifts the layout; the right margin holds the "?", "!!" and "A+" marks
FACES = {
    "face_happy": head("happy", "smile"),
    "face_thinking": head("look", "flat", t(82, -40, 34, "?", NAVY, style="font-weight:bold")),
    "face_stern": head("half", "frown", mirror('<path class="o n b" d="M-44,-34L-17,-25"/>')),
    "face_full_marks": head("happy", "smile", t(84, -36, 30, "A+", WINE, style="font-weight:bold") + f'<path class="n" stroke="{WINE}" stroke-width="2" d="M62,-28L106,-32M62,-22L106,-26"/>'),
    "face_surprised": head("wide", "o", t(82, -40, 34, "!!", WINE, style="font-weight:bold")),
}


OWL, OWL_DARK = "#8A6A4F", "#5E4632"
OWL_EYES = {
    "watch": f'<circle class="o" r="21" fill="#fff"/><circle r="13" fill="{GOLD}"/><circle r="7" fill="{O}"/><circle cx="-4" cy="-5" r="2.5" fill="#fff"/>',
    "side": f'<circle class="o" r="21" fill="#fff"/><circle cx="7" r="13" fill="{GOLD}"/><circle cx="11" r="7" fill="{O}"/><circle cx="7" cy="-5" r="2.5" fill="#fff"/>',
    "pass": '<circle class="o" r="21" fill="#fff"/><path class="o n b" d="M-11,3Q0,-10 11,3"/>',
    "fail": f'<circle class="o" r="21" fill="#fff"/><path fill="{GOLD}" d="M-13,-1A13,13 0 0 0 13,-1Z"/><path fill="{O}" d="M-6,-1A6,7 0 0 0 6,-1Z"/><path class="o n b" d="M-21,-2L21,-2"/>',
}


def owl(eyes="watch", brows="M-46,-40L-10,-24"):
    # Proctor owl, back to front: ear tufts, body, belly chevrons, wings, facial disc, eyes, brows, beak, mortarboard, stopwatch
    eye = lambda side: f'<g transform="translate({24 * side},-8)">{OWL_EYES[eyes]}</g>'
    return (
        mirror(f'<path class="o" fill="{OWL_DARK}" d="M-50,-30L-58,-74L-24,-48Z"/>')
        + f'<path class="o" fill="{OWL}" d="M0,-56C40,-56 62,-30 62,8C62,60 44,96 0,96C-44,96-62,60-62,8C-62,-30-40,-56 0,-56Z"/>'
        + f'<path class="o t" fill="{CREAM}" d="M0,30C24,30 34,50 30,74C26,90 12,94 0,94C-12,94-26,90-30,74C-34,50-24,30 0,30Z"/>'
        + f'<path class="n" stroke="{OWL_DARK}" stroke-width="3" d="M-14,64L-7,70L0,64L7,70L14,64M-10,78L-3,84L4,78L11,84"/>'
        + mirror(f'<path class="o" fill="{OWL_DARK}" d="M-62,10C-76,34-72,66-52,84C-46,60-48,34-54,14Z"/>')
        + f'<path class="o t" fill="#F3E3CC" d="M0,-40C30,-44 50,-28 50,-6C50,14 30,24 0,20C-30,24-50,14-50,-6C-50,-28-30,-44 0,-40Z"/>'
        + eye(-1) + eye(1)
        + mirror(f'<path class="o n b" d="{brows}"/>')
        + f'<path class="o t" fill="{GOLD}" d="M-7,8L7,8L0,24Z"/>'
        + f'<path class="o" fill="{NAVY}" d="M-44,-58L0,-72L44,-58L0,-46Z"/><path class="o n t" d="M30,-56L34,-38"/><circle class="o t" cx="34" cy="-35" r="4" fill="{WINE}"/>'
        + f'<path class="o n t" d="M-30,26Q0,44 30,26"/><circle class="o" cx="0" cy="44" r="11" fill="#fff"/><path class="o n t" d="M0,44L0,37M0,44L5,46M0,33L0,30"/>'
    )


PROCTOR = {
    "proctor_watching": owl("watch"),
    "proctor_peeking": owl("side"),
    "proctor_pass": owl("pass", "M-44,-34Q-27,-44-10,-34"),
    "proctor_fail": owl("fail", "M-46,-44L-8,-22"),
}


def save(name, box, body):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}"><style>{CSS}</style>{body}</svg>'
    (Path(__file__).parent / f"{name}.svg").write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    for name, body in FACES.items():
        save(name, "-80 -92 190 150", body)
    for name, body in PROCTOR.items():
        save(name, "-80 -82 160 184", body)
