#!/bin/bash

# Generate favicon PNGs from SVG using ImageMagick
convert favicon.svg -resize 16x16 favicon-16.png
convert favicon.svg -resize 32x32 favicon-32.png
convert favicon.svg -resize 180x180 favicon-180.png
convert favicon.svg -resize 192x192 favicon-192.png
convert favicon.svg -resize 512x512 favicon-512.png

echo "All favicons generated!"
