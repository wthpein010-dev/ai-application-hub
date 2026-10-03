import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('package', Path(__file__).resolve().parents[1] / 'package.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)

class PackageTest(unittest.TestCase):
    def test_allowlist_checksum_and_mac_permissions(self):
        with tempfile.TemporaryDirectory(prefix='planmap-package-') as directory:
            archive = packager.package(directory)
            with ZipFile(archive) as bundle:
                self.assertEqual(sorted(bundle.namelist()), sorted('planmap-local-web/' + name for name in packager.FILES))
                command = bundle.getinfo('planmap-local-web/local/Start-PlanMap.command')
                self.assertEqual((command.external_attr >> 16) & 0o777, 0o755)
                bundle.extractall(Path(directory) / 'extracted')
                self.assertTrue((Path(directory) / 'extracted/planmap-local-web/app/app.js').is_file())
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            self.assertIn(digest, (Path(directory) / 'SHA256SUMS.txt').read_text())
            first = archive.read_bytes()
            self.assertEqual(packager.package(directory).read_bytes(), first)

if __name__ == '__main__':
    unittest.main()
