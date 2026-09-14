# Uploaded by Studio after all project files are verified. Not a firmware boot.py.
import os
import sys
import json

def run(launch_id, nonce):
    prefix = "\x1eSTUDIO:" + nonce + ":"
    def state(value, message=""):
        print(prefix + json.dumps({"launchId": launch_id, "state": value, "message": message}))
    os.chdir("/")
    for path in ("/", "/lib"):
        if path not in sys.path:
            sys.path.insert(0, path)
    try:
        with open("/__main__.py", "r") as source:
            code = compile(source.read(), "/__main__.py", "exec")
        namespace = {"__name__": "__main__", "__file__": "/__main__.py"}
        state("running")
        exec(code, namespace, namespace)
        state("completed")
    except KeyboardInterrupt as error:
        sys.print_exception(error)
        state("stopped", "KeyboardInterrupt")
    except SystemExit as error:
        if not error.args or error.args[0] in (None, 0):
            state("completed")
        else:
            sys.print_exception(error)
            state("failed", str(error))
    except BaseException as error:
        sys.print_exception(error)
        state("failed", str(error))

