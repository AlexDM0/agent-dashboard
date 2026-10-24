"""The README graphics' layout: which dashboard views the director photographs, how the panels, window frames, terminal and
diagram are composed from them, and how the animated hero is assembled.

Usage: python3 compose.py base-jobs|pages|hero-gif|optimise|sheet <build folder>
"""
import html
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPOSITORY = os.path.dirname(HERE)

VIEWPORT_WIDTH = 1440
STOREFRONT_BOARD = '#/projects/example-storefront'

PANEL_WIDTH = 1280
PANEL_HEIGHT = 800
PANEL_SCALE = 1.5
WINDOW_WIDTH = 1120
WINDOW_TOP = 214
WINDOW_BAR_HEIGHT = 34
# The window runs this far past the panel's bottom edge, so it reads as standing on it rather than ending inside it.
WINDOW_OVERHANG = 40
WINDOW_CONTENT_HEIGHT = PANEL_HEIGHT - WINDOW_TOP - WINDOW_BAR_HEIGHT + WINDOW_OVERHANG
# Each view is photographed at the window's own proportions, so its whole height fills the panel window.
VIEWPORT_HEIGHT = round(WINDOW_CONTENT_HEIGHT * VIEWPORT_WIDTH / WINDOW_WIDTH)
FRAME_SCALE = 1.5

HERO_ANIMATION_FIRST_FRAME_MILLISECONDS = 900
HERO_ANIMATION_FRAME_MILLISECONDS = 260
HERO_ANIMATION_LAST_FRAME_MILLISECONDS = 3000
GIF_TRANSPARENT_INDEX = 255

PANELS = [
    {'name': 'panel-watch', 'theme': 'light', 'headline': 'Every project, live.',
     'subhead': 'Every repository agent-progress tracks: who is building, what is in review, and what is ready next.',
     'layers': [{'image': 'overview-light.png'}]},
    {'name': 'panel-fleet', 'theme': 'light', 'headline': 'The whole fleet in one table.',
     'subhead': 'Each crew, its slots and its queue on one line, and what needs you in a column beside them.',
     'layers': [{'image': 'fleet-light.png'}]},
    {'name': 'panel-board', 'theme': 'light', 'headline': 'Each board, one click away.',
     'subhead': 'The project’s own agent-progress page, with its crew, slots and run controls above it.',
     'layers': [{'image': 'board-light.png'}]},
    {'name': 'panel-chat', 'theme': 'dark', 'headline': 'Answer your agents in one place.',
     'subhead': 'Every orchestrator and product owner, the questions waiting for you, and the context behind each one.',
     'layers': [{'image': 'chat-dark.png'}]},
    {'name': 'panel-product-owner', 'theme': 'light', 'headline': 'File tickets by talking.',
     'subhead': 'Start a product owner beside the orchestrator; it files the tickets you agree on through the agent-progress CLI.',
     'layers': [{'image': 'crew-light.png'}]},
    {'name': 'panel-themes', 'theme': 'split', 'headline': 'Light or dark. Your call.',
     'subhead': 'One choice shared with every board it embeds: follow the system, or pick Light or Dark.',
     'layers': [{'image': 'overview-light.png'}, {'image': 'overview-dark.png', 'split': True}]},
]

FRAMES = [
    ('frame-overview-light', 'light', 'overview-light.png'),
    ('frame-overview-dark', 'dark', 'overview-dark.png'),
    ('frame-board-dark', 'dark', 'board-dark.png'),
]

