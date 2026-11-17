"""End-to-end check against a local server and the Strava stand-in. Usage: python3 scripts/smoke.py http://127.0.0.1:3111 YYYY-MM-DD"""
import re, sys, json, datetime, html, uuid
import urllib.request, urllib.parse, urllib.error, http.cookiejar

BASE, TODAY = sys.argv[1], datetime.date.fromisoformat(sys.argv[2])
fails = []
def check(name, cond, extra=""):
    print(("ok   " if cond else "FAIL ") + name + (f"  [{extra}]" if extra and not cond else ""))
    if not cond: fails.append(name)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None

class Browser:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(NoRedirect, urllib.request.HTTPCookieProcessor(self.jar))
    def req(self, path, data=None, headers=None):
        r = urllib.request.Request(BASE + path if path.startswith("/") else path, data=data, headers=headers or {})
        try: res = self.op.open(r)
        except urllib.error.HTTPError as e: res = e
        return res.status if hasattr(res, "status") else res.code, res.headers, res.read().decode("utf8", "replace")
    def get(self, path, follow=3):
        s, h, b = self.req(path)
        while s in (301, 302, 303, 307, 308) and follow:
            path = urllib.parse.urlparse(h["Location"]).path + ("?" + urllib.parse.urlparse(h["Location"]).query if urllib.parse.urlparse(h["Location"]).query else ""); follow -= 1
            s, h, b = self.req(path)
        return s, path, b
    def multipart(self, path, fields):
        bd = uuid.uuid4().hex
        body = b"".join(f'--{bd}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields) + f"--{bd}--\r\n".encode()
        return self.req(path, data=body, headers={"Content-Type": f"multipart/form-data; boundary={bd}"})
    def post(self, path, fields):
        return self.req(path, data=urllib.parse.urlencode(fields).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
    def signup(self, name, email, pw="correct horse 1"):
        s, h, _ = self.post("/api/auth/signup", {"name": name, "email": email, "password": pw}); return s, h.get("Location", "")
    def login(self, athlete, own=None):
        if own: s, h, _ = self.req("/api/strava/login", data=urllib.parse.urlencode(own).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
        else: s, h, _ = self.req("/api/strava/login")
        loc = h.get("Location", "")
        q = urllib.parse.parse_qs(urllib.parse.urlparse(loc).query)
        if "state" not in q: return s, loc
        s, h, _ = self.req("/api/strava/callback?" + urllib.parse.urlencode({"code": f"code-{athlete}", "state": q["state"][0], "scope": "read,activity:read_all"}))
        return s, h.get("Location", ""), q

def form_fields(page, marker):
    """Hidden server-action fields of the <form> that contains `marker`."""
    for m in re.finditer(r"<form[^>]*>(.*?)</form>", page, re.S):
        if marker in m.group(1):
            return [(html.unescape(n), html.unescape(v)) for n, v in re.findall(r'<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?', m.group(1))]
    return None

PW = "correct horse 1"
answers_for = lambda race: [("tz", "Asia/Jakarta"), ("race_key", "hm"), ("race_date", str(race)), ("race_name", "Smoke Half"), ("goal", "time"), ("goal_time", "2:10:00"),
           ("weekly_km", "22"), ("longest_km", "12"), ("experience", "regular"), ("can_run_30", "yes"), ("run_days", "1"), ("run_days", "3"), ("run_days", "5"), ("run_days", "6"), ("long_day", "6"),
           ("strength", "2"), ("equipment", "dumbbells"), ("niggles", "knee"), ("age", "31"), ("max_hr", ""), ("adult", "yes"), ("ack", "yes")]
race = TODAY + datetime.timedelta(days=16 * 7 + (6 - TODAY.weekday()) % 7)

a = Browser()
s, _, b = a.get("/"); check("landing page", s == 200 and "Create an account" in b and "Log in" in b)
s, _, b = a.get("/api/health"); check("health", s == 200 and json.loads(b)["storage_ok"] and json.loads(b)["storage"] == "file", b)
for p in ["/week", "/plan", "/settings", "/progress", "/start", "/session/x", "/log"]:
    s, h, _ = a.req(p); check(f"signed out {p} redirects home", s in (303, 307) and urllib.parse.urlparse(h["Location"]).path == "/", f"{s}")
s, _, b = a.get("/api/export"); check("export needs sign-in", s == 401)
for p in ["/about", "/privacy", "/terms", "/login", "/signup", "/forgot"]:
    s, _, b = a.get(p); check(f"public {p}", s == 200 and "RunBabyRun" in b)
s, h, _ = a.req("/api/strava/login"); check("Strava cannot be connected before signing in", "/login?error=signin" in h.get("Location", ""), h.get("Location"))

# Accounts
s, loc = a.signup("Ana", "not-an-email"); check("bad email is refused", "error=fields" in loc, loc)
s, loc = a.signup("Ana", "ana@example.com", "short"); check("short password is refused", "error=weak" in loc, loc)
s, loc = a.signup("Ana", "ana@example.com"); check("sign-up signs in and goes to the first step", s == 303 and loc.endswith("/start"), loc)
check("session cookie is httpOnly", any(c.name == "rbr_session" and c.has_nonstandard_attr("HttpOnly") for c in a.jar))
s, loc = Browser().signup("Imp", "ana@example.com"); check("same email cannot sign up twice", "error=exists" in loc, loc)
x = Browser(); s, h, _ = x.post("/api/auth/login", {"email": "ana@example.com", "password": "wrong password"}); check("wrong password is refused", "error=invalid" in h.get("Location", "") and not any(c.name == "rbr_session" for c in x.jar))
s, h, _ = x.post("/api/auth/login", {"email": "ana@example.com", "password": PW}); check("log in works", s == 303 and any(c.name == "rbr_session" for c in x.jar), h.get("Location"))
s, h, _ = x.post("/api/logout", {}); s, h, _ = x.req("/plan"); check("log out ends the session", s in (303, 307))
s, h, _ = x.post("/api/auth/forgot", {"email": "nobody@example.com"}); check("reset request does not reveal who has an account", "sent=1" in h.get("Location", ""))

# Path 1: Strava
s, path, b = a.get("/"); check("new runner is asked how to track runs", path.startswith("/start") and "Connect Strava" in b and "Continue without Strava" in b and "Welcome, Ana" in b, path)
s, loc, q = a.login(1)
check("authorize redirect carries scope and callback", q.get("scope") == ["read,activity:read_all"] and q.get("redirect_uri", [""])[0].endswith("/api/strava/callback") and q.get("client_id") == ["123"], str(q))
check("Strava callback connects the account", s == 303 and "connected=1" in loc, loc)
s, path, b = a.get("/"); check("then the questionnaire", path.startswith("/start") and s == 200 and 'name="race_key"' in b, path)
check("questionnaire pre-filled from Strava", 'name="weekly_km"' in b and re.search(r'name="longest_km"[^>]*value="12"', b) is not None and "fastest recent" in b, re.findall(r'name="(?:weekly|longest)_km"[^>]*', b)[:2].__str__())
answers = answers_for(race) + [("ref_kind", "strava")]
hidden = form_fields(b, 'name="race_key"')
check("questionnaire form has server-action fields", bool(hidden), str(hidden))
s, h, body = a.multipart("/start", (hidden or []) + [x for x in answers if x[0] != "adult"])
check("under-18 / unconfirmed is refused", s == 200 and "18 or older" in body, f"{s} {h.get('Location')}")
s, h, body = a.multipart("/start", (hidden or []) + answers)
check("plan is created", s == 303 and "/plan?new=1" in h.get("Location", ""), f"{s} {h.get('Location')} {body[:200]}")

s, _, b = a.get("/plan?new=1"); check("plan page", s == 200 and "Smoke Half" in b and "Week by week" in b and "Your plan is ready" in b)
weeks = len(re.findall(r'href="/week\?w=\d+"', b)); check("plan has 16–18 weeks", 16 <= weeks <= 18, str(weeks))
s, _, b = a.get("/"); check("today page", s == 200 and "to go" in b and "This week" in b and "Sync Strava" in b, b[:200])
s, _, week = a.get("/week"); check("week page", s == 200 and "Week 1 of" in week)
ids = re.findall(r'href="/(session|strength)/([\w-]+)"', week); check("week lists sessions", len(ids) >= 4, str(ids))
for kind, sid in ids[:6]:
    s, _, b = a.get(f"/{kind}/{sid}"); check(f"{kind} page {sid}", s == 200 and ("Skip this session" in b or "Mark as" in b or "How it went" in b or "Any pain" in b), b[:150])
    if kind == "session": check(f"no manual logging on a Strava account {sid}", "Did you do this run?" not in b)
for p, needle in [("/week?w=5", "Week 5 of"), ("/progress", "Weekly distance"), ("/settings", "Delete my account"), ("/library", "Exercise library"), ("/about", "Sources")]:
    s, _, b = a.get(p); check(f"page {p}", s == 200 and needle in b)
s, _, b = a.get("/session/nope"); check("unknown session is 404", s == 404)
s, _, b = a.get("/api/export"); ex = json.loads(b)
check("export has the runner's data and no secrets", s == 200 and ex["account"]["email"] == "ana@example.com" and ex["strava"]["athlete_id"] == 1 and len(ex["activities"]) == 11 and "token" not in b and "password" not in b and ex["profile"]["health"]["niggles"] == ["knee"])

# A second runner, connecting with their own API keys, sees nothing of the first.
c = Browser(); c.signup("Budi", "budi@example.com")
s, loc, q = c.login(2, own={"client_id": "98765", "client_secret": "abcdefabcdefabcdefabcdefabcdef12"})
check("own-keys login uses the runner's client id", s == 303 and "connected=1" in loc and q.get("client_id") == ["98765"], f"{loc} {q}")
s, path, b = c.get("/"); check("second runner starts at the questionnaire", path.startswith("/start") and 'name="race_key"' in b)
s, _, b = c.get("/api/export"); check("second runner's export is their own", json.loads(b)["strava"]["athlete_id"] == 2 and json.loads(b)["plan"] is None and json.loads(b)["strava"]["mode"] == "own")
sid = ids[0][1]; s, h, b = c.get(f"/{ids[0][0]}/{sid}"); check("second runner cannot open the first runner's session", s != 200 or "Smoke Half" not in b)
g = Browser(); g.signup("Gita", "gita@example.com"); s, loc = g.login(1)[:2]; check("one Strava account cannot be linked to two logins", "error=linked" in loc, loc)
d = Browser(); d.signup("Dewi", "dewi@example.com"); s, loc = d.login(3, own={"client_id": "98765", "client_secret": "wrongwrongwrongwrongwrongwrong12"})[:2]; check("wrong API keys are reported", "error=keys" in loc, loc)
s, h, _ = d.req("/api/strava/login", data=b"client_id=abc&client_secret=x", headers={"Content-Type": "application/x-www-form-urlencoded"}); check("malformed API keys are rejected", "error=bad_keys" in h.get("Location", ""))
s, h, _ = d.req("/api/strava/callback?code=code-1&state=forged&scope=read,activity:read_all"); check("callback without a matching state is refused", "error=state" in h.get("Location", ""))
f = Browser(); f.jar.set_cookie(http.cookiejar.Cookie(0, "rbr_session", "v1.1.1800000000." + "0" * 64, None, False, "127.0.0.1", False, False, "/", True, False, None, False, None, None, {}))
s, h, _ = f.req("/plan"); check("forged session cookie is refused", s in (303, 307))

# Path 2: no Strava, runs logged by hand
m = Browser(); m.signup("Made", "made@example.com")
s, _, b = m.get("/start"); hidden = form_fields(b, "Continue without Strava")
s, h, _ = m.multipart("/start", hidden or []); check("choosing manual tracking", s == 303 and h.get("Location", "").endswith("/start"), f"{s} {h.get('Location')}")
s, _, b = m.get("/start"); check("manual questionnaire asks for estimates", 'name="race_key"' in b and "best estimate" in b and "fastest recent" not in b, str(("best estimate" in b, [b[max(0,i.start()-80):i.start()+40] for i in re.finditer("Strava run", b)][:2])))
hidden = form_fields(b, 'name="race_key"')
s, h, body = m.multipart("/start", (hidden or []) + answers_for(race) + [("ref_kind", "none")]); check("manual plan is created", s == 303 and "/plan?new=1" in h.get("Location", ""), f"{s} {h.get('Location')} {body[:300]}")
s, _, b = m.get("/"); check("manual today page offers logging, not sync", s == 200 and "Log a run" in b and "Sync Strava" not in b)
s, _, b = m.get("/log"); hidden = form_fields(b, 'name="km"')
s, h, body = m.multipart("/log", (hidden or []) + [("date", str(TODAY)), ("km", "0"), ("time", "30:00"), ("hr", "")]); check("a nonsense distance is refused", "Enter the distance" in body, body[:200])
s, h, body = m.multipart("/log", (hidden or []) + [("date", str(TODAY + datetime.timedelta(days=1))), ("km", "5"), ("time", "30:00"), ("hr", "")]); check("a future run is refused", "not in the future" in body)
s, h, body = m.multipart("/log", (hidden or []) + [("date", str(TODAY)), ("km", "6,5"), ("time", "42:30"), ("hr", "148")]); check("a run is logged by hand", s in (200, 303) and "Run logged" in body, f"{s} {body[:200]}")
ex = json.loads(m.get("/api/export")[2]); acts = ex["activities"]
check("logged run is stored with its numbers", len(acts) == 1 and acts[0]["manual"] == "logged" and acts[0]["distance_m"] == 6500 and acts[0]["moving_time_s"] == 2550 and acts[0]["avg_hr"] == 148 and ex["strava"] is None, str(acts))
s, _, week = m.get("/week"); mids = [sid for kind, sid in re.findall(r'href="/(session|strength)/([\w-]+)"', week) if kind == "session" and sid[:10] <= str(TODAY)]
if mids:
    s, _, b = m.get(f"/session/{mids[0]}")
    if "How it went" in b: check("logged run is matched to today's session", "Remove this entry" in b and "View on Strava" not in b)
    else:
        hidden = form_fields(b, "Mark as done"); s, h, _ = m.multipart(f"/session/{mids[0]}", hidden or [])
        s, _, b = m.get(f"/session/{mids[0]}"); check("one-tap done", "Marked as done" in b and "Undo" in b, b[:200])
s, _, b = m.get("/progress"); check("manual progress page", s == 200 and "Weekly distance" in b)
s, _, b = m.get("/settings"); check("manual settings offer Strava", "Switch to Strava" in b and "You log runs yourself" in b)

# Switching: Strava runner disconnects and carries on by hand
s, _, b = c.get("/settings"); hidden = form_fields(b, "Disconnect Strava and log runs myself")
s, h, _ = c.multipart("/settings", hidden or []); check("disconnect Strava", s == 303 and "disconnected=1" in h.get("Location", ""), f"{s} {h.get('Location')}")
ex = json.loads(c.get("/api/export")[2]); check("Strava runs are removed, account stays", ex["strava"] is None and ex["activities"] == [] and ex["account"]["runs_from"] == "manual", str(ex)[:200])
s, loc = g.login(2)[:2]; check("a released Strava account can be linked again", "connected=1" in loc, loc)

# Delete account
s, _, b = a.get("/settings"); hidden = form_fields(b, 'name="confirm"')
s, h, _ = a.multipart("/settings", (hidden or []) + [("password", PW), ("confirm", "nope")]); check("delete needs confirmation", "error=confirm" in h.get("Location", ""), f"{s} {h.get('Location')}")
s, h, _ = a.multipart("/settings", (hidden or []) + [("password", "not my password"), ("confirm", "DELETE")]); check("delete needs the right password", "error=password" in h.get("Location", ""), f"{s} {h.get('Location')}")
s, h, _ = a.multipart("/settings", (hidden or []) + [("password", PW), ("confirm", "DELETE")]); check("account deleted", s == 303 and "deleted=1" in h.get("Location", ""), f"{s} {h.get('Location')}")
s, h, _ = a.req("/plan"); check("signed out after deletion", s in (303, 307))
s, h, _ = Browser().post("/api/auth/login", {"email": "ana@example.com", "password": PW}); check("the login itself is gone", "error=invalid" in h.get("Location", ""))
s, _, b = m.get("/api/export"); check("other runner unaffected by the deletion", s == 200 and json.loads(b)["account"]["email"] == "made@example.com")
s, loc = Browser().signup("Ana", "ana@example.com"); check("the email can sign up again afterwards", loc.endswith("/start"), loc)

print("\n" + ("ALL OK" if not fails else f"{len(fails)} FAILED: {fails}")); sys.exit(1 if fails else 0)
