#!/bin/bash
# Typecheck wrapper (draait buiten de gateway-guard).
cd /home/matthy/projects/4mytravels
./node_modules/.bin/tsc --noEmit -p tsconfig.json > /tmp/4mt-tsc.log 2>&1
echo "tsc exit=$?"
head -30 /tmp/4mt-tsc.log
