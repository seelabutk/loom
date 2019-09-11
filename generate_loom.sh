#!/bin/bash

#$1

# $1 is the size as width:height, $2 is the initial video to be prepended to the object if provided

name=$RANDOM

#sleep 2;

if [ -z "$2" ]
then
    ffmpeg -y -framerate 30 -i images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p viewer/videos/temp.mp4
    mv viewer/videos/temp.mp4 viewer/videos/$name.mp4
else 
    # concatenate the initial video with this one
    mkdir prepend
    ffmpeg -i $2 -vf fps=30 prepend/%05d.png -hide_banner
	index=$(ls *.png | wc -l  | xargs -I{} echo {})

	extension=.png
	SAVEIFS=$IFS
	IFS=$(echo -en "\n\b")
	counter=$index
	for i in `ls *$extension`; do
		name=$(printf "%05d" $counter)
		mv images/$i images/$name$extension
		counter=$(( counter+1 ))
	done;
	IFS=$SAVEIFS

	mv prepend/*.png images/

    ffmpeg -y -framerate 30 -i images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p viewer/videos/temp.mp4
    #ls $2 viewer/videos/temp.mp4 | perl -ne 'print "file $_"' | ffmpeg -safe 0 -protocol_whitelist file,pipe -f concat -i - -c copy $name.mp4
fi

sed -i '' "s/src=\"videos\/[0-9]*\.mp4\"/src=\"videos\/$name.mp4\"/g" viewer/loom.html

#ffmpeg -y -framerate 30 -i parallel_images/%05d.png -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p  -vf scale=$1 viewer/videos/parallel_loom.mp4
