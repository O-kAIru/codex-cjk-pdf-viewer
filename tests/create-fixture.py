#!/usr/bin/env python3
"""Generate the public synthetic CJK PDF regression fixture.

Requires reportlab, Pillow, and pypdf. No network, app installation, or private
source file is used. Bitstream Vera Sans is read from ReportLab's package data;
its redistribution license is copied alongside the generated fixture.
"""
from pathlib import Path
from io import BytesIO
import hashlib,json,shutil
import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image
from pypdf import PdfReader

HERE=Path(__file__).resolve().parent
OUT=HERE/'fixtures'
JP_PAGES=[
 ['日本語表示テスト','これは表示確認用のサンプルです。','次の選択肢から選んでください。','青い丸','赤い四角','文字を選択して検索できます。'],
 ['二ページ目の表示確認','ページ移動と拡大表示を確認します。','漢字、ひらがな、カタカナを表示します。','表示できれば成功です。']]

def generate():
 OUT.mkdir(parents=True,exist_ok=True)
 font_dir=Path(reportlab.__file__).resolve().parent/'fonts'
 vera=font_dir/'Vera.ttf';license_src=font_dir/'bitstream-vera-license.txt'
 if not vera.is_file() or not license_src.is_file():raise FileNotFoundError('ReportLab Vera.ttf and its license are required')
 shutil.copyfile(license_src,OUT/'BITSTREAM-VERA-LICENSE.txt')
 pdfmetrics.registerFont(UnicodeCIDFont('HeiseiMin-W3'))
 pdfmetrics.registerFont(TTFont('FixtureEmbeddedLatin',str(vera)))
 path=OUT/'japanese-cid-multipage.pdf'
 c=canvas.Canvas(str(path),pagesize=(595.28,841.89),pageCompression=1,invariant=1)
 c.setTitle('Synthetic Japanese CID font regression fixture')
 c.setAuthor('Codex CJK PDF Viewer contributors')
 c.setSubject('Synthetic content only; standard Japanese CID font without ToUnicode')
 c.setCreator('tests/create-fixture.py')
 def japanese(text,x,y,size=15):c.setFont('HeiseiMin-W3',size);c.drawString(x,y,text)
 for index,lines in enumerate(JP_PAGES):
  c.setFillColorRGB(.08,.15,.25);japanese(lines[0],48,785,23)
  c.setStrokeColorRGB(.18,.45,.62);c.setLineWidth(2);c.line(48,766,548,766)
  for i,text in enumerate(lines[1:]):japanese(text,48,727-i*38,15)
  c.setFillColorRGB(.08,.15,.25);c.setFont('FixtureEmbeddedLatin',13)
  c.drawString(48,450,'EMBEDDED LATIN: ABC xyz 0123456789')
  c.drawString(48,423,'Equation: E = mc²; x² + y² = 1')
  c.setFont('Helvetica',12);c.drawString(48,396,'STANDARD LATIN: Helvetica, + - = ( )')
  # Self-authored vector shapes, independent of any PDF/font assets.
  c.setStrokeColorRGB(.12,.45,.7);c.setFillColorRGB(.87,.94,.99)
  c.circle(145,292,50,stroke=1,fill=1)
  c.setStrokeColorRGB(.8,.22,.2);c.setFillColorRGB(1,.91,.9)
  c.rect(260,242,100,100,stroke=1,fill=1)
  c.setStrokeColorRGB(.15,.2,.25);c.setLineWidth(.8)
  c.line(80,292,210,292);c.line(145,227,145,357)
  # Small generated raster marker tests image coexistence; no third-party image.
  im=Image.new('RGB',(16,16),'white')
  for x in range(16):
   for y in range(16):im.putpixel((x,y),((35,110,160) if (x//4+y//4)%2 else (245,190,45)))
  buf=BytesIO();im.save(buf,format='PNG');buf.seek(0)
  c.drawImage(ImageReader(buf),440,260,width=64,height=64)
  c.setFillColorRGB(.08,.15,.25);c.setFont('FixtureEmbeddedLatin',10)
  c.drawString(48,70,'Synthetic public test content. No user, customer, or educational source assets.')
  c.drawRightString(548,44,f'Page {index+1} / {len(JP_PAGES)}')
  c.showPage()
 c.save()
 r=PdfReader(path);assert len(r.pages)==2
 fonts=[]
 for f in r.pages[0]['/Resources']['/Font'].values():
  f=f.get_object();fonts.append({'baseFont':str(f.get('/BaseFont')),'subtype':str(f.get('/Subtype')),'encoding':str(f.get('/Encoding')),'hasToUnicode':'/ToUnicode' in f})
 cid=[f for f in fonts if f['subtype']=='/Type0'];assert len(cid)==1 and cid[0]['encoding']=='/UniJIS-UCS2-H' and not cid[0]['hasToUnicode']
 assert any(f['subtype']=='/TrueType' and f['hasToUnicode'] for f in fonts)
 expected={'fixture':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'pages':len(JP_PAGES),'japaneseFont':{'baseFont':'HeiseiMin-W3','encoding':'UniJIS-UCS2-H','ordering':'Japan1','embedded':False,'toUnicode':False},'expectedTextByPage':JP_PAGES,'expectedLatin':['EMBEDDED LATIN: ABC xyz 0123456789','STANDARD LATIN: Helvetica, + - = ( )'],'containsVectorShapes':True,'containsSyntheticImage':True,'fonts':fonts}
 (OUT/'expected.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(json.dumps({'output':str(path),'pages':len(JP_PAGES),'bytes':path.stat().st_size,'sha256':expected['sha256']},ensure_ascii=False))
if __name__=='__main__':generate()
