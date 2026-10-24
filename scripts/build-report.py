"""Build the academic report from its editable French Markdown source.
Requires reportlab (isolated tooling environment, not a runtime dependency).
"""
from pathlib import Path
from html import escape
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf/Rapport_SmartHome_G25.pdf'
OUT.parent.mkdir(parents=True,exist_ok=True)
for name,file in [('Body','DejaVuSans.ttf'),('Bold','DejaVuSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+file))
styles={
 'title':ParagraphStyle('title',fontName='Bold',fontSize=27,leading=35,textColor=HexColor('#112c36'),spaceAfter=26),
 'heading':ParagraphStyle('heading',fontName='Bold',fontSize=20,leading=27,textColor=HexColor('#087f8c'),spaceAfter=22),
 'body':ParagraphStyle('body',fontName='Body',fontSize=10.5,leading=16.5,textColor=HexColor('#152536'),spaceAfter=15),
 'small':ParagraphStyle('small',fontName='Body',fontSize=9,leading=13,textColor=HexColor('#58697b'),spaceAfter=12),
}
source=(ROOT/'docs/RAPPORT.md').read_text()
blocks=re.split(r'\n\s*\n',source)
story=[];sections=0
for block in blocks:
    block=block.strip()
    if not block:continue
    if block.startswith('# '):
        story.append(Spacer(1,65));story.append(Paragraph(escape(block[2:].replace('—','-').replace('–','-')),styles['title']))
    elif block.startswith('## '):
        sections+=1
        if sections>1:story.append(PageBreak())
        story.append(Paragraph(escape(block[3:].replace('—','-').replace('–','-')),styles['heading']))
    else:story.append(Paragraph(escape(' '.join(block.splitlines()).replace('—','-').replace('–','-')),styles['body']))
    if block.startswith('Les tests Playwright utilisent'):
        capture=ROOT/'docs/captures/tableau-de-bord-bureau.png'
        if capture.exists():
            from PIL import Image as PILImage
            w,h=PILImage.open(capture).size
            width=455
            story.append(Image(str(capture),width=width,height=width*h/w))
            story.append(Paragraph('Capture authentique de l’interface locale. Référence visuelle : Figma 3:281.',styles['small']))
def footer(canvas,doc):
    canvas.setStrokeColor(HexColor('#d9e2ea'));canvas.line(44,43,551,43)
    canvas.setFont('Body',8);canvas.setFillColor(HexColor('#58697b'))
    canvas.drawString(44,29,'SmartHome G25 - UNIKIN - Prototype local, accès public à valider')
    canvas.drawRightString(551,29,str(doc.page))
doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=52,rightMargin=52,topMargin=48,bottomMargin=62,title='SmartHome G25 — Rapport technique du prototype',author='Groupe 25 — UNIKIN')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
