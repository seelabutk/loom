#!/usr/bin/env python

import os
import sys
import mss
import mss.tools
import json
import random
from time import sleep
from pynput.mouse import Button, Controller
from PIL import Image
from PIL import ImageChops
import numpy as np

linear_counter = 0
BREAK_DFI = False

# note: screenshot increments linear_counter if it saves
def screenshot(window, save=True):
    global linear_counter
    with mss.mss() as sct:
        monitor = {'top': window['y'], 'left': window['x'], \
                'width': window['width'], 'height': window['height']}
        img = sct.grab(monitor)
        if save:
            mss.tools.to_png(img.rgb, img.size, output='images/' + \
                    str(linear_counter).zfill(5) + '.png')
            linear_counter += 1
        else:
            return Image.frombytes('RGB', img.size, img.rgb)

def random_select():
    sleep(2)
    mouse = Controller()
    position = mouse.position
    for x in range(100):
        x = random.randint(391, 391 + 664)
        y = random.randint(174, 174 + 357)
        mouse.position = (x, y)
        sleep(0.2)

def parallel_clicker(window, target, click=True):
    global linear_counter 
    sleep(0.5)
    mouse = Controller()
    mouse.position = (window['x'] + target['rect']['x'] + target['rect']['width'] / 2, \
            window['y'] + target['rect']['y'] + target['rect']['height'] / 2)
    sleep(0.1)
    base_img = screenshot(window, False)
    mouse.click(Button.left)
    sleep(1)
    img = screenshot(window, False)
    
    diff = ImageChops.difference(img, base_img)
    diff_np = np.array(diff)
    img_np = np.array(img)
    orig_color = (0, 0, 0)
    replacement_color = (255, 0, 255) # magenta
    img_np[(diff_np == orig_color).all(axis=-1)] = replacement_color
    result = Image.fromarray(img_np, mode='RGB')

    filename = "images/" + str(linear_counter).zfill(5) + ".png"
    with open(filename, 'w') as fp:
        result.save(fp)

    linear_counter += 1
    

def clicker(window, target, click=True):
    sleep(0.5)
    mouse = Controller()
    mouse.position = (window['x'] + target['rect']['x'] + target['rect']['width'] / 2, \
            window['y'] + target['rect']['y'] + target['rect']['height'] / 2)
    sleep(0.1)
    if click == True:
        mouse.click(Button.left)
    screenshot(window)

def arcball(window, target, helper):
    sleep(2)
    mouse = Controller()
    position = (window['x'] + target['rect']['x'] + target['rect']['width'] / 2, \
            window['y'] + target['rect']['y'] + target['rect']['height'] / 2)
    short_delay = 0.1
    pitch = 20
    mouse.position = position
    sleep(0.1)
    mouse.click(Button.left)

    for x in range(1, 26):
        print position
        mouse.position = position
        sleep(0.5)
        mouse.press(Button.left)
        for i in range(pitch / 2):
            mouse.position = (position[0], position[1] + i * 16)
            sleep(short_delay)
        mouse.release(Button.left)

        sleep(1)
        mouse.position = position
        sleep(0.1)
        mouse.press(Button.left)
        for i in range(pitch):
            mouse.position = (position[0], position[1] - i * 16)
            sleep(short_delay)
            screenshot(window) 
        mouse.release(Button.left)

        # reset functionality
        # move mouse to helper
        # click helper 
        # move back
        sleep(0.5)
        mouse.position = (window['x'] + helper['rect']['x'] + helper['rect']['width'] / 2, \
                window['y'] + helper['rect']['y'] + helper['rect']['height'] / 2)
        sleep(0.5)
        mouse.click(Button.left)
        sleep(0.5)
        mouse.position = position

        sleep(1)
        mouse.position = position
        sleep(0.1)
        mouse.press(Button.left)
        #for i in range(5):
        mouse.position = (position[0] + x * (43), position[1])
        sleep(short_delay)
        sleep(0.5)
        mouse.release(Button.left)
        sleep(1)

def isLeaf(target):
    if 'children' not in target or len(target['children']) == 0:
        return True
    return False

# pre-order traversal
def dfi(configs, target, helpers):
    print 'calling dfi for ', target['name']
    global linear_counter
    global BREAK_DFI

    if BREAK_DFI == True:
        return False

    if 'child_visit_counter' not in target:
        target['child_visit_counter'] = 0

    if 'visited' not in target and target['name'] == 'root':
        # first time we're visiting the root, let's take a picture
        target['frame_no'] = linear_counter
        screenshot(configs['window'])

    # visit the node first 
    # if the target has not been visited yet or if it's a non leaf node, then visit it
    if ('visited' not in target or not isLeaf(target)) and \
            ('children' not in target or \
            target['child_visit_counter'] != len(target['children'])):
        target['visited'] = 1

        if target['name'] != 'root':
            #MOA::take an empty screenshot for the root
            is_leaf = isLeaf(target)
            if target['type'] == 'parallel' and target['actor'] == 'button':
                target['frame_no'] = linear_counter
                parallel_clicker(configs['window'], target, True)
                print 'parallel click'
                sleep(0.5)

            if target['type'] == 'linear' and target['actor'] == 'arcball':
                helper = None
                for temp in helpers:
                    if temp['type'] == 'helper' and temp['actor'] == 'arcball-reset':
                        helper = temp
                target['frame_no'] = linear_counter
                arcball(configs['window'], target, helper)

            elif target['type'] == 'linear' and target['actor'] == 'button':
                target['frame_no'] = linear_counter
                clicker(configs['window'], target, True)
                sleep(0.5)

            elif target['type'] == 'linear' and target['actor'] == 'hover':
                target['frame_no'] = linear_counter
                clicker(configs['window'], target, False)
                sleep(0.5)

    if 'children' in target:
        if 'child_visit_counter' not in target:
            target['child_visit_counter'] = 0

        for i, _ in enumerate(target['children']):
            if target['child_visit_counter'] != len(target['children']):
                feedback = dfi(configs, target['children'][i], helpers)
                print 'Feedback', feedback
                if feedback == True:
                    target['child_visit_counter'] += 1
                print target['child_visit_counter'], len(target['children'])
                if isLeaf(target['children'][i]) and target['child_visit_counter'] == len(target['children']):
                    BREAK_DFI = True
                    return True 
                elif target['child_visit_counter'] == len(target['children']):
                    return True
                if BREAK_DFI == True:
                    break

    if isLeaf(target):
        return True

    return False

# subsequent pre-order traversals from the root
def interact(configs, helpers):
    global BREAK_DFI
    configs['child_visit_counter'] = 0
    while configs['child_visit_counter'] != len(configs['children']):
        BREAK_DFI = False
        feedback = dfi(configs, configs, helpers)
        print feedback, 'from root'
    return configs


def extractHelpers(configs):
    helpers = []
    for i, _ in enumerate(configs['children']):
        if configs['children'][i]['type'] == 'helper':
            helpers.append(configs['children'][i].copy())

    configs['children'] = [x for x in configs['children'] if x['type'] != 'helper']
    return configs, helpers

if __name__ == '__main__':
    # clear previous images
    os.system("rm images/*.png");

    config_filename = sys.argv[1]
    configs = {}
    with open(config_filename) as fp:
        configs = json.load(fp)

    # remove helpers from the targets and handle them in a separate list
    # this is so that they don't interfere with the DFI function and
    # the child_visit_counter 
    configs, helpers = extractHelpers(configs)
    configs = interact(configs, helpers)

    with open(config_filename, 'w') as fp:
        json.dump(configs, fp)


