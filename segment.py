#!/usr/bin/env python

import numpy as np
import cv2
import sys
import json

def close_polygons(polygons):
    for polygon in polygons:
        first_point = polygon['points'][0]
        polygon['points'].append(first_point)

    return polygons

def clean_list(lst):
    tmp = lst.flatten()
    return tmp.reshape((tmp.shape[0]/2, 2)).tolist()

def to_dicts(lst):
    tmp = []
    for i in lst:
        tmp.append({"x": i[0], "y": i[1]})
    return {"points": tmp}

if __name__ == '__main__':
    filename = sys.argv[1]
    sensitivity = int(sys.argv[2])
    sensitivity = sensitivity / 100.0 * 255

    im = cv2.imread(filename)
    imgray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
    ret, thresh = cv2.threshold(imgray, sensitivity, 255, cv2.THRESH_BINARY_INV)
    cv2.imwrite('thresh.png', thresh)
    img, contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_TC89_KCOS)

    filtered_contours = []
    filtered_contours_list = []
    for i, info in enumerate(hierarchy[0]):
        area = cv2.contourArea(contours[i])
        if area > 20:
            filtered_contours.append(contours[i])
            filtered_contours_list.append(to_dicts(clean_list(contours[i])))

    filtered_contours_list = close_polygons(filtered_contours_list)
    print json.dumps(filtered_contours_list)
    cv2.drawContours(im, contours, -1, (0,0,0), 1)
    cv2.imwrite("output.png", im)

    exit(0)
