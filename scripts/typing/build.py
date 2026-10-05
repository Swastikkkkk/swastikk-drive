#!/usr/bin/env python3
"""Builds assets/typing-bank.js: the Type Faster sentence bank, grouped by difficulty.

Hand-written lines live in easy/medium/hard/expert.txt next to this script. The daily race's own pool
(assets/typing-sentences.js) is folded in too, each sentence filed under medium or hard by its punctuation
and numbers. A small seeded generator tops each level up with varied template sentences, so the bank
always holds at least 1000 different lines. Run:  python3 scripts/typing/build.py
"""
import json, os, random, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
def lines(name):
    with open(os.path.join(HERE, name + '.txt'), encoding='utf-8') as f:
        return [l.strip() for l in f if l.strip()]
bank = {k: lines(k) for k in ('easy', 'medium', 'hard', 'expert')}

# the daily pool, filed by how fiddly it is to type
src = open(os.path.join(ROOT, 'assets', 'typing-sentences.js'), encoding='utf-8').read()
for s in re.findall(r'^\s*"((?:[^"\\]|\\.)*)",?\s*$', src, re.M):
    s = json.loads('"' + s + '"')
    hard = re.search(r'[0-9;:()"\[\]&%$£€@#/]', s) or len(s) > 90
    bank['hard' if hard else 'medium'].append(s)

R = random.Random(20261005)
NAMES = ['Asha', 'Ben', 'Carla', 'Dev', 'Elena', 'Finn', 'Grace', 'Hugo', 'Isla', 'Jonah', 'Kira', 'Leo', 'Maya', 'Nico', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wen', 'Yusuf', 'Zara']
CITIES = ['Lisbon', 'Oslo', 'Cairo', 'Lima', 'Seoul', 'Perth', 'Denver', 'Nairobi', 'Kyoto', 'Dublin', 'Quebec', 'Milan', 'Austin', 'Hanoi', 'Bergen', 'Porto', 'Delhi', 'Zurich']
CARS = ['Aster', 'Volt GT', 'Phantom', 'Kestrel', 'Ridgeback', 'Mamba']
COLORS = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'silver', 'orange', 'purple', 'grey']
THINGS = ['car', 'van', 'bike', 'bus', 'truck', 'boat', 'kite', 'train', 'cart', 'jeep']
VERBS = ['went up the hill', 'stopped at the shop', 'turned at the corner', 'raced past the farm', 'crossed the old bridge',
         'waited by the gate', 'rolled down the lane', 'drove into the town', 'parked by the lake', 'went round the bend']
TIMES = ['at dawn', 'after lunch', 'in the rain', 'at night', 'on monday', 'in the snow', 'before tea', 'at noon', 'in the fog', 'on sunday']
PLACES = ['the coast road', 'the mountain pass', 'the old high street', 'the ring road', 'the river path', 'the forest track', 'the harbour wall', 'the desert highway']
WHY = ['to watch the sunrise', 'to buy fresh bread', 'to visit an old friend', 'to see the fireworks', 'to find a quiet beach', 'to test the new tyres', 'to get away for the weekend', 'to catch the last ferry']

def gen(level):
    if level == 'easy':
        return f"the {R.choice(COLORS)} {R.choice(THINGS)} {R.choice(VERBS)} {R.choice(TIMES)}"
    if level == 'medium':
        a, b = R.sample(CITIES, 2)
        return R.choice([
            f"{R.choice(NAMES)} drove from {a} to {b} {R.choice(WHY)}.",
            f"On the way to {a}, {R.choice(NAMES)} took {R.choice(PLACES)} {R.choice(WHY)}.",
            f"{R.choice(NAMES)} and {R.choice(NAMES)} shared the driving along {R.choice(PLACES)}.",
            f"The {R.choice(COLORS)} {R.choice(CARS)} looked perfect on {R.choice(PLACES)}."])
    if level == 'hard':
        m, s, ms = R.randint(1, 2), R.randint(0, 59), R.randint(0, 999)
        n, d = R.randint(2, 99), round(R.uniform(0.01, 9.99), 3)
        return R.choice([
            f"Car #{n}, the {R.choice(CARS)}, lapped in {m}:{s:02d}.{ms:03d}, {d}s off the pace.",
            f"{R.choice(NAMES)} drove {R.randint(120, 980):,} km in {R.randint(2, 14)} days, averaging {R.randint(55, 110)} km/h.",
            f"Stage {R.randint(1, 21)}: {R.choice(CITIES)} to {R.choice(CITIES)}, {round(R.uniform(80, 240), 1)} km; winner, {R.choice(NAMES)}.",
            f"The {R.choice(CARS)} costs {R.choice(['£', '$', '€'])}{R.randint(18, 95)},{R.randint(0, 999):03d} and does 0-100 km/h in {round(R.uniform(2.5, 9.9), 1)} s."])
    m, s, ms = R.randint(1, 2), R.randint(0, 59), R.randint(0, 999)
    return R.choice([
        f'lap[{R.randint(0, 63)}] = {{ driver: "{R.choice(NAMES)}", time: "{m}:{s:02d}.{ms:03d}", pit: {R.choice(["true", "false"])} }};',
        f'if (rpm > {R.randint(6, 12)}_{R.randint(0, 999):03d} && gear < {R.randint(4, 8)}) shiftUp(); // {R.choice(CARS)}',
        f'#{R.choice(NAMES)}{R.randint(10, 99)} @ {R.choice(CITIES)}: "P{R.randint(1, 20)} -> P{R.randint(1, 20)}!" ({R.randint(2, 98)}% fuel left)',
        f'SELECT * FROM laps WHERE car = \'{R.choice(CARS)}\' AND ms < {R.randint(60000, 99999)}; -- {R.choice(NAMES)}'])

TARGET = {'easy': 260, 'medium': 300, 'hard': 250, 'expert': 200}
for k, n in TARGET.items():
    seen, out = set(), []
    for s in bank[k]:
        if s.lower() not in seen: seen.add(s.lower()); out.append(s)
    tries = 0
    while len(out) < n and tries < 20000:
        tries += 1; s = gen(k)
        if s.lower() not in seen: seen.add(s.lower()); out.append(s)
    bank[k] = out
total = sum(len(v) for v in bank.values())
assert total >= 1000, total
with open(os.path.join(ROOT, 'assets', 'typing-bank.js'), 'w', encoding='utf-8') as f:
    f.write('/* Type Faster sentence bank, %d lines. Generated by scripts/typing/build.py: edit the .txt files there, not this. */\n' % total)
    f.write('window.TYPING_BANK=' + json.dumps(bank, ensure_ascii=False, indent=0).replace('\n', '') + ';\n')
print({k: len(v) for k, v in bank.items()}, 'total', total)
