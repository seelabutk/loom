#!/usr/bin/env python

from sklearn.cluster import KMeans
import json
import numpy as np

GLOBAL_MIN = 100000
GLOBAL_MAX = -1
FILENAME = 'viewer/config.json'

def get_shape_bounds(shape):
    if shape['type'] == 'rect':
        min_x = shape['startX']
        min_y = shape['startY']
        max_x = shape['startX'] + shape['width']
        max_y = shape['startY'] + shape['height']
    elif shape['type'] == 'poly':
        min_x, min_y = GLOBAL_MIN, GLOBAL_MIN
        max_x, max_y = GLOBAL_MAX, GLOBAL_MAX
        for point in shape['points']:
            if point['x'] < min_x: min_x = point['x']
            if point['x'] > max_x: max_x = point['x']
            if point['y'] < min_y: min_y = point['y']
            if point['y'] > max_y: max_y = point['y']

    return min_x, min_y, max_x, max_y

def get_cluster_bounds(shapes):
    cluster_min_x, cluster_min_y = GLOBAL_MIN, GLOBAL_MIN 
    cluster_max_x, cluster_max_y = GLOBAL_MAX, GLOBAL_MAX 
    for shape in shapes:
        min_x, min_y, max_x, max_y = get_shape_bounds(shape)
        if min_x < cluster_min_x: cluster_min_x = min_x
        if max_x > cluster_max_x: cluster_max_x = max_x
        if min_y < cluster_min_y: cluster_min_y = min_y
        if max_y > cluster_max_y: cluster_max_y = max_y

    return cluster_min_x, cluster_min_y, cluster_max_x, cluster_max_y

# calculates p1 - p2
def sub(p1, p2):
    return (p1[0] - p2[0], p1[1] - p2[1])

if __name__ == '__main__':
    with open(FILENAME) as fp:
        data = json.load(fp)

    points = []
    for target in data['children']:
        center_x, center_y = 0, 0
        if target['shape']['type'] == 'rect':
            center_x = target['shape']['startX'] + target['shape']['width'] / 2.0
            center_y = target['shape']['startY'] + target['shape']['height'] / 2.0
        else:
            center_x, center_y = target['shape']['centerX'], target['shape']['centerY']

        points.append([center_x, center_y])

    K = range(1, 20)
    models = [KMeans(n_clusters=k) for k in K]
    scores = [model.fit(points).inertia_ for model in models]

    distances = []
    for i in range(len(scores)):
        last_i = len(scores) - 1
        point = (i, scores[i]) #p3
        line0 = (0, scores[0]) #p1
        line1 = (last_i, scores[last_i]) #p2
        distance = np.abs(np.cross(sub(line1, line0), \
                sub(line0, point))) / np.linalg.norm(sub(line1, line0))
        distances.append(distance)

    best_k = K[np.argmax(distances)]
    clustering = KMeans(n_clusters=best_k).fit(points)

    interaction_helpers = []

    for cluster_id in range(best_k):
        shapes = [target['shape'] for target in \
                np.array(data['children'])[np.where(clustering.labels_==cluster_id)]]
        interaction_helpers.append(list(get_cluster_bounds(shapes)))

    data['interaction_helpers'] = interaction_helpers

    with open(FILENAME, 'w') as fp:
        json.dump(data, fp)
