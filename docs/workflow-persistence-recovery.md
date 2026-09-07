# Workflow persistence recovery limits

Versions are immutable. Saving uses an exclusive `.writer.lock`, a synced temporary version file, a create-only hard link to `vN.json`, and an atomic rename of a separately synced `current.json`.

Caught write errors clean up unpublished files and release the lock. Tests inject a pointer-rename failure and prove the old pointer and version remain unchanged. Concurrent saves fail rather than overwrite.

An operating-system process kill or power failure can bypass cleanup. Automatic stale-lock removal and automatic orphan promotion are deliberately not implemented. Do not treat an `EEXIST` error as permission to overwrite a file. Power-loss durability across every filesystem is not claimed.

If a writer was forcibly terminated:

1. Stop the recording service and any other writer using the workflow directory.
2. Back up the whole workflow directory before changing its contents.
3. Read `current.json`; validate the referenced `vN.json` with `parseWorkflow`, including matching workflow ID and version. If either is missing or inconsistent, preserve the directory for inspection.
4. Inspect `.writer.lock`, temporary files, and any unreferenced version. Preserve/quarantine interrupted files outside the workflow directory only after confirming no writer remains active and the version was never published. Never blindly delete every version above the pointer: later history/rollback support may legitimately retain such versions.
5. Remove only the confirmed stale lock after inspection. Retry saving, or record under a new workflow ID while keeping the original directory intact.

This is an explicit maintenance procedure, not an unattended recovery guarantee. A failed save must not be reported to the user as a saved Workflow.
