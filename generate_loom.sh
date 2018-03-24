#!/bin/bash

$1
ffmpeg -y -framerate 30 -i images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p viewer/videos/loom.mp4

#ffmpeg -y -framerate 30 -i parallel_images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p  -vf scale=$1 viewer/videos/parallel_loom.mp4
