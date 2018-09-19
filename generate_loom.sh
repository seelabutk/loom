#!/bin/bash

#$1

name=$RANDOM
ffmpeg -y -framerate 30 -i images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p viewer/videos/$name.mp4
sed -i '' "s/src=\"videos\/[0-9]*\.mp4\"/src=\"videos\/$name.mp4\"/g" viewer/loom.html

#ffmpeg -y -framerate 30 -i parallel_images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p  -vf scale=$1 viewer/videos/parallel_loom.mp4