PALETTES = {
    'light': {'background': 'linear-gradient(180deg,#F4F1EA 0%,#ECE7DC 100%)', 'headline': '#1D1D1F', 'subhead': '#5F5E5A',
              'windowBar': '#ECECEC', 'windowTitle': '#6E6E73', 'windowBorder': 'rgba(0,0,0,.12)'},
    'split': {'background': 'linear-gradient(115deg,#F4F1EA 50%,#1C1D22 50%)', 'headline': '#1D1D1F', 'subhead': '#5F5E5A',
              'windowBar': '#ECECEC', 'windowTitle': '#6E6E73', 'windowBorder': 'rgba(0,0,0,.14)'},
    'dark': {'background': 'linear-gradient(180deg,#26272E 0%,#151519 100%)', 'headline': '#F5F5F7', 'subhead': '#A1A1A6',
             'windowBar': '#2C2C31', 'windowTitle': '#98989D', 'windowBorder': 'rgba(255,255,255,.10)'},
}
# The split background's edge at 115deg, as the percentages where it crosses the top and bottom of the window's content box.
SPLIT_ANGLE_TANGENT = 0.4663
WINDOW_TITLE = 'agent-dashboard — 127.0.0.1:4710'
FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',Helvetica,Arial,sans-serif"
MONO_FONT = "'SF Mono',ui-monospace,Menlo,Consolas,monospace"

TERMINALS = {
    'terminal-setup': {'title': 'zsh — agent-dashboard', 'lines': [
        ('prompt', '~/development/agent-dashboard', './setup.sh'),
        ('blank',), ('bold', '1/4 Dependencies (bun install)'), ('ok', 'dependencies installed (bun install in ~/development/agent-dashboard)'),
        ('blank',), ('bold', '2/4 The pre-commit hook (git config core.hooksPath)'), ('ok', 'core.hooksPath set to .githooks'),
        ('blank',), ('bold', '3/4 The global agent-dashboard command (bun link)'), ('ok', 'agent-dashboard is on your PATH (~/.bun/bin/agent-dashboard)'),
        ('blank',), ('bold', '4/4 Where claude and agent-progress live (executables.json)'), ('ok', 'claude found at ~/.local/bin/claude'),
        ('ok', 'agent-progress found at ~/.bun/bin/agent-progress'),
        ('ok', 'recorded in ~/.agent-progress-monitor/agent-dashboard/executables.json, for a dashboard server started without them on PATH'),
        ('blank',), ('bold', 'Tooling ready.'),
    ]},
    'terminal-open': {'title': 'zsh — ~', 'lines': [
        ('prompt', '~', 'agent-dashboard'),
        ('plain', 'Started the dashboard server at http://127.0.0.1:4710'),
        ('prompt', '~', 'agent-dashboard status'),
        ('plain', 'The dashboard server runs at http://127.0.0.1:4710, its board pages at http://127.0.0.1:4711 (pid 48213, version 0.1.0).'),
        ('prompt', '~', 'agent-dashboard stop'),
        ('plain', 'Stopped the dashboard server at http://127.0.0.1:4710 (pid 48213).'),
    ]},
}
TERMINAL_WIDTH = 860
# A line longer than the window wraps under itself, so the window's height is measured from the page, not counted.
TERMINAL_MAXIMUM_HEIGHT = 900
TERMINAL_LINE_HEIGHT = 21
TERMINAL_PADDING = 18


