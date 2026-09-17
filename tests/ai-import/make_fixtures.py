#!/usr/bin/env python3
"""Regenerate the binary fixtures used by tests/ai-import.

Stdlib for the PDF writer and the DOCX zip; Pillow (dev-only) for the JPEG that
goes inside the scanned-PDF fixture.

    python3 tests/ai-import/make_fixtures.py
"""

import io
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES = os.path.join(HERE, "fixtures")

PDF_LINES = [
    "STUDENT REGISTRATION FORM 2026",
    "Full name: ______________________",
    "Email address: ____________________",
    "Gender:   ( ) Male    ( ) Female",
    "Year of study:   [ ] 1  [ ] 2  [ ] 3  [ ] 4",
]


def write_pdf(path, objects):
    """Write a minimal but spec-valid PDF. `objects` maps number -> bytes."""
    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for number in sorted(objects):
        offsets[number] = len(out)
        out += b"%d 0 obj\n" % number + objects[number] + b"\nendobj\n"

    top = max(objects)
    xref_at = len(out)
    out += b"xref\n0 %d\n" % (top + 1)
    out += b"0000000000 65535 f \n"
    for number in range(1, top + 1):
        if number in offsets:
            out += b"%010d 00000 n \n" % offsets[number]
        else:
            out += b"0000000000 65535 f \n"
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (top + 1, xref_at)

    with open(path, "wb") as fh:
        fh.write(bytes(out))


def _esc(line):
    return line.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def build_text_pdf(path):
    """A normal PDF with a text layer (what a digital export looks like)."""
    ops = "BT /F1 14 Tf 72 720 Td " + " ".join(
        "(%s) Tj 0 -26 Td" % _esc(line) for line in PDF_LINES
    ) + " ET"
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        4: b"<< /Length %d >>\nstream\n" % len(ops.encode("latin-1")) + ops.encode("latin-1") + b"\nendstream",
        5: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    }
    write_pdf(path, objects)


def build_scan_pdf(path):
    """A PDF whose only content is an embedded JPEG — i.e. a scanned page."""
    from PIL import Image, ImageDraw  # dev-only dependency

    image = Image.new("RGB", (600, 300), "white")
    draw = ImageDraw.Draw(image)
    draw.text((20, 30), "Registration Form (scanned)", fill="black")
    draw.text((20, 90), "Full name: ______________", fill="black")
    draw.text((20, 150), "Gender: Male / Female", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=70)
    jpeg = buffer.getvalue()

    content = b"q 480 0 0 240 72 480 cm /Im0 Do Q"
    objects = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        3: (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /XObject << /Im0 6 0 R >> >> /Contents 4 0 R >>"
        ),
        4: b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
        6: (
            b"<< /Type /XObject /Subtype /Image /Width 600 /Height 300 "
            b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\nstream\n"
            % len(jpeg)
        )
        + jpeg
        + b"\nendstream",
    }
    write_pdf(path, objects)


CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOCUMENT = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:r><w:t>Course Feedback Form</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>Full name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>____________________</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>Gender</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Male   Female</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>How would you rate the course? (1-5)</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1 2 3 4 5</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
<w:p><w:r><w:t>Email address: ____________________</w:t></w:r></w:p>
<w:p><w:r><w:t>Upload your transcript: [ attach file ]</w:t></w:r></w:p>
</w:body>
</w:document>"""


def build_docx(path):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", ROOT_RELS)
        zf.writestr("word/document.xml", DOCUMENT)


def main():
    os.makedirs(FIXTURES, exist_ok=True)
    targets = [
        ("minimal.pdf", build_text_pdf),
        ("scanned.pdf", build_scan_pdf),
        ("minimal.docx", build_docx),
    ]
    for name, builder in targets:
        path = os.path.join(FIXTURES, name)
        builder(path)
        print("wrote {} ({} bytes)".format(name, os.path.getsize(path)))


if __name__ == "__main__":
    main()
