"""Package the explicit public runtime allowlist; never collect a workspace recursively."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent.parent
FILES = ['app/index.html', 'app/app.js', 'app/styles.css',
         'local/server.mjs', 'local/Start-PlanMap.cmd', 'local/Start-PlanMap.command',
         'local/README.md']

def package(output):
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'planmap-local-web.zip'
    with ZipFile(archive, 'w', ZIP_DEFLATED) as bundle:
        for name in FILES:
            info = ZipInfo('planmap-local-web/' + name, (2026, 10, 3, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if name.endswith('.command') else 0o100644) << 16
            info.compress_type = ZIP_DEFLATED
            content = (ROOT / name).read_bytes().replace(b'\r\n', b'\n')
            if name.endswith('.cmd'):
                content = content.replace(b'\n', b'\r\n')
            bundle.writestr(info, content)
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n', encoding='utf-8')
    return archive

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    print(package(parser.parse_args().output))
