#!/bin/bash

#if [ "$#" -ne 3 ]; then
#    echo "Usage: ./encrypt <filename> <query> <pass>"
#    exit;
#fi
#
#mkdir -p temp
#mkdir -p temp/encryption
#
filename=$1
query=$2
pass=$3
#ffmpeg -i $filename temp/frame_%05d.jpg 
#cat config.json | 
#    jq -j '.. | 
#    select(.description?) | 
#    .frame_no,",",.description, "\n"' | 
#    grep $query | 
#    cut -d',' -f1 | 
#    xargs -I{} printf %05d"\n" {} > temp_frames.txt
#
#openssl enc -aes-256-cbc -pass pass:$pass -d -p -in "encrypted_"$filename -out "decrypted_"$filename
#ffmpeg -i "decrypted_"$filename temp/encryption/frame_%05d.jpg
#
#
count=1
for i in temp/encryption/*.jpg; do
    new_name=$(sed "$count""q;d" temp_frames.txt)
    old_name=$(echo $i | awk -F'/' '{print $NF}')
    cp temp/encryption/$old_name temp/frame_$new_name.jpg
    count=$(( count+1 ))
done;

#xargs -I{} sh -c 'openssl enc -aes-256-cbc -pass pass:$pass -d -p -in temp/frame_{}.enc -out temp/frame_{}.jpg;'

ffmpeg -y -framerate 30 -i temp/frame_%05d.jpg -c:v libx264 \
    -profile:v high -crf 20 -pix_fmt yuv420p $filename

