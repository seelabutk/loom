#!/usr/bin/env python

import numpy as np
import cv2
import sys
import json

def clean_list(lst):
    tmp = lst.flatten()
    return tmp.reshape((tmp.shape[0]/2, 2)).tolist()

def to_dicts(lst):
    tmp = []
    for i in lst:
        tmp.append({"x": i[0], "y": i[1]})
    return {"points": tmp}

filename = sys.argv[1]

im = cv2.imread(filename)
imgray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
ret, thresh = cv2.threshold(imgray, 200, 255, 0)
img, contours, hierarchy = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

leaf_contours = []
leaf_contours_list = []
for i, info in enumerate(hierarchy[0]):
    #if info[2] == -1:
    if cv2.contourArea(contours[i]) > 60:
        leaf_contours.append(contours[i])
        leaf_contours_list.append(to_dicts(clean_list(contours[i])))

print json.dumps(leaf_contours_list)
cv2.drawContours(im, contours, -1, (0,0,0), 1)
cv2.imwrite("output.png", im)

exit(0)
