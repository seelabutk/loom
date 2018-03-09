# Loom #

Loom is a technique for creating embeddable and interactive client-side-only visualizations. 

Summary of the method: 

1. Render all possible interactions and create a set of frames
1. Convert the frames to an mp4 using something like: `ffmpeg -framerate 30 -i around_%05d.png -s:v 512x512 -c:v libx264 -profile:v high -crf 20 -pix_fmt yuv420p output.mp4`
1. Devise a mapping between interaction parameters and the frames
1. Access the correct frames on the cliens side based on the interaction. 


Potential uses include:

1. Lightweight embeddable volume rendering for storytelling
1. Secure sharing of interactive data by limiting interactions
1. Lightweight client-side solution for highly interactive visualizations