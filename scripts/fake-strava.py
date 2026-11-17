"""Stand-in for Strava's API and for Supabase Auth, for local end-to-end tests only. Usage: python3 scripts/fake-strava.py [port]"""
import json, sys, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

TODAY = datetime.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else datetime.date.today()
def runs(athlete):
    out = []
    plan = [(2, 6.0, 400), (4, 8.0, 395), (6, 12.0, 420), (9, 5.0, 345), (11, 7.0, 405), (13, 11.0, 425), (16, 6.0, 400), (18, 8.0, 398), (20, 10.0, 422), (25, 6.0, 410), (27, 9.0, 425)]
    for i, (ago, km, pace) in enumerate(plan):
        d = TODAY - datetime.timedelta(days=ago)
        out.append({"id": athlete * 1000 + i, "name": f"Run {i}", "sport_type": "Run", "start_date_local": f"{d}T06:00:00Z", "distance": km * 1000,
                    "moving_time": int(km * pace), "elapsed_time": int(km * pace) + 60, "average_heartrate": 150, "max_heartrate": 178, "average_speed": 1000 / pace})
    out.append({"id": athlete * 1000 + 99, "name": "Ride", "sport_type": "Ride", "start_date_local": f"{TODAY}T06:00:00Z", "distance": 30000, "moving_time": 4000, "elapsed_time": 4000})
    return out

USERS = {}   # email -> {id, password, name}
DOCS = {}    # (owner, key) -> value, the stand-in for the Supabase `docs` table
def docq(u):
    q = parse_qs(u.query); return q.get("owner", ["eq."])[0][3:], (q.get("key", [None])[0] or "eq.")[3:] if "key" in q else None
def user_json(email): u = USERS[email]; return {"id": u["id"], "email": email, "user_metadata": {"name": u["name"]}}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, body, status=200):
        b = json.dumps(body).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(b)))
        self.send_header("X-RateLimit-Limit", "200,2000"); self.send_header("X-RateLimit-Usage", "3,10"); self.end_headers(); self.wfile.write(b)
    def athlete(self):
        return int(self.headers.get("Authorization", "Bearer acc-0").split("-")[-1])
    def auth_user(self):
        tok = self.headers.get("Authorization", "").replace("Bearer ", "")
        return next((e for e, u in USERS.items() if f"jwt-{u['id']}" == tok), None)
    def do_DELETE(self):
        u = urlparse(self.path)
        if u.path != "/rest/v1/docs" or self.headers.get("apikey") != "test-secret": return self.send({"message": "not found"}, 404)
        o, k = docq(u)
        for x in [x for x in DOCS if x[0] == o and (k is None or x[1] == k)]: del DOCS[x]
        self.send([])
    def do_PUT(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        e = self.auth_user()
        if urlparse(self.path).path == "/auth/v1/user" and e:
            USERS[e]["password"] = json.loads(raw)["password"]; return self.send(user_json(e))
        self.send({"message": "unauthorized"}, 401)
    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode()
        u = urlparse(self.path)
        if u.path.startswith("/auth/v1/") or u.path.startswith("/rest/v1/") or u.path.startswith("/realtime/"):
            j = json.loads(raw or "{}")
            if u.path == "/auth/v1/signup":
                if j["email"] in USERS: return self.send({"error_code": "user_already_exists", "msg": "User already registered"}, 422)
                USERS[j["email"]] = {"id": f"00000000-0000-4000-8000-{len(USERS):012d}", "password": j["password"], "name": j.get("data", {}).get("name", "")}
                return self.send({"access_token": f"jwt-{USERS[j['email']]['id']}", "user": user_json(j["email"])})
            if u.path == "/auth/v1/token":
                x = USERS.get(j.get("email"))
                if not x or x["password"] != j.get("password"): return self.send({"error_code": "invalid_credentials", "msg": "Invalid login credentials"}, 400)
                return self.send({"access_token": f"jwt-{x['id']}", "user": user_json(j["email"])})
            if u.path == "/auth/v1/recover": return self.send({})
            if u.path == "/rest/v1/docs":
                if self.headers.get("apikey") != "test-secret": return self.send({"message": "permission denied"}, 401)
                k = (j["owner"], j["key"]); new = k not in DOCS
                if new or "merge-duplicates" in self.headers.get("Prefer", ""): DOCS[k] = j["value"]
                return self.send([{"key": j["key"]}] if new and "representation" in self.headers.get("Prefer", "") else [], 201)
            if u.path == "/rest/v1/rpc/delete_own_account":
                e = self.auth_user()
                if not e: return self.send({"message": "unauthorized"}, 401)
                del USERS[e]; return self.send({})
            if u.path == "/realtime/v1/api/broadcast": return self.send({}, 202)
            return self.send({"message": "not found"}, 404)
        body = parse_qs(raw)
        if u.path == "/oauth/token":
            if body.get("client_secret", [""])[0].startswith("wrong"): return self.send({"message": "Bad Request"}, 400)
            aid = int((body.get("code") or body.get("refresh_token") or ["x-1"])[0].split("-")[-1])
            return self.send({"access_token": f"acc-{aid}", "refresh_token": f"ref-{aid}", "expires_at": 4102444800, "athlete": {"id": aid, "firstname": f"Runner{aid}", "lastname": "Test"}})
        if u.path == "/oauth/deauthorize": return self.send({"access_token": "gone"})
        self.send({"message": "not found"}, 404)
    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/rest/v1/docs":
            if self.headers.get("apikey") != "test-secret": return self.send({"message": "permission denied"}, 401)
            o, k = docq(u); return self.send([{"value": DOCS[(o, k)]}] if (o, k) in DOCS else [])
        if u.path == "/auth/v1/user":
            e = self.auth_user()
            return self.send(user_json(e)) if e else self.send({"message": "unauthorized"}, 401)
        if u.path == "/api/v3/athlete/activities":
            after = int(parse_qs(u.query).get("after", ["0"])[0])
            return self.send([r for r in runs(self.athlete()) if datetime.datetime.fromisoformat(r["start_date_local"].replace("Z", "+00:00")).timestamp() > after])
        if u.path.endswith("/streams"):
            n = 600
            return self.send({"time": {"data": list(range(0, n * 4, 4))}, "distance": {"data": [i * 10.0 for i in range(n)]}, "heartrate": {"data": [140 + i // 60 for i in range(n)]}, "velocity_smooth": {"data": [2.5] * n}, "moving": {"data": [True] * n}})
        if u.path.startswith("/api/v3/activities/"): return self.send({"id": int(u.path.split("/")[-1]), "laps": []})
        self.send({"message": "not found"}, 404)

HTTPServer(("127.0.0.1", int(sys.argv[1]) if len(sys.argv) > 1 else 4010), H).serve_forever()
