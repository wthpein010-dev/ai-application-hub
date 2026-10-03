"""Run the real extracted launcher and browser acceptance from a path containing spaces."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
from zipfile import ZipFile

archive = Path(sys.argv[1]).resolve()
browser_test = Path(__file__).with_name('browser.mjs').resolve()
with tempfile.TemporaryDirectory(prefix='PlanMap paths with spaces ') as directory:
    destination = Path(directory).resolve()
    if sys.platform == 'darwin':
        # Apple's actual unzip restores the ZIP Unix mode; no chmod workaround.
        subprocess.run(['unzip', '-q', str(archive), '-d', str(destination)], check=True)
    else:
        with ZipFile(archive) as bundle:
            bundle.extractall(destination)
    app = destination / 'planmap-local-web'
    launcher = app / 'local' / ('Start-PlanMap.cmd' if os.name == 'nt' else 'Start-PlanMap.command')
    if sys.platform == 'darwin':
        assert launcher.stat().st_mode & 0o111, 'Extracted macOS launcher must remain executable'
        assert b'\r' not in launcher.read_bytes(), 'macOS launcher must have LF line endings'
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        port = probe.getsockname()[1]
    environment = {**os.environ, 'PLANMAP_PORT': str(port), 'PLANMAP_BASE_URL': f'http://127.0.0.1:{port}'}
    with tempfile.TemporaryFile(mode='w+') as log:
        if os.name == 'nt':
            # cmd needs an outer pair of quotes around a quoted script path.
            command = f'cmd.exe /d /s /c ""{launcher}""'
            process = subprocess.Popen(command, cwd=destination, env=environment, stdout=log, stderr=log,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            command = [str(launcher)] if sys.platform == 'darwin' else ['sh', str(launcher)]
            process = subprocess.Popen(command, cwd=destination, env=environment, stdout=log, stderr=log,
                                       start_new_session=True)
        try:
            deadline = time.monotonic() + 30
            while True:
                assert process.poll() is None, 'Launcher exited before startup'
                try:
                    with urlopen(environment['PLANMAP_BASE_URL'], timeout=1) as response:
                        assert response.status == 200
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise AssertionError('Extracted launcher did not start within 30 seconds')
                    time.sleep(0.1)
            if '--server-only' not in sys.argv[2:]:
                subprocess.run(['node', str(browser_test)], env=environment, check=True)
            print(f'Passed extracted launcher in space-containing path: {sys.platform}; {os.environ.get("RUNNER_ARCH", "local")}')
        finally:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
            elif process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
            log.seek(0)
            print(log.read())