def write_json(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as file:
        json.dump(content, file, indent=1)


def write_page(build, name, markup):
    path = f'{build}/pages/{name}.html'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as file:
        file.write(markup)
    return path


def window_scale():
    return PANEL_SCALE * WINDOW_WIDTH / VIEWPORT_WIDTH


def base_jobs(build):
    """The stills the director takes once the morning is replayed, and the template of each animation frame."""
    common = {'width': VIEWPORT_WIDTH, 'height': VIEWPORT_HEIGHT, 'scale': 2, 'waitMilliseconds': 1200}
    # Opens the chat window, then scrolls its conversation to the latest message, as a reader coming back to it sees it.
    open_chat = ("(async () => { document.querySelector('.ap-chat-toggle').click();"
                 " await new Promise((resolve) => setTimeout(resolve, 1000));"
                 " for (const element of document.querySelectorAll('[role=dialog] *')) {"
                 " if (/(auto|scroll)/.test(getComputedStyle(element).overflowY)) element.scrollTop = element.scrollHeight; }"
                 " return true; })()")
    jobs = []
    for theme in ['light', 'dark']:
        jobs.append({**common, 'name': f'overview-{theme}', 'route': '#/', 'colorScheme': theme, 'output': f'{build}/shots/overview-{theme}.png'})
        jobs.append({**common, 'name': f'fleet-{theme}', 'route': '#/fleet', 'colorScheme': theme, 'output': f'{build}/shots/fleet-{theme}.png'})
        jobs.append({**common, 'name': f'board-{theme}', 'route': STOREFRONT_BOARD, 'colorScheme': theme, 'waitMilliseconds': 3000,
                     'output': f'{build}/shots/board-{theme}.png'})
        jobs.append({**common, 'name': f'crew-{theme}', 'route': f'{STOREFRONT_BOARD}/crew/product-owner', 'colorScheme': theme, 'waitMilliseconds': 3000,
                     'output': f'{build}/shots/crew-{theme}.png'})
        jobs.append({**common, 'name': f'chat-{theme}', 'route': '#/', 'colorScheme': theme, 'actionScript': open_chat, 'settleMilliseconds': 1200,
                     'output': f'{build}/shots/chat-{theme}.png'})
    write_json(f'{build}/jobs/base.json', jobs)
    # The animation frames go straight into the hero panel's window, so they are taken at its scale.
    write_json(f'{build}/jobs/frame.json', {'name': 'frame', 'width': VIEWPORT_WIDTH, 'height': VIEWPORT_HEIGHT, 'scale': window_scale(),
                                            'colorScheme': 'light', 'localStorageEntries': {'agent-progress:theme': 'light'}, 'waitMilliseconds': 900})


def image_layer(layer_image, window_width):
    return f'<img src="../shots/{layer_image}" style="position:absolute;left:0;top:0;width:{window_width}px">'


def window_markup(content_height, layers_markup, bar_style='', title_style=''):
    return f'''<div class="window"><div class="bar" style="{bar_style}"><div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
<div class="title" style="{title_style}">{WINDOW_TITLE}</div></div>
<div class="content" style="height:{content_height}px">{layers_markup}</div></div>'''


PANEL_WINDOW_SHADOW = '0 24px 60px rgba(0,0,0,.22),0 6px 18px rgba(0,0,0,.10)'
FRAME_WINDOW_SHADOW = '0 22px 50px rgba(0,0,0,.20),0 5px 14px rgba(0,0,0,.08)'


def window_styles(palette, left, top, content_height, shadow=PANEL_WINDOW_SHADOW):
    return f'''.window{{position:absolute;left:{left}px;top:{top}px;width:{WINDOW_WIDTH}px;height:{content_height + WINDOW_BAR_HEIGHT}px;border-radius:12px;overflow:hidden;
  box-shadow:0 0 0 1px {palette['windowBorder']},{shadow}}}
.bar{{height:{WINDOW_BAR_HEIGHT}px;background:{palette['windowBar']};position:relative;text-align:center}}
.dots{{position:absolute;left:14px;top:11px;display:flex;gap:8px}}.dots i{{width:12px;height:12px;border-radius:50%;display:block}}
.title{{position:absolute;left:0;right:0;top:9px;font-size:13px;color:{palette['windowTitle']}}}
.content{{position:relative;overflow:hidden;background:#fff}}'''


def split_text(light, dark):
    return (f'background:linear-gradient(115deg,{light} 50%,{dark} 50%) fixed;-webkit-background-clip:text;'
            'background-clip:text;color:transparent')


def split_clip_polygon(content_top, content_height, window_left):
    """Where the panel background's diagonal crosses the window's content box, so the dark layer continues it."""
    centre_x, centre_y = PANEL_WIDTH / 2, PANEL_HEIGHT / 2

    def edge_x(y):
        return centre_x - SPLIT_ANGLE_TANGENT * (y - centre_y)

    top_percent = (edge_x(content_top) - window_left) / WINDOW_WIDTH * 100
    bottom_percent = (edge_x(content_top + content_height) - window_left) / WINDOW_WIDTH * 100
    return f'polygon({top_percent:.2f}% 0, 100% 0, 100% 100%, {bottom_percent:.2f}% 100%)'


def panel_page(panel):
    palette = PALETTES[panel['theme']]
    window_left = (PANEL_WIDTH - WINDOW_WIDTH) // 2
    content_top = WINDOW_TOP + WINDOW_BAR_HEIGHT
    layers = []
    for layer in panel['layers']:
        markup = image_layer(layer['image'], WINDOW_WIDTH)
        if layer.get('split'):
            markup = f'<div style="position:absolute;inset:0;clip-path:{split_clip_polygon(content_top, WINDOW_CONTENT_HEIGHT, window_left)}">{markup}</div>'
        layers.append(markup)
    is_split = panel['theme'] == 'split'
    headline_style = split_text('#1D1D1F', '#F5F5F7') if is_split else ''
    subhead_style = split_text('#5F5E5A', '#A1A1A6') if is_split else ''
    bar_style = 'background:linear-gradient(115deg,#ECECEC 50%,#2C2C31 50%) fixed' if is_split else ''
    title_style = split_text('#6E6E73', '#98989D') if is_split else ''
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:transparent}}
.panel{{position:relative;width:{PANEL_WIDTH}px;height:{PANEL_HEIGHT}px;border-radius:28px;overflow:hidden;background:{palette['background']};font-family:{FONT};text-align:center}}
.headline{{position:absolute;left:0;right:0;top:62px;font-size:50px;font-weight:600;letter-spacing:-0.022em;color:{palette['headline']}}}
.subhead{{position:absolute;left:140px;right:140px;top:136px;font-size:21px;line-height:1.38;color:{palette['subhead']}}}
{window_styles(palette, window_left, WINDOW_TOP, WINDOW_CONTENT_HEIGHT)}
</style></head><body><div class="panel">
<div class="headline" style="{headline_style}">{panel['headline']}</div>
<div class="subhead" style="{subhead_style}">{panel['subhead']}</div>
{window_markup(WINDOW_CONTENT_HEIGHT, ''.join(layers), bar_style, title_style)}
</div></body></html>'''


FRAME_BORDERS = {'light': 'rgba(0,0,0,.12)', 'dark': 'rgba(255,255,255,.12)'}


def frame_page(theme, image):
    palette = {**PALETTES[theme], 'windowBorder': FRAME_BORDERS[theme]}
    content_height = round(VIEWPORT_HEIGHT * WINDOW_WIDTH / VIEWPORT_WIDTH)
    canvas = (WINDOW_WIDTH + 80, content_height + WINDOW_BAR_HEIGHT + 80)
    markup = f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:transparent;font-family:{FONT}}}
{window_styles(palette, 40, 30, content_height, FRAME_WINDOW_SHADOW)}
</style></head><body>{window_markup(content_height, image_layer(image, WINDOW_WIDTH))}</body></html>'''
    return markup, canvas


