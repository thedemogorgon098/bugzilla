import bleach
from markdown_it import MarkdownIt

md = MarkdownIt("commonmark", {"html": False, "linkify": True})

ALLOWED_TAGS = [
    "p", "br", "strong", "em", "ul", "ol", "li", "code", "pre", "blockquote",
    "h1", "h2", "h3", "h4", "a", "hr",
]
ALLOWED_ATTRS = {"a": ["href", "title", "rel"]}


def render_markdown(source: str) -> str:
    html = md.render(source or "")
    return bleach.clean(html, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRS, strip=True)
