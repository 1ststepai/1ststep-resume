"""Execute the shipped Redis Lua with fakeredis[lua], using synthetic data only."""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
import fakeredis

script = json.load(sys.stdin)["script"]
store = fakeredis.FakeRedis(decode_responses=True)

def create(number, aliases=None, legacy="", idem=None, tenant="a"):
    run_id = f"run_{tenant}_{number}"
    keys = [f"run:{run_id}", f"idem:{tenant}:{idem or number}", "due", f"index:{tenant}", f"identity:{tenant}"]
    args = [json.dumps({"id": run_id}), run_id, "1000", "2592000", "86400", json.dumps(aliases or ["req_hash", "url_hash"]), legacy, "31536000"]
    return store.eval(script, len(keys), *keys, *args)

with ThreadPoolExecutor(max_workers=12) as executor:
    results = list(executor.map(create, range(24)))
assert sum(result[0] == "created" for result in results) == 1
winner = results[0][1]
assert all(result[1] == winner for result in results)
assert store.zcard("due") == store.zcard("index:a") == 1
assert store.ttl("identity:a") > 2592000
for key in store.scan_iter("idem:*"):
    store.delete(key)
assert create(100) == ["replayed", winner]
assert create(101, tenant="b")[0] == "created"

# Conflicting exact aliases never merge two records or enqueue a third one.
store.set("identity:c", json.dumps({"req_hash": "run_old", "url_hash": "run_other"}))
assert create(102, tenant="c") == ["history_required"]
assert store.zcard("index:c") == 0

# Reusing an HTTP request key for a different role cannot poison the identity map.
assert create(103, tenant="d", idem="shared")[0] == "created"
assert create(104, tenant="d", idem="shared", aliases=["different_req", "different_url"]) == ["history_required"]
assert "different_req" not in json.loads(store.get("identity:d"))

# Pre-upgrade matches backfill the ledger without new due work.
assert create(105, tenant="e", legacy="run_legacy") == ["replayed", "run_legacy"]
assert store.zcard("index:e") == 0
assert create(106, tenant="e") == ["replayed", "run_legacy"]
print("Production Lua passed: 24 concurrent requests, durable replay, alias conflicts, tenant separation, request-key collision, legacy backfill.")
