import re

# only matches our own extraction output: header row, |---|---| row, then data rows
TABLE_BLOCK_RE = re.compile(
    r"(?P<block>"
    r"^\|.*\|[ \t]*\n"
    r"^\|(?:[ \t]*:?-{3,}:?[ \t]*\|)+[ \t]*\n"
    r"(?:^\|.*\|[ \t]*\n?)*"
    r")",
    re.MULTILINE,
)


def split_prose_and_tables(text):
    segments = []
    last_end = 0
    for match in TABLE_BLOCK_RE.finditer(text):
        start, end = match.span()
        if start > last_end:
            segments.append({"type": "prose", "text": text[last_end:start]})
        segments.append({"type": "table", "text": match.group("block").rstrip("\n")})
        last_end = end

    if last_end < len(text):
        segments.append({"type": "prose", "text": text[last_end:]})
    if not segments:
        segments.append({"type": "prose", "text": text})

    return segments
