"""Run Unity EditMode tests and require a nonempty NUnit result file.

Unity 2022.3 on this Windows host sometimes keeps the editor process alive
after saving results. The XML is the test outcome; this helper closes only
the Unity process it started once shutdown has stalled.
"""

import argparse
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--unity", default=r"D:\Unity\2022.3.62f3c1\Editor\Unity.exe")
    parser.add_argument("--project", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--filter", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--timeout", type=int, default=240)
    args = parser.parse_args()

    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    result_path = output.with_suffix(".xml")
    log_path = output.with_suffix(".log")
    result_path.unlink(missing_ok=True)
    log_path.unlink(missing_ok=True)

    command = [
        args.unity, "-batchmode", "-nographics", "-projectPath", args.project,
        "-runTests", "-testPlatform", "EditMode", "-testFilter", args.filter,
        "-testResults", str(result_path), "-logFile", str(log_path),
    ]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + args.timeout
    try:
        while time.monotonic() < deadline:
            if result_path.exists():
                try:
                    root = ET.parse(result_path).getroot()
                except ET.ParseError:
                    time.sleep(0.5)
                    continue
                total = int(root.attrib.get("total", "0"))
                passed = int(root.attrib.get("passed", "0"))
                failed = int(root.attrib.get("failed", "0"))
                status = root.attrib.get("result", "Unknown")
                print(f"Unity EditMode: {passed}/{total} passed, {failed} failed, result={status}")
                if failed:
                    for case in root.findall(".//test-case[@result='Failed']"):
                        message = case.findtext("./failure/message") or ""
                        print(f"FAIL {case.attrib.get('name')}: {message.strip()}")
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                return 0 if total > 0 and failed == 0 and status == "Passed" else 1
            if process.poll() is not None:
                print(f"Unity exited {process.returncode} before writing test results; see {log_path}")
                return 1
            time.sleep(0.5)
        print(f"Unity test timeout after {args.timeout}s; see {log_path}")
        return 1
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
