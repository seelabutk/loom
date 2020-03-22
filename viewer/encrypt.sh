#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: ./encrypt <filename> <query> <pass>"
    exit;
fi

mkdir -p temp
mkdir -p temp/encryption
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
    xargs -I{} printf %05d"\n" {} > temp_frames.txt

cat temp_frames.txt | xargs -I{} sh -c 'cp temp/frame_{}.jpg temp/encryption/;' 
cat temp_frames.txt | xargs -I{} sh -c 'convert temp/frame_{}.jpg -threshold 100% -alpha off temp/frame_{}.jpg'

ffmpeg -y -framerate 30 -i temp/encryption/frame_%05d.jpg -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p "forencryption_"$filename
openssl enc -aes-256-cbc -pass pass:$pass -p -in "forencryption_"$filename -out "encrypted_"$filename; 

#xargs -I{} sh -c 'openssl enc -aes-256-cbc -pass pass:$pass -p -in temp/frame_{}.jpg -out temp/frame_{}.enc; convert temp/frame_{}.jpg -threshold 100% -alpha off temp/frame_{}.jpg'

ffmpeg -y -framerate 30 -i temp/frame_%05d.jpg -c:v libx264 \
    -profile:v high -crf 20 -pix_fmt yuv420p $filename
