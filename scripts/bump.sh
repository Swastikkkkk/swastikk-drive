#!/bin/sh
# Stamps every non-vendor script in index.html with a fresh ?v= so browsers (Cloudflare caches assets 4 h) load the new build.
v=$(date +%s)
sed -i -E 's#(src="assets/[a-z0-9-]+\.js)(\?v=[0-9]+)?"#\1?v='"$v"'"#g' index.html
