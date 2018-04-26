#!/usr/bin/env python

import sys
import json

o = json.load(open(sys.argv[1]))

def dfi(target):
    if 'visited' in target:
        del target['visited']
    if 'child_visit_counter' in target:
        del target['child_visit_counter']
    if 'type' in target:
        del target['type']
    if 'rect' in target:
        target['rect'] = str(target['rect'])
    if 'children' in target:
        for t in target['children']:
            dfi(t)

dfi(o)
json.dump(o, open(sys.argv[2], 'w'))
