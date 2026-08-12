import zipfile, re

path = r"C:\Users\侯总\Downloads\鹊动体重管理评估干预系统——独立老年人体重管理&肌少症专项模块开发需求文档.docx"
out = []
z = zipfile.ZipFile(path)
xml = z.read('word/document.xml').decode('utf-8', errors='ignore')

def dec(s):
    return (s.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
             .replace('&quot;', '"').replace('&apos;', "'")
             .replace('&#10;', '\n').replace('&#13;', ''))

paras = re.split(r'<w:p[ >]', xml)
for p in paras:
    ts = re.findall(r'<w:t[^>]*>(.*?)</w:t>', p, re.DOTALL)
    line = dec(''.join(ts))
    if line.strip():
        out.append(line)

text = '\n'.join(out)
dst = r'C:\Users\侯总\WorkBuddy\2026-08-06-08-56-12\docx_text.txt'
with open(dst, 'w', encoding='utf-8') as f:
    f.write(text)
print("TOTAL CHARS:", len(text))
print("WROTE:", dst)
