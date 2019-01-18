#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: ./encrypt <filename> <query> <pass>"
    exit;
fi

filename=$1
query=$2
pass=$3
ffmpeg -i $filename temp/frame_%05d.jpg 
cat config.json | 
    jq -j '.. | 
    select(.description?) | 
    .frame_no,",",.description, "\n"' | 
    grep $query | 
    cut -d',' -f1 | 
    xargs -I{} printf %05d"\n" {} |
    xargs -I{} sh -c 'openssl enc -aes-256-cbc -pass pass:$pass -p -in temp/frame_{}.jpg -out temp/frame_{}.enc; convert temp/frame_{}.jpg -threshold 100% -alpha off temp/frame_{}.jpg'

ffmpeg -y -framerate 30 -i temp/frame_%05d.jpg -c:v libx264 \
    -profile:v high -crf 20 -pix_fmt yuv420p $filename
