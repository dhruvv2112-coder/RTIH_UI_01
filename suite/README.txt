PUSHKARALU 2027 SUITE
=====================
One local server for all three RTIH prototypes, linked live:

  Dashboard      http://localhost:8080/dashboard/   (RTIH_UI_01, Command Centre)
  Field app      http://localhost:8080/field/       (RTIH_UI_02, staff & vendors)
  Pilgrim app    http://localhost:8080/pilgrim/     (RTIH_UI_03, pilgrims)
  Suite home     http://localhost:8080/             (links, phone QR codes, live event log)


START ON WINDOWS
----------------
1. Unzip this folder anywhere (for example Desktop\Pushkaralu-Suite).
   Unzip it fully; do not run it from inside the zip preview.
2. Double-click start.bat.
   - If Node.js is missing, start.bat installs it with winget (or opens
     nodejs.org). Then close the window and double-click start.bat again.
   - If Windows Firewall asks, tick "Private networks" and click Allow.
     That lets phones on the same Wi-Fi open the field and pilgrim apps.
3. Your browser opens the suite home page. Keep the black window open:
   it is the server, and it prints every live event.

To stop: close the black window, or press Ctrl+C in it.
Another port: open Command Prompt in this folder and run
    set PORT=8090 && start.bat

START ON macOS / LINUX
----------------------
    ./start.sh          (needs Node.js 18 or newer)


WHAT IS LIVE-LINKED
-------------------
Pilgrim SOS          -> critical alert on the dashboard (with chime)
Dashboard Dispatch   -> INCOMING DISPATCH on the field app (to Ramesh Kumar, ST-001)
Field accept/decline/note/escalate/complete -> dashboard alert updates
                     -> pilgrim SOS screen shows the responder, ETA, "accepted", "closed"
Field report / staff SOS -> new dashboard alerts
Dashboard emergency protocol -> warning on the pilgrim and field apps
Field "Go offline"   -> events wait in an outbox and sync on reconnect

The suite home page walks through the demo step by step.


NOTES
-----
- Works without internet. Only the web fonts load from Google; offline,
  the apps fall back to system fonts.
- Shared event log is saved in data\hub-state.json. "Clear event log" on
  the home page resets it.
- Each app also runs on its own (e.g. on Vercel). Without this server the
  live link switches off and the apps use their built-in simulations.
- No API keys are needed.