def terminal_line_markup(line):
    kind = line[0]
    if kind == 'blank':
        return '<div>&nbsp;</div>'
    if kind == 'prompt':
        _, directory, command = line
        return f'<div><span style="color:#5AC8FA">{html.escape(directory)}</span> <span style="color:#30D158">%</span> {html.escape(command)}</div>'
    if kind == 'bold':
        return f'<div style="font-weight:700;color:#F5F5F7">{html.escape(line[1])}</div>'
    if kind == 'ok':
        return f'<div>&nbsp;&nbsp;<span style="color:#30D158">✔</span> {html.escape(line[1])}</div>'
    return f'<div>{html.escape(line[1])}</div>'


def terminal_page(terminal):
    lines = terminal['lines']
    canvas = (TERMINAL_WIDTH + 80, TERMINAL_MAXIMUM_HEIGHT)
    markup = f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;background:transparent;font-family:{FONT}}}
.canvas{{display:inline-block;padding:30px 40px 50px}}
.terminal{{width:{TERMINAL_WIDTH}px;border-radius:12px;overflow:hidden;background:#1C1C1E;
  box-shadow:0 0 0 1px rgba(255,255,255,.10),{FRAME_WINDOW_SHADOW}}}
.bar{{height:{WINDOW_BAR_HEIGHT}px;background:#2C2C2E;position:relative;text-align:center}}
.dots{{position:absolute;left:14px;top:11px;display:flex;gap:8px}}.dots i{{width:12px;height:12px;border-radius:50%;display:block}}
.title{{position:absolute;left:0;right:0;top:9px;font-size:13px;color:#98989D}}
.text{{padding:{TERMINAL_PADDING}px 20px;font:13px/{TERMINAL_LINE_HEIGHT}px {MONO_FONT};color:#D1D1D6;white-space:pre-wrap}}
.text div{{padding-left:3ch;text-indent:-3ch}}
</style></head><body><div class="canvas"><div class="terminal"><div class="bar"><div class="dots"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i></div>
<div class="title">{html.escape(terminal['title'])}</div></div>
<div class="text">{''.join(terminal_line_markup(line) for line in lines)}</div></div></div></body></html>'''
    return markup, canvas


def transparent_job(build, name, page_path, canvas, scale):
    width, height = canvas
    return {'html': page_path, 'output': f'{build}/images/{name}.png', 'width': width, 'height': height, 'scale': scale,
            'transparentBackground': True, 'waitMilliseconds': 300, 'clip': {'x': 0, 'y': 0, 'width': width, 'height': height}}


def pages(build):
    page_jobs = []
    for panel in PANELS:
        path = write_page(build, panel['name'], panel_page(panel))
        page_jobs.append(transparent_job(build, panel['name'], path, (PANEL_WIDTH, PANEL_HEIGHT), PANEL_SCALE))
    for name, theme, image in FRAMES:
        markup, canvas = frame_page(theme, image)
        page_jobs.append(transparent_job(build, name, write_page(build, name, markup), canvas, FRAME_SCALE))
    for name, terminal in TERMINALS.items():
        markup, canvas = terminal_page(terminal)
        terminal_job = transparent_job(build, name, write_page(build, name, markup), canvas, FRAME_SCALE)
        del terminal_job['clip']
        page_jobs.append({**terminal_job, 'clipSelector': '.canvas'})
    architecture = f'{REPOSITORY}/docs/images/architecture.svg'
    architecture_page = write_page(build, 'architecture', '<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block}</style></head>'
                                   f'<body><img src="/files{architecture}"></body></html>')
    page_jobs.append(transparent_job(build, 'architecture', architecture_page, svg_size(architecture), 2))
    icon_page = write_page(build, 'icon', '<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:224px;height:224px}</style></head>'
                           f'<body><img src="/files{REPOSITORY}/web/AppIcon512.png"></body></html>')
    page_jobs.append(transparent_job(build, 'icon', icon_page, (224, 224), 1))
    write_json(f'{build}/jobs/pages.json', page_jobs)


def svg_size(path):
    with open(path) as file:
        opening = file.read(400)
    width = int(opening.split('width="', 1)[1].split('"', 1)[0])
    height = int(opening.split('height="', 1)[1].split('"', 1)[0])
    return width, height


def assemble_hero_animation(build):
    """panel-watch.png with each animation frame laid into its window, the panel's rounded corners kept transparent."""
    panel = Image.open(f'{build}/images/panel-watch.png').convert('RGBA')
    window_left = round((PANEL_WIDTH - WINDOW_WIDTH) // 2 * PANEL_SCALE)
    content_top = round((WINDOW_TOP + WINDOW_BAR_HEIGHT) * PANEL_SCALE)
    content_size = (round(WINDOW_WIDTH * PANEL_SCALE), panel.height - content_top)
    frame_folder = f'{build}/hero-frames'
    frame_paths = sorted(os.path.join(frame_folder, name) for name in os.listdir(frame_folder) if name.endswith('.png'))
    composed = []
    for path in frame_paths:
        frame = Image.open(path).convert('RGBA')
        frame = frame.resize((content_size[0], round(frame.height * content_size[0] / frame.width)), Image.LANCZOS).crop((0, 0, *content_size))
        canvas = panel.copy()
        canvas.paste(frame, (window_left, content_top))
        canvas.putalpha(panel.getchannel('A'))
        composed.append(canvas)
    sampled = composed[::4] + [composed[-1]]
    montage = Image.new('RGB', (panel.width, panel.height * len(sampled)))
    for index, frame in enumerate(sampled):
        montage.paste(frame.convert('RGB'), (0, index * panel.height))
    # Median cut drops the rare colours (the status dots, the slot cells); octree keeps them.
    palette_source = montage.quantize(colors=GIF_TRANSPARENT_INDEX, method=Image.Quantize.FASTOCTREE)
    transparent = panel.getchannel('A').point(lambda alpha: 255 if alpha < 128 else 0)
    paletted = []
    for frame in composed:
        quantized = frame.convert('RGB').quantize(palette=palette_source, dither=Image.Dither.NONE)
        quantized.paste(GIF_TRANSPARENT_INDEX, mask=transparent)
        paletted.append(quantized)
    durations = ([HERO_ANIMATION_FIRST_FRAME_MILLISECONDS] + [HERO_ANIMATION_FRAME_MILLISECONDS] * (len(paletted) - 2)
                 + [HERO_ANIMATION_LAST_FRAME_MILLISECONDS])
    paletted[0].save(f'{build}/images/panel-watch.gif', save_all=True, append_images=paletted[1:], duration=durations, loop=0,
                     optimize=True, disposal=1, transparency=GIF_TRANSPARENT_INDEX)


def optimise(build):
    """Lossless recompression, so the PNG bytes depend on the pixels alone and an unchanged image stays unchanged in git."""
    for name in sorted(os.listdir(f'{build}/images')):
        if name.endswith('.png'):
            path = f'{build}/images/{name}'
            Image.open(path).save(path, optimize=True)


def contact_sheet(build):
    names = sorted(name for name in os.listdir(f'{build}/images') if name.endswith(('.png', '.gif')))
    thumbnail_width = 420
    thumbnails = []
    for name in names:
        image = Image.open(f'{build}/images/{name}').convert('RGBA')
        thumbnails.append((name, image.resize((thumbnail_width, max(1, round(image.height * thumbnail_width / image.width))))))
    columns = 4
    rows = [thumbnails[i:i + columns] for i in range(0, len(thumbnails), columns)]
    height = sum(max(image.height for _, image in row) + 20 for row in rows)
    sheet = Image.new('RGBA', (columns * (thumbnail_width + 20) + 20, height + 20), (150, 150, 150, 255))
    y = 20
    for row in rows:
        for column, (_, image) in enumerate(row):
            sheet.alpha_composite(image, (20 + column * (thumbnail_width + 20), y))
        y += max(image.height for _, image in row) + 20
    sheet.convert('RGB').save(f'{build}/contact-sheet.png')
    print(f'contact sheet of {len(names)} images: {build}/contact-sheet.png')


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    step, build_folder = sys.argv[1], os.path.abspath(sys.argv[2])
    steps = {'base-jobs': base_jobs, 'pages': pages, 'hero-gif': assemble_hero_animation, 'optimise': optimise, 'sheet': contact_sheet}
    if step not in steps:
        raise SystemExit(__doc__)
    steps[step](build_folder)
