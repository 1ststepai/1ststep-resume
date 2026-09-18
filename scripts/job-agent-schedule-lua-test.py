"""Run the actual admission Lua; uses the existing development fakeredis[lua] setup."""
import json
import re
from pathlib import Path
import fakeredis

source = (Path(__file__).parent.parent / 'lib/job-agent-run-store.js').read_text()
script = re.search(r'const CREATE_SCRIPT = `([\s\S]*?)`;', source).group(1)

for case in ['active', 'paused', 'edited', 'deleted', 'reclaimed', 'expired']:
    store = fakeredis.FakeRedis(decode_responses=True)
    keys = ['run:new', 'idem:tenant:day', 'due', 'index:tenant', 'schedule:tenant']
    seconds, micros = store.time()
    deadline = seconds * 1000 + micros // 1000 + 120_000
    schedule = {'status': 'active', 'leaseTokenHash': 'owner', 'version': 2, 'leaseUntil': 'bound-deadline'}
    args = ['{}', 'run:new', '1000', '2592000', '86400', 'owner', '2', 'bound-deadline', str(deadline)]
    if case == 'paused':
        schedule['status'] = 'paused'
    if case == 'edited':
        schedule['version'] = 3
    if case == 'reclaimed':
        schedule['leaseTokenHash'] = 'new-owner'
    if case == 'expired':
        args[8] = '1'
    if case != 'deleted':
        store.set(keys[4], json.dumps(schedule))
    result = store.eval(script, len(keys), *keys, *args)
    if case == 'active':
        assert result == ['created', 'run:new']
        assert store.eval(script, len(keys), *keys, *args) == ['replayed', 'run:new']
        assert store.zcard('due') == store.zcard('index:tenant') == 1
        # A replay cannot authorize a paused worker either.
        schedule['status'] = 'paused'
        store.set(keys[4], json.dumps(schedule))
        assert store.eval(script, len(keys), *keys, *args) == ['schedule_lease_lost']
    else:
        assert result == ['schedule_lease_lost'], case
        assert not any(store.exists(key) for key in keys[:4]), case

# Interactive runs retain the existing four-key contract.
store = fakeredis.FakeRedis(decode_responses=True)
assert store.eval(script, 4, *keys[:4], *args[:5]) == ['created', 'run:new']
print('Actual Redis Lua: schedule fencing, no partial writes, replay, and interactive compatibility passed.')
