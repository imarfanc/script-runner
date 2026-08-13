from __future__ import annotations

import json
import platform
import sys
from datetime import datetime


report = {
    "runtime": f"Python {platform.python_version()}",
    "executable": sys.executable,
    "platform": platform.platform(),
    "architecture": platform.machine(),
    "timestamp": datetime.now().astimezone().isoformat(timespec="seconds"),
}

print("\033[1;33mPython / uv runtime report\033[0m")
print(json.dumps(report, indent=2))
